//! The output stage. The schema holds the benchmark.json structs, assemble builds the document, and
//! this root serializes it to compact JSON on disk.

pub mod assemble;
pub mod schema;

use std::path::{Path, PathBuf};

use crate::parse_benchmark::{io_at, json_at, read_to_string_at};

pub use schema::Benchmark;

/// Serializes the benchmark to compact JSON, keeping struct field order.
pub fn to_json(benchmark: &Benchmark) -> crate::parse_benchmark::Result<String> {
    serde_json::to_string(benchmark).map_err(json_at(PathBuf::from("benchmark.json")))
}

/// Reads the benchmark at the path, the existing document a patch appends a run to.
pub fn read(path: &Path) -> crate::parse_benchmark::Result<Benchmark> {
    let text = read_to_string_at(path)?;
    serde_json::from_str(&text).map_err(json_at(path))
}

/// Writes the benchmark to the output path, creating parent directories as needed.
pub fn write(benchmark: &Benchmark, output: &Path) -> crate::parse_benchmark::Result<()> {
    if let Some(parent) = output.parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent).map_err(io_at(parent))?;
    }
    let text = to_json(benchmark)?;
    std::fs::write(output, text).map_err(io_at(output))
}
