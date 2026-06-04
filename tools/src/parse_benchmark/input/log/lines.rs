//! Raw cluster-log line extraction, the timestamped lines of the coordinator and each worker as
//! role-tagged records. The structured backends read these same logs for phase timing, while this
//! reader keeps the human-readable lines so the assembler can attach to each block the log of its
//! time window.
//!
//! Every level is kept, including the worker logs' bulk DEBUG and TRACE, so the per-block log
//! carries the complete proving narrative. A line whose level is unrecognized defaults to debug, so
//! every kept line carries one of the trace, debug, info, warn, or error levels.

use std::{path::Path, sync::LazyLock};

use regex::Regex;

use crate::parse_benchmark::input::{
    WORKER_LOG_RE,
    log::{Ts, zkvm::strip_ansi},
    worker_files_sorted,
};

/// One kept cluster-log line, its role, absolute timestamp, lowercase level, and message body.
#[derive(Clone)]
pub struct RawLine {
    pub role: String,
    pub ts: Ts,
    pub level: String,
    pub msg: String,
}

/// Matches an IPv4 address in the 10.0.0.0/8 private range, the cluster's internal network.
static PRIVATE_IP_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b").unwrap());

/// Redacts internal infrastructure identifiers from a log message, replacing a private cluster IP
/// with a placeholder and the GPU host names with generic node names. The kept lines are published,
/// so they must carry no internal address or host name.
fn scrub(msg: &str) -> String {
    PRIVATE_IP_RE
        .replace_all(msg, "10.0.0.1")
        .replace("zkevm-gpu-beast", "gpu-node")
}

/// The level tokens recognized at the start of a line, all kept.
const ALL_LEVELS: [&str; 5] = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

/// Reads every coordinator and worker log line into role-tagged records, sorted by timestamp so
/// lines from different roles interleave on the one shared clock. The coordinator reads as role
/// "coordinator" and worker-N.log as role "workerN".
pub fn load_raw_lines(logs_dir: &Path) -> crate::parse_benchmark::Result<Vec<RawLine>> {
    let mut lines: Vec<RawLine> = Vec::new();

    let coord = logs_dir.join("coordinator.log");
    if coord.is_file() {
        let text = crate::parse_benchmark::read_to_string_at(&coord)?;
        parse_file(&strip_ansi(&text), "coordinator", &mut lines)?;
    }

    for (digit, path) in worker_files_sorted(logs_dir, &WORKER_LOG_RE)? {
        let text = crate::parse_benchmark::read_to_string_at(&path)?;
        parse_file(&strip_ansi(&text), &format!("worker{digit}"), &mut lines)?;
    }

    lines.sort_by_key(|l| l.ts.epoch_us());
    Ok(lines)
}

/// Parses one role's log text, appending one record per line. A line whose first token is not a
/// timestamp continues the previous line's message, so a wrapped or stack-trace line stays one
/// record rather than splitting into a level-less fragment.
fn parse_file(
    text: &str,
    role: &str,
    out: &mut Vec<RawLine>,
) -> crate::parse_benchmark::Result<()> {
    let mut last: Option<usize> = None;
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }
        let (first, rest) = line.split_once(' ').unwrap_or((line, ""));
        match Ts::parse(first) {
            Ok(ts) => {
                let (level, msg) = split_level(rest);
                out.push(RawLine {
                    role: role.to_string(),
                    ts,
                    level,
                    msg: scrub(&msg),
                });
                last = Some(out.len() - 1);
            }
            Err(_) => {
                if let Some(i) = last {
                    out[i].msg.push('\n');
                    out[i].msg.push_str(&scrub(line));
                }
            }
        }
    }
    Ok(())
}

/// Splits the post-timestamp remainder into the lowercase level and the message. The level is the
/// earliest recognized level token (a level keyword immediately before a colon), so the worker's
/// module path that precedes it is dropped and a level word inside the message is not mistaken for
/// it. An unrecognized level defaults to debug and the whole remainder is the message, so the level
/// is always one of trace, debug, info, warn, or error.
fn split_level(rest: &str) -> (String, String) {
    let mut best: Option<(usize, &'static str, usize)> = None;
    for level in ALL_LEVELS {
        let needle = format!("{level}:");
        if let Some(pos) = find_token(rest, &needle)
            && best.is_none_or(|(b, _, _)| pos < b)
        {
            best = Some((pos, level, needle.len()));
        }
    }
    match best {
        Some((pos, level, len)) => (
            level.to_ascii_lowercase(),
            rest[pos + len..].trim().to_string(),
        ),
        None => ("debug".to_string(), rest.trim().to_string()),
    }
}

/// The byte position of `needle` in `haystack` where it begins the string or follows a space, so a
/// level keyword is matched as its own token and not as a substring of another word.
fn find_token(haystack: &str, needle: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(rel) = haystack[from..].find(needle) {
        let pos = from + rel;
        if pos == 0 || haystack.as_bytes()[pos - 1] == b' ' {
            return Some(pos);
        }
        from = pos + 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use crate::parse_benchmark::input::log::lines::{RawLine, parse_file, scrub, split_level};

    #[test]
    fn every_level_is_kept_with_the_namespace_dropped() {
        let text = "2026-06-03T07:31:16.309734Z h2::codec::framed_read DEBUG: received\n\
                    2026-06-03T07:31:16.315612Z zisk_worker INFO: Starting Contribution\n\
                    2026-06-03T07:31:16.317884Z proofman::utils TRACE: span enter";
        let mut out: Vec<RawLine> = Vec::new();
        parse_file(text, "worker1", &mut out).unwrap();
        let levels: Vec<&str> = out.iter().map(|l| l.level.as_str()).collect();
        // Every level is kept, so all three lines survive in order.
        assert_eq!(levels, vec!["debug", "info", "trace"]);
        // The module path before the level is dropped, so the message carries no namespace.
        assert_eq!(out[0].msg, "received");
        assert_eq!(out[1].msg, "Starting Contribution");
    }

    #[test]
    fn scrub_redacts_the_internal_ip_and_host_names() {
        assert_eq!(
            scrub("Connecting to coordinator at http://10.128.2.92:50051"),
            "Connecting to coordinator at http://10.0.0.1:50051"
        );
        assert_eq!(
            scrub("registered zkevm-gpu-beast-03"),
            "registered gpu-node-03"
        );
        // A duration that resembles a partial address is left untouched.
        assert_eq!(scrub("Asm Execution: 10.012s"), "Asm Execution: 10.012s");
    }

    #[test]
    fn coordinator_line_splits_level_at_the_front() {
        let (level, msg) = split_level("INFO: [Job] Started JobId(abc)");
        assert_eq!(level, "info");
        assert_eq!(msg, "[Job] Started JobId(abc)");
    }

    #[test]
    fn worker_line_drops_the_module_path_before_the_level() {
        let (level, msg) =
            split_level("zisk_worker::worker_node INFO: Starting Partial Contribution");
        assert_eq!(level, "info");
        assert_eq!(msg, "Starting Partial Contribution");
    }

    #[test]
    fn a_level_word_inside_the_message_is_not_the_level() {
        let (level, msg) = split_level("mod WARN: contains the text ERROR: here");
        assert_eq!(level, "warn");
        assert_eq!(msg, "contains the text ERROR: here");
    }

    #[test]
    fn an_unrecognized_level_defaults_to_debug() {
        let (level, msg) = split_level("panicked at src/main.rs");
        assert_eq!(level, "debug");
        assert_eq!(msg, "panicked at src/main.rs");
    }
}
