//! The input stage, reading a run directory into the intermediate model. The `log` submodule parses
//! the cluster logs through a zkVM backend, and the readers here load metrics, hardware, and
//! telemetry into [`Sources`] so the measurement sources stay independent of the zkVM.

pub mod dmon;
pub mod log;
pub mod metrics;

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use crate::parse_benchmark::input::{
    dmon::DmonRow,
    metrics::{Hardware, MetricBlock, MetricsMeta},
};
use crate::parse_benchmark::{io_at, read_dir_at};

/// The non-log sources of a run, holding the per-proof metrics and their metadata, the node
/// hardware spec, and the GPU telemetry keyed by node.
pub struct Sources {
    pub blocks: Vec<MetricBlock>,
    pub meta: MetricsMeta,
    pub hardware: Hardware,
    pub dmon: BTreeMap<u32, Vec<DmonRow>>,
}

impl Sources {
    /// Reads the metrics, hardware, and telemetry of a run, leaving the cluster logs to the backend.
    pub fn load(input: &Path) -> crate::parse_benchmark::Result<Sources> {
        let metrics_dir = input.join("zkevm-metrics");
        if !metrics_dir.is_dir() {
            return Err(crate::parse_benchmark::ParseError::MissingMetricsDir(
                metrics_dir,
            ));
        }
        let (blocks, meta) = metrics::load_metrics(&metrics_dir)?;
        let hardware = metrics::load_hardware(&metrics_dir)?;
        let dmon = dmon::load_dmon(&input.join("logs"))?;
        Ok(Sources {
            blocks,
            meta,
            hardware,
            dmon,
        })
    }
}

/// Lists a directory's per-node files whose name `re` matches with a node digit in its first capture
/// group, each paired with that digit and sorted ascending by it.
///
/// Shared by the worker-log and telemetry readers, whose node ordering the rest of the document
/// depends on. A non-UTF-8 name or one `re` rejects is skipped.
pub(crate) fn worker_files_sorted(
    dir: &Path,
    re: &regex::Regex,
) -> crate::parse_benchmark::Result<Vec<(u32, PathBuf)>> {
    let entries = read_dir_at(dir)?;
    let mut files: Vec<(u32, PathBuf)> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(io_at(dir))?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if let Some(digit) = re
            .captures(name)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<u32>().ok())
        {
            files.push((digit, path));
        }
    }
    files.sort_by_key(|(digit, _)| *digit);
    Ok(files)
}
