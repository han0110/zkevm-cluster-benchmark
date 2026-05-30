//! The parse-benchmark subcommand. The input stage reads a run's cluster logs and measurement
//! sources into an intermediate model, and the output stage assembles them into benchmark.json.

pub mod error;
pub mod input;
pub mod output;

use std::path::{Path, PathBuf};

pub use error::{ParseError, Result};
pub(crate) use error::{io_at, json_at, read_dir_at, read_to_string_at};

use crate::parse_benchmark::{
    input::{Sources, log::zkvm::detect_backend},
    output::{Benchmark, assemble::assemble},
};

/// Arguments for the parse-benchmark subcommand.
#[derive(clap::Args)]
pub struct ParseBenchmarkArgs {
    /// Run directory containing zkevm-metrics/ and logs/.
    #[arg(long)]
    pub input: PathBuf,

    /// Output path, defaulting to <input>/benchmark.json.
    #[arg(long)]
    pub output: Option<PathBuf>,

    /// Overwrite the output file when it already exists.
    #[arg(long, conflicts_with = "patch")]
    pub force: bool,

    /// Append the run to the existing benchmark.json at the output path, asserting the same cluster.
    #[arg(long)]
    pub patch: bool,
}

impl ParseBenchmarkArgs {
    /// Resolves the output path, defaulting to <input>/benchmark.json.
    pub fn output_path(&self) -> PathBuf {
        self.output
            .clone()
            .unwrap_or_else(|| self.input.join("benchmark.json"))
    }
}

/// Detects the zkVM, parses the logs, loads the run's sources, and assembles the document.
pub fn parse_to_benchmark(input: &Path) -> Result<Benchmark> {
    let logs_dir = input.join("logs");
    let backend = detect_backend(&logs_dir).ok_or(ParseError::UnknownZkvm(logs_dir.clone()))?;
    let parsed = backend.parse(&logs_dir)?;
    let sources = Sources::load(input)?;
    let run_id = input
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("run")
        .to_string();
    Ok(assemble(parsed, sources, &run_id))
}

/// Parses the run at the input directory and persists it to the output path.
///
/// Without `patch` the run starts a fresh document, refusing to clobber an existing output unless
/// `force` is set. With `patch` the run is appended to the existing same-cluster document at the
/// output path. The returned count is the number of blocks the run contributed.
pub fn run(input: &Path, output: &Path, force: bool, patch: bool) -> Result<usize> {
    let parsed = parse_to_benchmark(input)?;
    if patch {
        if !output.exists() {
            return Err(ParseError::PatchTargetMissing(output.to_path_buf()));
        }
        let mut existing = output::read(output)?;
        let added = merge_run(&mut existing, parsed)?;
        output::write(&existing, output)?;
        return Ok(added);
    }
    if output.exists() && !force {
        return Err(ParseError::OutputExists(output.to_path_buf()));
    }
    let count = parsed.runs.iter().map(|r| r.blocks.len()).sum();
    output::write(&parsed, output)?;
    Ok(count)
}

/// Appends the parsed run to an existing document, returning the number of blocks it added.
///
/// The append is refused unless hardware and software match, so a document never mixes clusters. A
/// run id already present is suffixed with -patch-N so every run stays addressable, which is what a
/// re-run of the same run directory produces.
fn merge_run(existing: &mut Benchmark, parsed: Benchmark) -> Result<usize> {
    if existing.hardware != parsed.hardware {
        return Err(ParseError::PatchMismatch("hardware"));
    }
    if existing.software != parsed.software {
        return Err(ParseError::PatchMismatch("software"));
    }
    let mut run = parsed
        .runs
        .into_iter()
        .next()
        .expect("a freshly parsed benchmark carries exactly one run");
    let added = run.blocks.len();
    let mut id = run.id.clone();
    let mut n = 1;
    while existing.runs.iter().any(|r| r.id == id) {
        id = format!("{}-patch-{n}", run.id);
        n += 1;
    }
    run.id = id;
    existing.runs.push(run);
    Ok(added)
}
