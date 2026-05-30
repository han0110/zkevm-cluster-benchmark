//! GPU telemetry parsing, restricted to the supported columnar dmon format.

use std::{collections::BTreeMap, path::Path, sync::LazyLock};

use crate::parse_benchmark::input::{log::Ts, worker_files_sorted};

/// One GPU telemetry sample at one tick.
#[derive(Clone)]
pub struct DmonRow {
    pub t: Ts,
    pub gpu: u32,
    pub pwr: Option<f64>,
    pub gtemp: Option<f64>,
    pub sm: Option<f64>,
    pub mem: Option<f64>,
    pub pclk: Option<f64>,
    pub pviol: Option<f64>,
    pub tviol: Option<f64>,
    pub rxpci: Option<f64>,
    pub txpci: Option<f64>,
    pub fb: Option<f64>,
    pub bar1: Option<f64>,
    pub ccpm: Option<f64>,
}

/// Matches the node digit in a worker-N-dmon.log file name.
static NODE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"worker-(\d+)-dmon").unwrap());

/// Loads every worker-N-dmon.log under a logs directory keyed by node digit.
pub fn load_dmon(logs_dir: &Path) -> crate::parse_benchmark::Result<BTreeMap<u32, Vec<DmonRow>>> {
    let mut series = BTreeMap::new();
    for (digit, path) in worker_files_sorted(logs_dir, &NODE_RE)? {
        series.insert(digit, parse_dmon_file(&path)?);
    }
    Ok(series)
}

/// Parses one dmon log file, requiring the columnar #-header format.
fn parse_dmon_file(path: &Path) -> crate::parse_benchmark::Result<Vec<DmonRow>> {
    let text = crate::parse_benchmark::read_to_string_at(path)?;
    if !looks_columnar(&text) {
        return Err(crate::parse_benchmark::ParseError::UnsupportedDmonFormat(
            path.to_path_buf(),
        ));
    }
    parse_columnar(&text)
}

/// Reports whether the text looks like the columnar #-header dmon format.
fn looks_columnar(text: &str) -> bool {
    text.lines()
        .take(3)
        .any(|l| l.trim_start().starts_with('#'))
}

/// Parses columnar dmon text into telemetry rows, one per GPU per tick.
fn parse_columnar(text: &str) -> crate::parse_benchmark::Result<Vec<DmonRow>> {
    let header: Vec<&str> = match text.lines().find(|l| l.trim_start().starts_with('#')) {
        Some(line) => line
            .trim_start()
            .trim_start_matches('#')
            .split_whitespace()
            .collect(),
        None => return Ok(Vec::new()),
    };
    let col = |name: &str| header.iter().position(|h| *h == name);
    let (date_i, time_i, gpu_i) = (col("Date"), col("Time"), col("gpu"));

    let mut rows = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let cells: Vec<&str> = line.split_whitespace().collect();
        if cells.len() != header.len() {
            continue;
        }
        let at = |i: Option<usize>| i.and_then(|i| cells.get(i)).copied();
        let (Some(date), Some(time)) = (at(date_i), at(time_i)) else {
            continue;
        };
        let Some(gpu) = at(gpu_i).and_then(|c| c.parse::<u32>().ok()) else {
            continue;
        };
        let metric = |name: &str| at(col(name)).and_then(num);
        rows.push(DmonRow {
            t: Ts::from_dmon(date, time)?,
            gpu,
            pwr: metric("pwr"),
            gtemp: metric("gtemp"),
            sm: metric("sm"),
            mem: metric("mem"),
            pclk: metric("pclk"),
            pviol: metric("pviol"),
            tviol: metric("tviol"),
            rxpci: metric("rxpci"),
            txpci: metric("txpci"),
            fb: metric("fb"),
            bar1: metric("bar1"),
            ccpm: metric("ccpm"),
        });
    }
    Ok(rows)
}

/// Parses a dmon cell, mapping the unsupported marker and blanks to None.
fn num(cell: &str) -> Option<f64> {
    let trimmed = cell.trim();
    if trimmed.is_empty() || trimmed == "-" {
        return None;
    }
    trimmed.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use crate::parse_benchmark::input::{
        dmon::{looks_columnar, num, parse_columnar},
        log::Ts,
    };

    #[test]
    fn parses_int_and_float() {
        assert_eq!(num("405"), Some(405.0));
        assert_eq!(num("15.21"), Some(15.21));
    }

    #[test]
    fn maps_dash_and_blank_to_none() {
        assert_eq!(num("-"), None);
        assert_eq!(num("  "), None);
        assert_eq!(num(""), None);
    }

    const SAMPLE: &str = "\
#Date Time gpu pwr gtemp mtemp sm mem enc dec jpg ofa mclk pclk pviol tviol fb bar1 ccpm sbecc dbecc pci rxpci txpci
#YYYYMMDD HH:MM:SS Idx W C C % % % % % % MHz MHz % bool MB MB MB errs errs errs MB/s MB/s
 20260529 09:51:25 0 15 27 - 0 0 0 0 0 0 405 225 0 0 2 1 0 - - 0 0 2
 20260529 09:51:25 1 5 28 - 0 0 0 0 0 0 405 225 0 - 2 1 0 - - 0 0 2
";

    #[test]
    fn detects_columnar_header() {
        assert!(looks_columnar(SAMPLE));
        assert!(!looks_columnar(
            "2026/05/29 11:15:18.590, 0, 0, 0, 225, 405, 27, 15.21\n"
        ));
    }

    #[test]
    fn parses_two_gpu_rows_with_shared_tick() {
        let rows = parse_columnar(SAMPLE).unwrap();
        assert_eq!(rows.len(), 2);

        assert_eq!(rows[0].gpu, 0);
        assert_eq!(rows[0].pwr, Some(15.0));
        assert_eq!(rows[0].gtemp, Some(27.0));
        assert_eq!(rows[0].pclk, Some(225.0));
        assert_eq!(rows[0].tviol, Some(0.0));
        assert_eq!(rows[0].txpci, Some(2.0));
        assert_eq!(rows[0].fb, Some(2.0));
        assert_eq!(rows[0].bar1, Some(1.0));
        assert_eq!(rows[0].ccpm, Some(0.0));

        assert_eq!(rows[1].gpu, 1);
        assert_eq!(rows[1].pwr, Some(5.0));
        assert_eq!(rows[1].tviol, None);

        let expected = Ts::from_dmon("20260529", "09:51:25").unwrap();
        assert_eq!(rows[0].t.epoch_ms(), expected.epoch_ms());
        assert_eq!(rows[1].t.epoch_ms(), expected.epoch_ms());
    }
}
