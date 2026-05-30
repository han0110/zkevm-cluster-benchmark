//! Assembles the parsed logs and the run's measured sources into the lean output document.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde_json::Value;

use crate::parse_benchmark::{
    input::{
        Sources,
        dmon::DmonRow,
        log::{Log, LogStatus, Ts, job_prefix, zkvm::ParsedLogs},
        metrics::{MetricBlock, MetricStatus},
    },
    output::schema::{
        Benchmark, Block, BlockNode, Guest, Hardware, Metric, NodeStats, NodeTelemetry, Phase,
        PhaseWindow, Run, Software, Statistics, Telemetry, Zkvm,
    },
};

/// Rounds a value to one decimal place.
fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

/// The benchmark.json schema version this assembler emits.
const SCHEMA_VERSION: u32 = 1;

/// One GPU telemetry metric, its wire key and display metadata, how to read it off a dmon row, and
/// whether it serializes with one decimal place. The catalog, per-cell read, and rounding all derive
/// from this, so adding a metric is one row here.
struct MetricDef {
    key: &'static str,
    label: &'static str,
    unit: &'static str,
    max: Option<f64>,
    get: fn(&DmonRow) -> Option<f64>,
    one_decimal: bool,
}

/// Builds a metric definition, keeping each catalog row below to a single readable line.
const fn metric(
    key: &'static str,
    label: &'static str,
    unit: &'static str,
    max: Option<f64>,
    get: fn(&DmonRow) -> Option<f64>,
    one_decimal: bool,
) -> MetricDef {
    MetricDef {
        key,
        label,
        unit,
        max,
        get,
        one_decimal,
    }
}

/// Telemetry metric catalog in display order. The memory metrics fb, bar1, and ccpm trail so they
/// render at the end, and only the PCIe metrics keep a decimal.
const METRICS: [MetricDef; 12] = [
    metric("pwr", "Power Usage", "W", None, |r| r.pwr, false),
    metric(
        "sm",
        "Streaming Multiprocessor Utilization",
        "%",
        Some(100.0),
        |r| r.sm,
        false,
    ),
    metric(
        "mem",
        "Memory Utilization",
        "%",
        Some(100.0),
        |r| r.mem,
        false,
    ),
    metric("rxpci", "PCIe RX", "MiB/s", None, |r| r.rxpci, true),
    metric("txpci", "PCIe TX", "MiB/s", None, |r| r.txpci, true),
    metric("gtemp", "Temperature", "C", None, |r| r.gtemp, false),
    metric("pclk", "Processor Clock", "MHz", None, |r| r.pclk, false),
    metric("pviol", "Power Violation", "%", None, |r| r.pviol, false),
    metric("tviol", "Thermal Violation", "%", None, |r| r.tviol, false),
    metric("fb", "Frame Buffer Memory", "MB", None, |r| r.fb, false),
    metric("bar1", "BAR1 Memory", "MB", None, |r| r.bar1, false),
    metric("ccpm", "Protected Memory", "MB", None, |r| r.ccpm, false),
];

/// Converts a metric reading to a JSON number, an integer or one decimal per the flag, or null when
/// absent.
fn metric_cell(one_decimal: bool, value: Option<f64>) -> Value {
    match value {
        None => Value::Null,
        Some(v) if one_decimal => serde_json::Number::from_f64(round1(v))
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Some(v) => Value::Number((v.round() as i64).into()),
    }
}

/// Assembles the parsed logs and measured sources into the final benchmark document.
pub fn assemble(parsed: ParsedLogs, sources: Sources, run_id: &str) -> Benchmark {
    let ParsedLogs {
        name: zkvm_name,
        phases,
        logs,
    } = parsed;
    let Sources {
        blocks,
        meta,
        hardware,
        dmon,
    } = sources;

    let t0 = run_epoch(&logs, &dmon);
    // The node axis the whole document shares, the telemetry's node set falling back to the nodes
    // the logs name when a run captured no telemetry, so a block's nodes position to hardware.nodes
    // by index even when a node took no part in that block.
    let node_ids: Vec<String> = if dmon.is_empty() {
        let set: BTreeSet<&str> = logs
            .iter()
            .flat_map(|l| l.nodes.iter().map(|n| n.id.as_str()))
            .collect();
        set.into_iter().map(str::to_string).collect()
    } else {
        dmon.keys().map(|d| format!("node{d}")).collect()
    };

    let out_blocks = build_blocks(&logs, &blocks, &node_ids, phases.len(), t0);
    let telemetry = build_telemetry(&dmon, t0);
    let statistics = build_statistics(&out_blocks, &logs, &dmon, &node_ids);

    let run = Run {
        id: run_id.to_string(),
        started_at: logs
            .iter()
            .find_map(|l| l.t_start)
            .map(Ts::epoch_ms)
            .unwrap_or(t0),
        block_count: out_blocks.len(),
        success_count: out_blocks.iter().filter(|b| b.status == "success").count(),
        failure_count: out_blocks.iter().filter(|b| b.status != "success").count(),
        statistics,
        blocks: out_blocks,
        telemetry,
    };

    Benchmark {
        schema_version: SCHEMA_VERSION,
        hardware: Hardware {
            cpu_model: hardware.cpu_model,
            ram_gib: hardware.total_ram_gib,
            gpu_models: hardware.gpu_models,
            nodes: node_ids,
        },
        software: Software {
            zkvm: Zkvm {
                name: zkvm_name.to_string(),
                version: meta.version.unwrap_or_default(),
                phases: phases
                    .iter()
                    .map(|p| Phase {
                        name: p.name.clone(),
                        label: p.label.clone(),
                    })
                    .collect(),
            },
            guest: Guest {
                name: meta.guest.unwrap_or_default(),
                version: meta.guest_version.unwrap_or_default(),
            },
        },
        id: benchmark_id(run_id),
        runs: vec![run],
    }
}

/// The benchmark id, the run id with a trailing -YYYYMMDD-HHMMSS timestamp dropped.
///
/// A run id is the input directory basename like mainnet-25192300-100-20260602-031552, whose
/// benchmark id is mainnet-25192300-100. Repeated runs differ only in that timestamp, so they share
/// a benchmark id and a patch can gather them into one document. A run id without the suffix is
/// returned whole.
fn benchmark_id(run_id: &str) -> String {
    let is_digits = |s: &str, n: usize| s.len() == n && s.bytes().all(|b| b.is_ascii_digit());
    if let Some((head, time)) = run_id.rsplit_once('-')
        && let Some((base, date)) = head.rsplit_once('-')
        && is_digits(date, 8)
        && is_digits(time, 6)
    {
        return base.to_string();
    }
    run_id.to_string()
}

/// The earliest phase-window start across a log's nodes, anchoring a job with no start time.
fn earliest_window(log: &Log) -> Option<i64> {
    log.nodes
        .iter()
        .flat_map(|n| n.phases.iter().flatten())
        .map(|w| w.0)
        .min()
}

/// Picks the run epoch as the earliest job signal or telemetry tick, so no offset is negative.
fn run_epoch(logs: &[Log], dmon: &BTreeMap<u32, Vec<DmonRow>>) -> i64 {
    let mut t0 = i64::MAX;
    for log in logs {
        if let Some(ts) = log.t_start {
            t0 = t0.min(ts.epoch_ms());
        }
        if let Some(start) = earliest_window(log) {
            t0 = t0.min(start);
        }
    }
    for rows in dmon.values() {
        for row in rows {
            t0 = t0.min(row.t.epoch_ms());
        }
    }
    if t0 == i64::MAX { 0 } else { t0 }
}

/// Builds one block per metric in completion order, enriched with the log that timed it.
///
/// The metric archive is the source of truth for which proofs exist, so a log with no metric is not
/// emitted. Each block's nodes match the shared node axis, so a node that took no part still holds a
/// slot of null phases at its index.
fn build_blocks(
    logs: &[Log],
    blocks: &[MetricBlock],
    node_ids: &[String],
    phase_count: usize,
    t0: i64,
) -> Vec<Block> {
    let matched = match_blocks_to_logs(logs, blocks);
    blocks
        .iter()
        .enumerate()
        .map(|(bi, metric)| {
            build_block(
                metric,
                matched[bi].map(|li| &logs[li]),
                node_ids,
                phase_count,
                t0,
            )
        })
        .collect()
}

/// Builds one block from a metric and its optional matched log.
///
/// Timing comes from the log when present, the block start, per-node phase windows, and crash time.
/// Without a log the block still carries its metric outcome and figures but has no timeline.
fn build_block(
    metric: &MetricBlock,
    log: Option<&Log>,
    node_ids: &[String],
    phase_count: usize,
    t0: i64,
) -> Block {
    let start_abs = log
        .and_then(|l| l.t_start.map(Ts::epoch_ms).or_else(|| earliest_window(l)))
        .unwrap_or(t0);
    // The job's terminal timestamp is the moment the cluster declared the crash, placing each
    // blamed node's crash marker as an offset from the block start.
    let crash_abs = log.and_then(|l| l.t_end.map(Ts::epoch_ms));

    // Each preset phase window is rebased from absolute epoch ms to a block-start offset.
    let rel = |w: Option<(i64, i64)>| {
        w.map(|(s, e)| PhaseWindow {
            start_ms: s - start_abs,
            dur_ms: e - s,
        })
    };

    let nodes = node_ids
        .iter()
        .map(|node_id| {
            let log_node = log.and_then(|l| l.nodes.iter().find(|n| &n.id == node_id));
            let phases = match log_node {
                Some(n) => n.phases.iter().map(|w| rel(*w)).collect(),
                None => vec![None; phase_count],
            };
            // The log's per-node crash or cancel marker is preferred since it knows when and how the
            // node ended. The metric reason's blamed node is the fallback when the log holds no
            // per-node end, placed at the job's terminal time.
            let (crashed_ms, crash_kind) = match log_node.and_then(|n| n.end) {
                Some(end) => (
                    Some(end.at_ms - start_abs),
                    Some(end.kind.as_str().to_string()),
                ),
                None if metric.crashed_nodes.iter().any(|n| n == node_id) => (
                    crash_abs.map(|c| c - start_abs),
                    Some("crashed".to_string()),
                ),
                None => (None, None),
            };
            // A node took part when the log lists it among the participants. With no log there is no
            // participation evidence, so the node is assumed present rather than flagged absent.
            let participated = match log {
                Some(l) => l.participants.iter().any(|p| p == node_id),
                None => true,
            };
            BlockNode {
                phases,
                crashed_ms,
                crash_kind,
                participated,
            }
        })
        .collect();

    Block {
        id: metric.name.clone(),
        status: metric.status.as_str().to_string(),
        start_ms: start_abs - t0,
        gas_used: metric.block_used_gas,
        proving_ms: metric.proving_time_ms.map(|m| m as i64),
        proof_size: metric.proof_size,
        verification_time_ms: metric.verification_time_ms,
        meta: log.map(|l| l.meta.clone()).unwrap_or_default(),
        nodes,
    }
}

/// Builds columnar telemetry, per-metric [gpu][tick] grids on one shared one-second axis.
///
/// Every node aligns to the same axis anchored at the run epoch, where tick i is exactly i seconds
/// after the epoch, so grids line up by index across nodes and against the block windows. A second a
/// node did not sample stays null, a late start or interior gap, so the frontend renders a break
/// there rather than pulling later readings onto collapsed seconds.
fn build_telemetry(dmon: &BTreeMap<u32, Vec<DmonRow>>, t0: i64) -> Telemetry {
    let mut present: BTreeSet<&str> = BTreeSet::new();

    // The tick column of a timestamp, one column per second from the run epoch.
    let tick_of = |t: i64| (((t - t0) as f64) / 1000.0).round().max(0.0) as usize;
    // The axis spans the epoch through the latest tick any node reported, so every node shares it.
    let width = dmon
        .values()
        .flatten()
        .map(|r| tick_of(r.t.epoch_ms()))
        .max()
        .map_or(0, |m| m + 1);

    let mut nodes = Vec::new();
    for rows in dmon.values() {
        let mut gpus: Vec<u32> = rows.iter().map(|r| r.gpu).collect();
        gpus.sort_unstable();
        gpus.dedup();
        let gpu_index: HashMap<u32, usize> =
            gpus.iter().enumerate().map(|(i, &g)| (g, i)).collect();
        let gpu_count = gpus.len();

        let mut metrics: BTreeMap<String, Vec<Vec<Value>>> = BTreeMap::new();
        for def in &METRICS {
            let mut grid = vec![vec![Value::Null; width]; gpu_count];
            let mut any = false;
            for row in rows {
                let gi = gpu_index[&row.gpu];
                let ti = tick_of(row.t.epoch_ms());
                let cell = metric_cell(def.one_decimal, (def.get)(row));
                if !cell.is_null() {
                    any = true;
                }
                grid[gi][ti] = cell;
            }
            if any {
                present.insert(def.key);
                metrics.insert(def.key.to_string(), grid);
            }
        }

        nodes.push(NodeTelemetry { metrics });
    }

    let metrics = METRICS
        .iter()
        .filter(|d| present.contains(&d.key))
        .map(|d| Metric {
            name: d.key.to_string(),
            label: d.label.to_string(),
            unit: d.unit.to_string(),
            max: d.max,
        })
        .collect();

    Telemetry { metrics, nodes }
}

/// Builds the run statistics from the assembled blocks and telemetry. The per-node GPU rollup counts
/// only clean blocks, so its averages read as normal proving load.
fn build_statistics(
    blocks: &[Block],
    logs: &[Log],
    dmon: &BTreeMap<u32, Vec<DmonRow>>,
    node_ids: &[String],
) -> Statistics {
    let ok: Vec<&Block> = blocks.iter().filter(|b| b.status == "success").collect();
    let mut proving: Vec<i64> = ok.iter().filter_map(|b| b.proving_ms).collect();
    let total_proving_ms: i64 = proving.iter().sum();
    let mean_proving_ms = (!proving.is_empty())
        .then(|| (total_proving_ms as f64 / proving.len() as f64).round() as i64);
    proving.sort_unstable();

    let total_gas: u64 = ok.iter().filter_map(|b| b.gas_used).sum();
    let total_proving_s = total_proving_ms as f64 / 1000.0;
    let mean_gas_per_s =
        (total_proving_s > 0.0).then(|| (total_gas as f64 / total_proving_s).round() as i64);

    let windows = node_proving_windows(logs, node_ids);
    let nodes = dmon
        .iter()
        .map(|(key, rows)| {
            let id = format!("node{key}");
            node_stats(rows, windows.get(&id).map_or(&[][..], Vec::as_slice))
        })
        .collect();

    Statistics {
        mean_proving_ms,
        p50_proving_ms: percentile(&proving, 50.0),
        p90_proving_ms: percentile(&proving, 90.0),
        p95_proving_ms: percentile(&proving, 95.0),
        p99_proving_ms: percentile(&proving, 99.0),
        mean_gas_per_s,
        nodes,
    }
}

/// Returns the linear-interpolation percentile of a sorted slice, rounded to the nearest integer.
fn percentile(sorted: &[i64], p: f64) -> Option<i64> {
    match sorted.len() {
        0 => None,
        1 => Some(sorted[0]),
        n => {
            let rank = p / 100.0 * (n - 1) as f64;
            let lo = rank.floor() as usize;
            let hi = rank.ceil() as usize;
            let frac = rank - lo as f64;
            let value = sorted[lo] as f64 + (sorted[hi] as f64 - sorted[lo] as f64) * frac;
            Some(value.round() as i64)
        }
    }
}

/// Collects each node's absolute proving windows from its clean blocks only, the union of its phase
/// windows. The map is keyed by the node{key} id hardware.nodes and the telemetry share, so a dmon
/// stream joins to its windows, against which its GPU samples are later filtered.
fn node_proving_windows(logs: &[Log], node_ids: &[String]) -> BTreeMap<String, Vec<(i64, i64)>> {
    let mut windows: BTreeMap<String, Vec<(i64, i64)>> = BTreeMap::new();
    for log in logs.iter().filter(|l| is_clean_block(l, node_ids)) {
        for node in &log.nodes {
            windows
                .entry(node.id.clone())
                .or_default()
                .extend(node.phases.iter().flatten().copied());
        }
    }
    windows
}

/// Whether a job is a clean block, a success that ran on the full cluster with every node taking
/// part. Its telemetry is the normal proving load the per-node rollup averages, so a failed,
/// timed-out, or node-missing job is excluded.
fn is_clean_block(log: &Log, node_ids: &[String]) -> bool {
    log.status == LogStatus::Success
        && node_ids
            .iter()
            .all(|id| log.participants.iter().any(|p| p == id))
}

/// Computes a GPU rollup for one node from only the telemetry samples inside its proving windows, so
/// the rollup reflects the GPU under proving load rather than the whole capture, where idle, warmup,
/// and tail seconds would otherwise pull every average toward zero.
fn node_stats(rows: &[DmonRow], windows: &[(i64, i64)]) -> NodeStats {
    let proving: Vec<&DmonRow> = rows
        .iter()
        .filter(|r| within_windows(r.t.epoch_ms(), windows))
        .collect();
    let collect = |f: fn(&DmonRow) -> Option<f64>| {
        proving.iter().copied().filter_map(f).collect::<Vec<f64>>()
    };
    let mean = |v: &[f64]| (!v.is_empty()).then(|| round1(v.iter().sum::<f64>() / v.len() as f64));
    let max = |v: &[f64]| {
        v.iter()
            .copied()
            .fold(None, |acc, x| Some(acc.map_or(x, |a: f64| a.max(x))))
    };

    let gtemp = collect(|r| r.gtemp);
    let sm = collect(|r| r.sm);
    let mem = collect(|r| r.mem);
    let rxpci = collect(|r| r.rxpci);
    let txpci = collect(|r| r.txpci);

    let n_gpus = proving
        .iter()
        .map(|r| r.gpu)
        .collect::<BTreeSet<_>>()
        .len()
        .max(1);
    let throttled = proving
        .iter()
        .filter(|r| r.tviol.is_some_and(|v| v != 0.0))
        .count();
    let temp_throttle_seconds = round1(throttled as f64 / n_gpus as f64);

    NodeStats {
        max_temp: max(&gtemp),
        temp_throttle_seconds,
        mean_sm: mean(&sm),
        mean_mem: mean(&mem),
        peak_rxpci: max(&rxpci).map(round1),
        peak_txpci: max(&txpci).map(round1),
    }
}

/// Reports whether an epoch-ms timestamp falls within any inclusive proving window.
fn within_windows(t: i64, windows: &[(i64, i64)]) -> bool {
    windows.iter().any(|&(start, end)| t >= start && t <= end)
}

/// Whether a log id is a prefix of a cluster job id. The coordinator prints a truncated id while a
/// crash reason carries the full uuid, so the log's leading hex run is compared.
fn job_prefix_matches(log_id: &str, job: &str) -> bool {
    let prefix = job_prefix(log_id);
    !prefix.is_empty() && job.starts_with(&prefix)
}

/// Binds each metric block to the log that timed it, by index. Crashes bind first by the cluster job
/// id in their reason, then successes bind to the latest success log finishing at or before their
/// completion in a forward-only one-to-one scan. A block with no log is left unbound.
fn match_blocks_to_logs(logs: &[Log], blocks: &[MetricBlock]) -> Vec<Option<usize>> {
    let mut by_metric: Vec<Option<usize>> = vec![None; blocks.len()];
    let mut used = vec![false; logs.len()];

    // First pass. A crash binds to the log with the same cluster job id, the key its reason shares
    // with the coordinator's truncated id.
    for (bi, block) in blocks.iter().enumerate() {
        let Some(job) = block.crashed_job.as_deref() else {
            continue;
        };
        if let Some(li) =
            (0..logs.len()).find(|&i| !used[i] && job_prefix_matches(&logs[i].id, job))
        {
            used[li] = true;
            by_metric[bi] = Some(li);
        }
    }

    // Second pass. A success binds to the latest success log finishing at or before its completion,
    // a forward-only one-to-one scan. Only successes take this path, so a crash that found no job id
    // stays unbound rather than stealing a success log by a near timestamp.
    let successes: Vec<usize> = logs
        .iter()
        .enumerate()
        .filter(|(i, l)| !used[*i] && l.status == LogStatus::Success)
        .map(|(i, _)| i)
        .collect();
    let t_end_ms = |log_idx: usize| logs[log_idx].t_end.map(Ts::epoch_ms);

    let mut sp = 0; // forward pointer into successes
    for (bi, block) in blocks.iter().enumerate() {
        if by_metric[bi].is_some() || block.status != MetricStatus::Success {
            continue;
        }
        let Some(ts) = block.timestamp_completed.map(Ts::epoch_ms) else {
            continue;
        };
        let mut best: Option<usize> = None;
        let mut k = sp;
        while k < successes.len() && t_end_ms(successes[k]).is_some_and(|te| te <= ts) {
            best = Some(k);
            k += 1;
        }
        if let Some(b) = best {
            let log_idx = successes[b];
            used[log_idx] = true;
            by_metric[bi] = Some(log_idx);
            sp = b + 1;
        }
    }

    by_metric
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use crate::parse_benchmark::{
        input::{
            dmon::DmonRow,
            log::{Log, LogNode, LogStatus, Ts},
            metrics::{MetricBlock, MetricStatus},
        },
        output::assemble::{
            benchmark_id, match_blocks_to_logs, metric_cell, node_proving_windows, node_stats,
        },
    };

    /// Builds a telemetry row carrying a single SM and thermal-violation reading at one timestamp.
    fn row(time: &str, sm: f64, tviol: f64) -> DmonRow {
        DmonRow {
            t: Ts::parse(time).unwrap(),
            gpu: 0,
            pwr: None,
            gtemp: None,
            sm: Some(sm),
            mem: None,
            pclk: None,
            pviol: None,
            tviol: Some(tviol),
            rxpci: None,
            txpci: None,
            fb: None,
            bar1: None,
            ccpm: None,
        }
    }

    #[test]
    fn node_stats_average_only_samples_inside_proving_windows() {
        let rows = vec![
            row("2026-05-29T10:00:00Z", 10.0, 0.0), // warmup before the window, excluded
            row("2026-05-29T10:00:05Z", 80.0, 1.0), // inside the window, counted and throttled
            row("2026-05-29T10:00:06Z", 90.0, 0.0), // inside the window, counted
            row("2026-05-29T10:00:30Z", 0.0, 0.0),  // idle tail after the window, excluded
        ];
        let start = Ts::parse("2026-05-29T10:00:04Z").unwrap().epoch_ms();
        let end = Ts::parse("2026-05-29T10:00:10Z").unwrap().epoch_ms();

        let stats = node_stats(&rows, &[(start, end)]);

        // Only the two in-window readings average, so the idle 10 and 0 do not drag the mean down.
        assert_eq!(stats.mean_sm, Some(85.0));
        // The single in-window throttled second counts, the out-of-window ones do not.
        assert_eq!(stats.temp_throttle_seconds, 1.0);
    }

    #[test]
    fn node_stats_is_empty_without_any_proving_sample() {
        let rows = vec![row("2026-05-29T10:00:00Z", 50.0, 0.0)];
        let stats = node_stats(&rows, &[]);
        assert_eq!(stats.mean_sm, None);
        assert_eq!(stats.temp_throttle_seconds, 0.0);
    }

    #[test]
    fn integer_metrics_round_to_whole_numbers() {
        assert_eq!(metric_cell(false, Some(15.6)), Value::from(16));
        assert_eq!(metric_cell(false, Some(0.0)), Value::from(0));
    }

    #[test]
    fn pcie_metrics_keep_one_decimal() {
        assert_eq!(metric_cell(true, Some(15.21)), Value::from(15.2));
    }

    #[test]
    fn missing_values_become_null() {
        assert_eq!(metric_cell(false, None), Value::Null);
    }

    #[test]
    fn benchmark_id_strips_a_trailing_timestamp() {
        assert_eq!(
            benchmark_id("mainnet-25192300-100-20260602-031552"),
            "mainnet-25192300-100"
        );
        assert_eq!(benchmark_id("eest-60m-20260602-063136"), "eest-60m");
    }

    #[test]
    fn benchmark_id_keeps_a_run_id_without_a_timestamp() {
        // A bare basename with no -YYYYMMDD-HHMMSS suffix is the benchmark id verbatim, and a short
        // trailing segment that is not a six-digit time is not mistaken for one.
        assert_eq!(benchmark_id("fixture"), "fixture");
        assert_eq!(benchmark_id("mainnet-25192300-100"), "mainnet-25192300-100");
    }

    /// Builds a two-node job log with one phase window per node, for the clean-block window test.
    fn job(status: LogStatus, participants: &[&str], window: (i64, i64)) -> Log {
        let mut log = Log::new("job");
        log.status = status;
        log.participants = participants.iter().map(|p| p.to_string()).collect();
        log.nodes = ["node1", "node2"]
            .iter()
            .map(|id| LogNode {
                id: id.to_string(),
                phases: vec![Some(window)],
                end: None,
            })
            .collect();
        log
    }

    #[test]
    fn node_windows_count_only_clean_blocks() {
        let node_ids = vec!["node1".to_string(), "node2".to_string()];
        let logs = vec![
            job(LogStatus::Success, &["node1", "node2"], (100, 200)), // clean, counted
            job(LogStatus::Success, &["node1"], (300, 400)),          // node2 missing, skipped
            job(LogStatus::Timeout, &["node1", "node2"], (500, 600)), // not a success, skipped
        ];
        let windows = node_proving_windows(&logs, &node_ids);
        // Only the clean job's window survives for each node, so the rollup that filters telemetry to
        // these windows averages normal proving rather than the degraded or aborted jobs.
        assert_eq!(windows.get("node1"), Some(&vec![(100, 200)]));
        assert_eq!(windows.get("node2"), Some(&vec![(100, 200)]));
    }

    fn ts(sec: &str) -> Ts {
        Ts::parse(&format!("2026-05-29T00:00:{sec}Z")).unwrap()
    }

    fn log(id: &str, status: LogStatus, end: &str) -> Log {
        let mut l = Log::new(id);
        l.status = status;
        l.t_end = Some(ts(end));
        l
    }

    fn success_block(name: &str, completed: &str) -> MetricBlock {
        MetricBlock {
            name: name.to_string(),
            status: MetricStatus::Success,
            block_used_gas: None,
            proving_time_ms: None,
            proof_size: None,
            verification_time_ms: None,
            timestamp_completed: Some(ts(completed)),
            crashed_nodes: Vec::new(),
            crashed_job: None,
        }
    }

    fn crash_block(name: &str, job: &str) -> MetricBlock {
        MetricBlock {
            name: name.to_string(),
            status: MetricStatus::Crashed,
            block_used_gas: None,
            proving_time_ms: None,
            proof_size: None,
            verification_time_ms: None,
            timestamp_completed: Some(ts("30")),
            crashed_nodes: vec!["node1".to_string()],
            crashed_job: Some(job.to_string()),
        }
    }

    #[test]
    fn clean_runs_match_one_to_one() {
        let logs = vec![
            log("A", LogStatus::Success, "10"),
            log("B", LogStatus::Success, "20"),
        ];
        let blocks = vec![success_block("m0", "10.5"), success_block("m1", "20.5")];
        let matched = match_blocks_to_logs(&logs, &blocks);
        assert_eq!(matched, vec![Some(0), Some(1)]);
    }

    #[test]
    fn success_skips_a_failed_log() {
        let logs = vec![
            log("A", LogStatus::Success, "10"),
            log("B", LogStatus::Failed, "15"),
            log("C", LogStatus::Success, "20"),
        ];
        let blocks = vec![success_block("m0", "11"), success_block("m1", "21")];
        let matched = match_blocks_to_logs(&logs, &blocks);
        assert_eq!(matched, vec![Some(0), Some(2)]);
    }

    #[test]
    fn crash_binds_to_its_log_by_truncated_job_id() {
        // The log carries the truncated job id while the crash reason yielded the full uuid, so the
        // crash binds by prefix and the neighbouring success still binds by timestamp.
        let logs = vec![
            log("b051e0b6\u{2026}", LogStatus::Failed, "30"),
            log("c0ffee00\u{2026}", LogStatus::Success, "20"),
        ];
        let blocks = vec![
            success_block("ok", "20.5"),
            crash_block("boom", "b051e0b6-fc1b-4bf5-8b54-71f5111886a9"),
        ];
        let matched = match_blocks_to_logs(&logs, &blocks);
        assert_eq!(matched, vec![Some(1), Some(0)]);
    }

    #[test]
    fn crash_without_a_job_id_stays_unbound() {
        // An unattributed crash carries no job id and must not poach a success log by a near time.
        let logs = vec![log("aaaaaaaa\u{2026}", LogStatus::Success, "20")];
        let mut orphan = crash_block("grpc", "");
        orphan.crashed_job = None;
        let blocks = vec![orphan];
        let matched = match_blocks_to_logs(&logs, &blocks);
        assert_eq!(matched, vec![None]);
    }
}
