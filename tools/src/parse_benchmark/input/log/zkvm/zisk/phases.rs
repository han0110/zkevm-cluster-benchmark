//! Translates parsed zisk jobs into the generic model, splitting phase events into worker windows.
//!
//! The preset orders the phases input, emulation, commit, prove, aggregate. A phase1 finish event
//! splits into the input, emulation, and commit windows, a phase2 finish gives the prove window, and
//! the aggregate window is bounded by the aggregator worker log with a coordinator phase3 fallback
//! and attached only to the aggregator.

use std::collections::{BTreeMap, BTreeSet};

use crate::parse_benchmark::input::log::{
    Log, LogNode, LogStatus, NodeEnd, Ts, secs_to_ms,
    zkvm::zisk::{
        coordinator::{Phase1Event, Phase2Event, RawJob},
        worker::{AggBounds, JobStages, WorkerStages},
    },
};

/// The phase slots in the zisk preset order.
const INPUT: usize = 0;
const EMULATION: usize = 1;
const COMMIT: usize = 2;
const PROVE: usize = 3;
const AGGREGATE: usize = 4;
const PHASE_COUNT: usize = 5;

/// Builds the generic log for one parsed zisk job.
///
/// A clean job takes its per-node windows from the coordinator's phase-finish events. An incomplete
/// job has none, so its windows are reconstructed from the worker logs' sub-phase markers and
/// clipped to where each node crashed or was cancelled, recovering the partial timeline the
/// coordinator alone cannot show.
pub fn build_log(raw: &RawJob, agg: Option<&AggBounds>, stages: Option<&JobStages>) -> Log {
    let mut meta = BTreeMap::new();
    if let Some(v) = raw.input_bytes {
        meta.insert("input_size".to_string(), v.into());
    }
    if let Some(v) = raw.instances {
        meta.insert("instances".to_string(), v.into());
    }
    if let Some(v) = raw.steps {
        meta.insert("steps".to_string(), v.into());
    }

    let nodes = if raw.status == LogStatus::Success {
        worker_nodes(raw, aggregate_window(raw, agg))
    } else {
        crash_nodes(raw, stages)
    };

    Log {
        id: raw.id.clone(),
        status: raw.status,
        t_start: raw.t_start,
        t_end: raw.t_end,
        duration_s: raw.duration_s,
        meta,
        nodes,
        participants: participants(raw, stages),
    }
}

/// The node ids that took part in a job, the union of every source that names a worker, so a node
/// missing from the worker stages, coordinator phase events, and crash and cancel lines alike did
/// not work the job.
fn participants(raw: &RawJob, stages: Option<&JobStages>) -> Vec<String> {
    let mut set: BTreeSet<&str> = BTreeSet::new();
    if let Some(map) = stages {
        set.extend(map.keys().map(String::as_str));
    }
    set.extend(raw.p1.iter().map(|e| e.worker.as_str()));
    set.extend(raw.p2.iter().map(|e| e.worker.as_str()));
    if let Some(agg) = raw.aggregator.as_deref() {
        set.insert(agg);
    }
    set.extend(raw.node_ends.iter().map(|(worker, _, _)| worker.as_str()));
    set.into_iter().map(String::from).collect()
}

/// Builds per-node records for an incomplete job from the worker sub-phase markers.
///
/// Each participating node gets its reconstructed windows clipped to its end, the crash or cancel
/// moment when known and the job's terminal time otherwise. A node is emitted only when it has a
/// window or an end marker.
fn crash_nodes(raw: &RawJob, stages: Option<&JobStages>) -> Vec<LogNode> {
    let mut ends: BTreeMap<&str, NodeEnd> = BTreeMap::new();
    for (worker, ts, kind) in &raw.node_ends {
        ends.entry(worker.as_str()).or_insert(NodeEnd {
            at_ms: ts.epoch_ms(),
            kind: *kind,
        });
    }

    let mut ids: BTreeSet<&str> = BTreeSet::new();
    if let Some(map) = stages {
        ids.extend(map.keys().map(String::as_str));
    }
    ids.extend(ends.keys().copied());

    let job_end = raw.t_end.map(Ts::epoch_ms);
    ids.into_iter()
        .filter_map(|id| {
            let stage = stages.and_then(|m| m.get(id));
            let end = ends.get(id).copied();
            let cap = end
                .map(|e| e.at_ms)
                .or(job_end)
                .or_else(|| stage.and_then(max_stage_ms))?;
            let phases = crash_windows(stage, cap);
            if phases.iter().all(Option::is_none) && end.is_none() {
                return None;
            }
            Some(LogNode {
                id: id.to_string(),
                phases,
                end,
            })
        })
        .collect()
}

/// Reconstructs a node's preset phase windows from its worker stage markers, clipped to a cap. Each
/// phase runs from its start marker to the next phase's start, the unfinished one ending at the cap.
/// A phase whose start was never reached is left absent.
fn crash_windows(stage: Option<&WorkerStages>, cap: i64) -> Vec<Option<(i64, i64)>> {
    let mut phases = vec![None; PHASE_COUNT];
    let Some(s) = stage else {
        return phases;
    };
    let ms = |t: Option<Ts>| t.map(Ts::epoch_ms);
    let clip = |start: Option<i64>, end: Option<i64>| -> Option<(i64, i64)> {
        let start = start?;
        let end = end.unwrap_or(cap).min(cap);
        (end > start).then_some((start, end))
    };
    let (input, emu_start, emu_end) = (
        ms(s.input_start),
        ms(s.emulation_start),
        ms(s.emulation_end),
    );
    let (commit_end, prove_start, prove_end) =
        (ms(s.commit_end), ms(s.prove_start), ms(s.prove_end));

    phases[INPUT] = clip(input, emu_start);
    phases[EMULATION] = clip(emu_start, emu_end);
    phases[COMMIT] = clip(emu_end, commit_end.or(prove_start));
    phases[PROVE] = clip(prove_start, prove_end);
    phases
}

/// The latest stage timestamp a node reported, the last-resort cap when no end time is known.
fn max_stage_ms(s: &WorkerStages) -> Option<i64> {
    [
        s.input_start,
        s.emulation_start,
        s.emulation_end,
        s.commit_end,
        s.prove_start,
        s.prove_end,
    ]
    .into_iter()
    .flatten()
    .map(|t| t.epoch_ms())
    .max()
}

/// The (contrib_start, emu_start, emu_end, finish) epoch-ms boundaries of a phase1 event. The delay
/// is [contrib_start, emu_start], emulation is [emu_start, emu_start + asm], and commit fills the
/// remainder up to finish.
fn contrib_split_ms(ev: &Phase1Event) -> (i64, i64, i64, i64) {
    let finish = ev.t_end.epoch_ms();
    let contrib_start = finish - secs_to_ms(ev.phase_s);
    let emu_start = contrib_start + secs_to_ms(ev.delay_s);
    let emu_end = emu_start + secs_to_ms(ev.asm_s);
    (contrib_start, emu_start, emu_end, finish)
}

/// The cluster aggregate window, from the aggregator worker log with a coordinator phase3 fallback.
fn aggregate_window(raw: &RawJob, agg: Option<&AggBounds>) -> Option<(i64, i64)> {
    let start = agg
        .and_then(|a| a.t_start.or(a.t_first_step))
        .or(raw.t_p3_start)
        .map(Ts::epoch_ms);
    let end = agg.and_then(|a| a.t_end).or(raw.t_p3_end).map(Ts::epoch_ms);
    pair(start, end)
}

/// Combines two optional epoch bounds into an ordered window when both are present and ordered.
fn pair(start: Option<i64>, end: Option<i64>) -> Option<(i64, i64)> {
    match (start, end) {
        (Some(s), Some(e)) if e >= s => Some((s, e)),
        _ => None,
    }
}

/// Builds one node record per worker, merging its phase1 and phase2 windows by worker id.
fn worker_nodes(raw: &RawJob, aggregate: Option<(i64, i64)>) -> Vec<LogNode> {
    let p1_by: BTreeMap<&str, &Phase1Event> =
        raw.p1.iter().map(|e| (e.worker.as_str(), e)).collect();
    let p2_by: BTreeMap<&str, &Phase2Event> =
        raw.p2.iter().map(|e| (e.worker.as_str(), e)).collect();
    let ids: BTreeSet<&str> = p1_by.keys().chain(p2_by.keys()).copied().collect();

    ids.into_iter()
        .map(|id| {
            let mut phases = vec![None; PHASE_COUNT];
            if let Some(ev) = p1_by.get(id) {
                let (contrib_start, emu_start, emu_end, finish) = contrib_split_ms(ev);
                phases[INPUT] = Some((contrib_start, emu_start));
                phases[EMULATION] = Some((emu_start, emu_end));
                phases[COMMIT] = Some((emu_end, finish));
            }
            if let Some(ev) = p2_by.get(id) {
                let end = ev.t_end.epoch_ms();
                phases[PROVE] = Some((end - secs_to_ms(ev.dur_s), end));
            }
            if raw.aggregator.as_deref() == Some(id) {
                phases[AGGREGATE] = aggregate;
            }
            LogNode {
                id: id.to_string(),
                phases,
                end: None,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::parse_benchmark::input::log::{
        Ts,
        zkvm::zisk::{coordinator::Phase1Event, phases::contrib_split_ms},
    };

    #[test]
    fn input_emulation_and_commit_split_the_phase1_window() {
        let ev = Phase1Event {
            worker: "node4".to_string(),
            t_end: Ts::parse("2026-05-29T09:53:12.283595Z").unwrap(),
            phase_s: 2.947,
            delay_s: 0.057,
            asm_s: 0.636,
        };
        let (contrib_start, emu_start, emu_end, finish) = contrib_split_ms(&ev);
        assert_eq!(emu_start - contrib_start, 57); // delay is the receive-input window
        assert_eq!(finish - emu_start, 2890); // phase - delay = 2947 - 57
        assert_eq!(emu_end - emu_start, 636); // asm execution
        assert_eq!(finish - emu_end, 2254); // commit fills the remainder
    }
}
