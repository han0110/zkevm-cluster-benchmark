//! Reads the zisk worker logs for aggregation bounds and per-node phase progress.
//!
//! The worker logs are large, so each is read and ansi-stripped once and handed to both sub-parsers
//! in one pass. `parse_agg` recovers a clean job's aggregation window from the aggregator's markers,
//! and `parse_stages` reconstructs the per-node sub-phase timeline a crashed job leaves behind
//! because the coordinator logs a phase only when it finishes while the worker brackets every
//! sub-step. Stage and aggregation fields are first-write-wins, so a later job on the same worker
//! never overwrites an earlier one.

use std::{collections::BTreeMap, path::Path, sync::LazyLock};

use crate::parse_benchmark::input::{
    log::{
        Ts, job_prefix,
        zkvm::{cap, strip_ansi},
    },
    worker_files_sorted,
};

/// Everything recovered from the worker logs, the per-job aggregation bounds and node stages.
pub struct WorkerData {
    pub agg: BTreeMap<String, AggBounds>,
    /// Per-job sub-phase stage timestamps, keyed by the eight-hex job prefix then by node.
    pub stages: BTreeMap<String, JobStages>,
}

/// Aggregation timing bounds for one job, recovered from the aggregator worker log.
#[derive(Clone, Default)]
pub struct AggBounds {
    pub t_start: Option<Ts>,
    pub t_first_step: Option<Ts>,
    pub t_end: Option<Ts>,
}

/// Boundary timestamps of one node's sub-phases for one job, any subset present. A field is set the
/// first time its marker appears within the job, so a later job on the same worker never overwrites
/// it. The unfinished phase has a start but no end, which the assembler clips to the crash moment.
#[derive(Clone, Default)]
pub struct WorkerStages {
    pub input_start: Option<Ts>,
    pub emulation_start: Option<Ts>,
    pub emulation_end: Option<Ts>,
    pub commit_end: Option<Ts>,
    pub prove_start: Option<Ts>,
    pub prove_end: Option<Ts>,
}

/// Stage timestamps for every node on a job, keyed by node id, the value of the per-job map.
pub type JobStages = BTreeMap<String, WorkerStages>;

/// Matches a worker-N.log file name, excluding the worker-N-dmon.log telemetry files.
static FILE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^worker-(\d+)\.log$").unwrap());

/// Matches the first aggregation-step line of a job, carrying the job id.
static RE_AGG_START: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"^(?P<ts>\S+) \S+ INFO: Starting aggregation step for JobId\((?P<job>[^)]*)\)",
    )
    .unwrap()
});

/// Matches the last-proof-received line, which carries no job id.
static RE_AGG_LAST_PROOF: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^(?P<ts>\S+) \S+ INFO: Last proof received").unwrap());

/// Matches the aggregation-task-completed line, carrying the job id.
static RE_AGG_DONE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"^(?P<ts>\S+) \S+ INFO: Aggregation task completed for JobId\((?P<job>[^)]*)\)",
    )
    .unwrap()
});

/// Loads aggregation bounds and node phase stages from every worker-N.log under a logs directory.
pub fn load(logs_dir: &Path) -> crate::parse_benchmark::Result<WorkerData> {
    let mut agg = BTreeMap::new();
    let mut stages = BTreeMap::new();
    for (digit, path) in worker_files_sorted(logs_dir, &FILE_RE)? {
        let text = crate::parse_benchmark::read_to_string_at(&path)?;
        let clean = strip_ansi(&text);
        let node = format!("node{digit}");
        parse_agg(&clean, &mut agg)?;
        parse_stages(&clean, &node, &mut stages)?;
    }
    Ok(WorkerData { agg, stages })
}

/// Parses one ansi-stripped worker log's aggregation markers into per-job bounds, keyed by job id.
fn parse_agg(
    clean: &str,
    agg: &mut BTreeMap<String, AggBounds>,
) -> crate::parse_benchmark::Result<()> {
    let mut current: Option<String> = None;
    for raw in clean.lines() {
        if let Some(c) = RE_AGG_START.captures(raw) {
            let job = cap(&c, "job").to_string();
            let rec = agg.entry(job.clone()).or_default();
            if rec.t_first_step.is_none() {
                rec.t_first_step = Some(Ts::parse(cap(&c, "ts"))?);
            }
            current = Some(job);
            continue;
        }
        if let Some(c) = RE_AGG_LAST_PROOF.captures(raw) {
            if let Some(job) = current.as_deref()
                && let Some(rec) = agg.get_mut(job)
                && rec.t_start.is_none()
            {
                rec.t_start = Some(Ts::parse(cap(&c, "ts"))?);
            }
            continue;
        }
        if let Some(c) = RE_AGG_DONE.captures(raw) {
            let rec = agg.entry(cap(&c, "job").to_string()).or_default();
            rec.t_end = Some(Ts::parse(cap(&c, "ts"))?);
            current = None;
            continue;
        }
    }
    Ok(())
}

/// Parses one ansi-stripped worker log into per-job stage timestamps for the given node. The current
/// phase1 and phase2 jobs are tracked separately because each is introduced by its own marker and
/// the sub-step lines in between carry no job id.
fn parse_stages(
    clean: &str,
    node: &str,
    stages: &mut BTreeMap<String, JobStages>,
) -> crate::parse_benchmark::Result<()> {
    let mut cur_p1: Option<String> = None;
    let mut cur_p2: Option<String> = None;

    for line in clean.lines() {
        let Some(body) = info_body(line) else {
            continue;
        };

        if let Some(uuid) = body.strip_prefix("Starting Partial Contribution for ") {
            let key = job_prefix(uuid);
            let ts = Ts::parse(leading_ts(line))?;
            set(stages, &key, node, ts, |s| &mut s.input_start);
            cur_p1 = Some(key);
        } else if body.starts_with(">>> COMPUTE_MINIMAL_TRACE") {
            if let Some(key) = cur_p1.clone() {
                let ts = Ts::parse(leading_ts(line))?;
                set(stages, &key, node, ts, |s| &mut s.emulation_start);
            }
        } else if body.starts_with("<<< COMPUTE_MINIMAL_TRACE") {
            if let Some(key) = cur_p1.clone() {
                let ts = Ts::parse(leading_ts(line))?;
                set(stages, &key, node, ts, |s| &mut s.emulation_end);
            }
        } else if body.starts_with("<<< CALCULATING_CONTRIBUTIONS") {
            if let Some(key) = cur_p1.clone() {
                let ts = Ts::parse(leading_ts(line))?;
                set(stages, &key, node, ts, |s| &mut s.commit_end);
            }
        } else if let Some(rest) = body.strip_prefix("Starting Prove for JobId(") {
            let key = job_prefix(rest);
            let ts = Ts::parse(leading_ts(line))?;
            set(stages, &key, node, ts, |s| &mut s.prove_start);
            cur_p2 = Some(key);
        } else if body.starts_with("<<< GENERATING_PROOFS")
            && let Some(key) = cur_p2.clone()
        {
            let ts = Ts::parse(leading_ts(line))?;
            set(stages, &key, node, ts, |s| &mut s.prove_end);
        }
    }
    Ok(())
}

/// The message body of a worker INFO line, the part after the INFO marker, or None for a non-INFO
/// line. Skipping non-INFO lines first keeps the hot path off the voluminous DEBUG output.
fn info_body(line: &str) -> Option<&str> {
    line.find(" INFO: ").map(|i| &line[i + 7..])
}

/// The leading whitespace-delimited token of a line, its timestamp.
fn leading_ts(line: &str) -> &str {
    line.split(' ').next().unwrap_or("")
}

/// Sets a stage field for a job-and-node the first time it is seen, never overwriting a prior value.
fn set(
    stages: &mut BTreeMap<String, JobStages>,
    key: &str,
    node: &str,
    ts: Ts,
    field: impl Fn(&mut WorkerStages) -> &mut Option<Ts>,
) {
    let slot = field(
        stages
            .entry(key.to_string())
            .or_default()
            .entry(node.to_string())
            .or_default(),
    );
    if slot.is_none() {
        *slot = Some(ts);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::parse_benchmark::input::log::{
        Ts,
        zkvm::zisk::worker::{AggBounds, parse_agg, parse_stages},
    };

    // The loader ansi-strips before calling the parsers, so the tests pass already-clean text.
    const AGG_LOG: &str = "\
2026-05-29T09:53:16.000000Z zisk_worker::worker INFO: Starting aggregation step for JobId(JOBA)
2026-05-29T09:53:16.384473Z proofman::proofman INFO: Last proof received. [4] proofs were received
2026-05-29T09:53:16.678613Z zisk_worker::worker_node INFO: Aggregation task completed for JobId(JOBA)
";

    #[test]
    fn binds_first_step_last_proof_and_done() {
        let mut agg: BTreeMap<String, AggBounds> = BTreeMap::new();
        parse_agg(AGG_LOG, &mut agg).unwrap();
        let rec = agg.get("JOBA").expect("JOBA bounds");
        assert_eq!(
            rec.t_first_step.map(Ts::epoch_ms),
            Some(Ts::parse("2026-05-29T09:53:16.000000Z").unwrap().epoch_ms())
        );
        assert_eq!(
            rec.t_start.map(Ts::epoch_ms),
            Some(Ts::parse("2026-05-29T09:53:16.384473Z").unwrap().epoch_ms())
        );
        assert_eq!(
            rec.t_end.map(Ts::epoch_ms),
            Some(Ts::parse("2026-05-29T09:53:16.678613Z").unwrap().epoch_ms())
        );
    }

    const STAGE_LOG: &str = "\
2026-06-02T06:36:20.329136Z zisk_worker::worker_node INFO: Starting Partial Contribution for efd42874-b32d-4539-9ac7-8c7d900b73d1
2026-06-02T06:36:20.341869Z executor::executor INFO: >>> COMPUTE_MINIMAL_TRACE
2026-06-02T06:36:25.109399Z executor::executor INFO: <<< COMPUTE_MINIMAL_TRACE (4767ms)
2026-06-02T06:36:30.000000Z proofman::proofman INFO: <<< CALCULATING_CONTRIBUTIONS (3000ms)
2026-06-02T06:36:31.000000Z zisk_worker::worker_node INFO: Starting Prove for JobId(efd42874\u{2026})
2026-06-02T06:36:40.000000Z proofman::proofman INFO: <<< GENERATING_PROOFS (9000ms)
";

    #[test]
    fn records_each_subphase_boundary_for_the_job_and_node() {
        let mut stages = BTreeMap::new();
        parse_stages(STAGE_LOG, "node4", &mut stages).unwrap();
        let s = stages
            .get("efd42874")
            .and_then(|j| j.get("node4"))
            .expect("node4 stages");
        assert!(s.input_start.is_some());
        assert!(s.emulation_start.is_some() && s.emulation_end.is_some());
        assert!(s.commit_end.is_some());
        assert!(s.prove_start.is_some() && s.prove_end.is_some());
    }
}
