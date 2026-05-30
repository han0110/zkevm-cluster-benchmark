//! The zisk zkVM backend, with detection and the coordinator, worker, and phase parsers that turn
//! its cluster logs into the generic log model.

pub mod coordinator;
pub mod phases;
pub mod worker;

use std::path::Path;

use crate::parse_benchmark::input::log::{
    PhaseDef, job_prefix,
    zkvm::{ParsedLogs, ZkvmParser},
};

/// The zisk backend.
pub struct ZiskParser;

/// Returns the ordered zisk phase preset.
pub fn zisk_phases() -> Vec<PhaseDef> {
    [
        ("input", "Receive Input"),
        ("emulation", "Emulation"),
        ("commit", "Witgen + Commit"),
        ("prove", "Prove + Recurse"),
        ("aggregate", "Aggregate"),
    ]
    .into_iter()
    .map(|(name, label)| PhaseDef {
        name: name.to_string(),
        label: label.to_string(),
    })
    .collect()
}

/// Reports whether coordinator log text was produced by the zisk coordinator.
pub fn detect_zisk(coordinator_text: &str) -> bool {
    coordinator_text.contains("zisk-coordinator")
}

impl ZiskParser {
    /// The coordinator log path within a run's logs directory. The coordinator.log name is zisk's
    /// own convention, kept here rather than in the shared run layout.
    fn coordinator_log(logs_dir: &Path) -> std::path::PathBuf {
        logs_dir.join("coordinator.log")
    }
}

impl ZkvmParser for ZiskParser {
    fn detect(&self, logs_dir: &Path) -> bool {
        std::fs::read_to_string(Self::coordinator_log(logs_dir))
            .map(|t| detect_zisk(&t))
            .unwrap_or(false)
    }

    fn parse(&self, logs_dir: &Path) -> crate::parse_benchmark::Result<ParsedLogs> {
        let coord_path = Self::coordinator_log(logs_dir);
        let coord_text = crate::parse_benchmark::read_to_string_at(&coord_path)?;
        let raw_jobs = coordinator::parse(&coord_text)?;
        let worker = worker::load(logs_dir)?;
        let logs = raw_jobs
            .iter()
            .map(|raw| {
                let key = job_prefix(&raw.id);
                phases::build_log(raw, worker.agg.get(&raw.id), worker.stages.get(&key))
            })
            .collect();

        Ok(ParsedLogs {
            name: "zisk",
            phases: zisk_phases(),
            logs,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::parse_benchmark::input::log::zkvm::zisk::detect_zisk;

    #[test]
    fn detects_zisk_coordinator_marker() {
        assert!(detect_zisk(
            "2026-05-29T09:51:19Z INFO: zisk-coordinator listening on 0.0.0.0:7000"
        ));
        assert!(!detect_zisk(
            "2026-05-29T09:51:19Z INFO: some other coordinator"
        ));
    }
}
