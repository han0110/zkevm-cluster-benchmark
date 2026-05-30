//! Integration tests over the committed fixture run under tests/fixture.
//!
//! The fixture is a self-contained ten-proof zisk run (logs/ plus zkevm-metrics/) checked into the
//! repository, so these tests exercise the whole pipeline on a fresh checkout with no external
//! data.

use std::{
    path::PathBuf,
    sync::atomic::{AtomicU32, Ordering},
};

use tools::parse_benchmark::{
    self,
    input::{
        Sources,
        log::{
            LogStatus,
            zkvm::{detect_backend, zisk::coordinator},
        },
    },
    parse_to_benchmark,
};

/// The committed fixture run directory.
fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixture")
}

/// A fresh scratch directory under the system temp root, for a test that writes a benchmark.json.
fn tempdir() -> PathBuf {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("tools-it-{}-{n}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// The fixture holds ten successful proofs for the consecutive blocks 25192300 through 25192309.
const EXPECTED_PROOFS: usize = 10;

#[test]
fn coordinator_log_parses_without_error() {
    let dir = fixture_dir();
    let coord = std::fs::read_to_string(dir.join("logs/coordinator.log")).unwrap();
    // The committed fixture exercises every recognized line shape, so the real coordinator log
    // must parse without error. An unhandled coordinator line would fail the parse here.
    let logs = coordinator::parse(&coord).unwrap();
    let success = logs
        .iter()
        .filter(|l| l.status == LogStatus::Success)
        .count();
    assert_eq!(success, EXPECTED_PROOFS, "coordinator success logs");
}

#[test]
fn zisk_backend_parses_cluster_logs() {
    let logs_dir = fixture_dir().join("logs");
    let backend = detect_backend(&logs_dir).expect("zisk backend detected");
    let parsed = backend.parse(&logs_dir).unwrap();

    assert_eq!(parsed.name, "zisk");
    assert_eq!(parsed.phases.len(), 5, "phase preset");
    let success = parsed
        .logs
        .iter()
        .filter(|l| l.status == LogStatus::Success)
        .count();
    assert_eq!(success, EXPECTED_PROOFS, "success logs");
    // Every successful log carries exactly one aggregator node, whose final phase window is set.
    assert!(
        parsed
            .logs
            .iter()
            .filter(|l| l.status == LogStatus::Success)
            .all(|l| l
                .nodes
                .iter()
                .filter(|n| n.phases.last().is_some_and(Option::is_some))
                .count()
                == 1)
    );
}

#[test]
fn sources_load_metrics_hardware_and_telemetry() {
    let sources = Sources::load(&fixture_dir()).unwrap();
    assert_eq!(sources.blocks.len(), EXPECTED_PROOFS, "metric blocks");
    assert_eq!(sources.dmon.len(), 4, "dmon nodes");
    assert!(sources.dmon.values().all(|rows| !rows.is_empty()));
    assert_eq!(sources.hardware.gpu_models.len(), 4);
    assert_eq!(sources.meta.guest.as_deref(), Some("zisk-eth-client-reth"));
    assert_eq!(sources.meta.guest_version.as_deref(), Some("v0.9.0"));
    assert_eq!(sources.meta.version.as_deref(), Some("v0.18.0"));
}

#[test]
fn assembles_lean_benchmark_document() {
    let dir = fixture_dir();
    let b = parse_to_benchmark(&dir).unwrap();

    assert_eq!(b.schema_version, 1);
    assert_eq!(b.software.zkvm.name, "zisk");
    assert_eq!(b.software.zkvm.version, "v0.18.0");
    assert_eq!(b.software.guest.name, "zisk-eth-client-reth");
    assert_eq!(b.software.guest.version, "v0.9.0");
    assert_eq!(b.software.zkvm.phases.len(), 5);
    assert_eq!(b.software.zkvm.phases[0].name, "input");
    assert_eq!(b.software.zkvm.phases[0].label, "Receive Input");
    assert_eq!(b.software.zkvm.phases[3].label, "Prove + Recurse");
    // A fresh parse yields one run, and the fixture basename carries no timestamp so the benchmark
    // id and the run id are both the bare basename.
    assert_eq!(b.id, "fixture");
    assert_eq!(b.runs.len(), 1);
    let run = &b.runs[0];
    assert_eq!(run.id, "fixture");
    assert!(run.started_at > 0);
    assert_eq!(run.block_count, EXPECTED_PROOFS);
    assert_eq!(run.success_count, EXPECTED_PROOFS);
    assert_eq!(run.failure_count, 0);
    assert_eq!(b.hardware.gpu_models.len(), 4);
    assert_eq!(b.hardware.nodes.len(), 4);

    assert_eq!(run.blocks.len(), EXPECTED_PROOFS);
    assert!(run.blocks.iter().all(|bl| bl.status == "success"));
    assert!(
        run.blocks
            .iter()
            .all(|bl| bl.proving_ms.is_some_and(|m| m > 0))
    );
    assert!(run.blocks.iter().all(|bl| bl.nodes.len() == 4));
    // A clean run leaves no node a crash marker.
    assert!(
        run.blocks
            .iter()
            .all(|bl| bl.nodes.iter().all(|n| n.crashed_ms.is_none()))
    );
    assert!(
        run.blocks
            .iter()
            .all(|bl| bl.nodes.iter().all(|n| n.phases.len() == 5))
    );
    // The aggregator is inferred from the single node carrying a non-null fifth (aggregate) window.
    assert!(
        run.blocks
            .iter()
            .all(|bl| bl.nodes.iter().filter(|n| n.phases[4].is_some()).count() == 1)
    );

    // Each block is identified by its metric file name verbatim, in completion order.
    let ids: Vec<&str> = run.blocks.iter().map(|bl| bl.id.as_str()).collect();
    let expected: Vec<String> = (25192300..=25192309)
        .map(|n| format!("rpc_block_{n}"))
        .collect();
    assert_eq!(ids, expected.iter().map(String::as_str).collect::<Vec<_>>());

    let total_gas: u64 = run.blocks.iter().filter_map(|bl| bl.gas_used).sum();
    assert_eq!(total_gas, 279_981_944);
    assert_eq!(run.statistics.p50_proving_ms, Some(6202));
    assert!(run.statistics.mean_proving_ms.is_some());
    assert!(run.statistics.mean_gas_per_s.is_some());
    assert_eq!(run.statistics.nodes.len(), 4);

    assert_eq!(run.telemetry.nodes.len(), 4);
    assert_eq!(run.telemetry.metrics.len(), 12);
    // The three memory metrics trail the catalog so the frontend charts them at the end. Pinning
    // their name, label, and unit catches a future name, label, or ordering regression the count
    // misses.
    let tail: Vec<(&str, &str, &str)> = run.telemetry.metrics[9..]
        .iter()
        .map(|m| (m.name.as_str(), m.label.as_str(), m.unit.as_str()))
        .collect();
    assert_eq!(
        tail,
        vec![
            ("fb", "Frame Buffer Memory", "MB"),
            ("bar1", "BAR1 Memory", "MB"),
            ("ccpm", "Protected Memory", "MB"),
        ]
    );
    for node in &run.telemetry.nodes {
        assert_eq!(node.metrics.len(), 12);
        for grid in node.metrics.values() {
            assert_eq!(grid.len(), 4);
        }
    }

    // Telemetry is normalized onto one shared one-second axis anchored at the run epoch. Every node
    // grid has the same tick width regardless of how many seconds that node actually sampled, so
    // the grids align by index. The fixture spans 223 seconds from the earliest reading to the
    // latest across the four workers.
    let widths: Vec<usize> = run
        .telemetry
        .nodes
        .iter()
        .flat_map(|n| n.metrics.values().map(|g| g[0].len()))
        .collect();
    assert!(
        widths.iter().all(|&w| w == 223),
        "all node grids share the 223-second axis, got {widths:?}"
    );

    // A node that started after the earliest reading carries leading nulls, and a node with a
    // dropped second carries an interior null between two real readings. Both prove missing
    // seconds are filled rather than collapsed, which is what keeps later readings from sliding
    // earlier on the axis.
    let pwr_rows: Vec<_> = run
        .telemetry
        .nodes
        .iter()
        .filter_map(|n| n.metrics.get("pwr").map(|g| &g[0]))
        .collect();
    let leading_null = pwr_rows
        .iter()
        .any(|row| row.first().is_some_and(|v| v.is_null()));
    assert!(
        leading_null,
        "a late-starting node must carry leading null telemetry"
    );
    let interior_gap = pwr_rows.iter().any(|row| {
        (1..row.len().saturating_sub(1))
            .any(|i| row[i].is_null() && !row[i - 1].is_null() && !row[i + 1].is_null())
    });
    assert!(
        interior_gap,
        "an interior dropped second must be a null between two readings"
    );
}

#[test]
fn first_block_matches_known_values() {
    let dir = fixture_dir();
    let b = parse_to_benchmark(&dir).unwrap();
    let first = b.runs[0]
        .blocks
        .iter()
        .find(|bl| bl.id == "rpc_block_25192300")
        .expect("block rpc_block_25192300");

    assert_eq!(first.proving_ms, Some(7342), "block 25192300 proving_ms");
    assert_eq!(first.gas_used, Some(29758135), "block 25192300 gas");
    assert_eq!(
        first.meta.get("steps").and_then(|v| v.as_u64()),
        Some(304964424),
        "block 25192300 steps"
    );
    // node3 aggregated block 25192300, and nodes are emitted in sorted id order, so node3 is index
    // 2.
    assert!(
        first.nodes[2].phases[4].is_some(),
        "node3 carries the aggregate window"
    );
    assert!(
        (0..4)
            .filter(|&i| i != 2)
            .all(|i| first.nodes[i].phases[4].is_none()),
        "only the aggregator carries the aggregate window"
    );
}

/// Asserts the fixture serializes byte-for-byte to the committed golden document, the enforced
/// guard that the lean schema, its field order, and its number formatting never drift
/// unintentionally. Regenerate the golden with `cargo run -- parse-benchmark --input tests/fixture
/// --output tests/fixture/benchmark.json --force` only when a change to the document is
/// intended.
#[test]
fn fixture_serializes_byte_for_byte_to_the_golden_document() {
    let generated =
        tools::parse_benchmark::output::to_json(&parse_to_benchmark(&fixture_dir()).unwrap())
            .unwrap();
    let expected = std::fs::read_to_string(fixture_dir().join("benchmark.json")).unwrap();
    assert_eq!(
        generated, expected,
        "serialized benchmark.json drifted from tests/fixture/benchmark.json"
    );
}

/// Writing refuses to clobber an existing output without --force, and --force replaces it.
#[test]
fn write_refuses_to_overwrite_without_force() {
    let dir = tempdir();
    let out = dir.join("benchmark.json");

    parse_benchmark::run(&fixture_dir(), &out, false, false).expect("first write succeeds");
    let err = parse_benchmark::run(&fixture_dir(), &out, false, false)
        .expect_err("a second write without --force is refused");
    assert!(
        matches!(err, parse_benchmark::ParseError::OutputExists(_)),
        "expected OutputExists, got {err:?}"
    );
    parse_benchmark::run(&fixture_dir(), &out, true, false).expect("--force overwrites");

    let doc = parse_benchmark::output::read(&out).unwrap();
    assert_eq!(doc.runs.len(), 1, "a forced overwrite is still one run");
}

/// Patching the same fixture twice appends a second run, suffixing the duplicate run id, and keeps
/// the cluster identity once.
#[test]
fn patch_appends_a_second_run_and_dedupes_the_id() {
    let dir = tempdir();
    let out = dir.join("benchmark.json");

    let missing = parse_benchmark::run(&fixture_dir(), &out, false, true)
        .expect_err("patching a missing target is refused");
    assert!(
        matches!(missing, parse_benchmark::ParseError::PatchTargetMissing(_)),
        "expected PatchTargetMissing, got {missing:?}"
    );

    parse_benchmark::run(&fixture_dir(), &out, false, false).expect("seed the document");
    let added =
        parse_benchmark::run(&fixture_dir(), &out, false, true).expect("patch appends a run");
    assert_eq!(
        added, EXPECTED_PROOFS,
        "the patch added the fixture's blocks"
    );

    let doc = parse_benchmark::output::read(&out).unwrap();
    assert_eq!(doc.runs.len(), 2);
    assert_eq!(doc.id, "fixture");
    // The re-parsed run carries the same id, so the append suffixes the duplicate to stay addressable.
    assert_eq!(doc.runs[0].id, "fixture");
    assert_eq!(doc.runs[1].id, "fixture-patch-1");
    // Both runs carry the fixture's ten blocks, since each is a full parse of the same directory.
    assert_eq!(doc.runs[1].blocks.len(), EXPECTED_PROOFS);
}
