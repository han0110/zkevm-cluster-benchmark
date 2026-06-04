//! The output stage. The schema holds the benchmark.json structs, assemble builds the document, and
//! this root serializes it to compact JSON on disk.

pub mod assemble;
pub mod schema;

use std::{
    fs::File,
    path::{Path, PathBuf},
};

use flate2::{Compression, write::GzEncoder};
pub use schema::Benchmark;
use tar::{Builder, Header};

use crate::parse_benchmark::{io_at, json_at, read_to_string_at};

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

/// Writes each block's logs to a per-block tar.gz under log/{bench_id}/{run_id}/ beside
/// benchmark.json, so the lean document stays small and a block's log loads only when its trace is
/// opened. The benchmark id namespaces the tree. A block with no logs writes no file. The directory
/// is gitignored and uploaded to Cloudflare R2 for production.
pub fn write_block_logs(
    run: &schema::Run,
    base_dir: &Path,
    bench_id: &str,
) -> crate::parse_benchmark::Result<()> {
    let dir = base_dir.join("log").join(bench_id).join(&run.id);
    let mut created = false;
    for block in &run.blocks {
        if block.logs.is_empty() {
            continue;
        }
        if !created {
            std::fs::create_dir_all(&dir).map_err(io_at(&dir))?;
            created = true;
        }
        let path = dir.join(format!("{}.tar.gz", archive_stem(&block.name)));
        // A block whose stem nests under a subdirectory needs that subdirectory, so the file's own
        // parent is ensured rather than only the run directory.
        if let Some(parent) = path.parent()
            && parent != dir
        {
            std::fs::create_dir_all(parent).map_err(io_at(parent))?;
        }
        let json = serde_json::to_string(&block.logs).map_err(json_at(&path))?;
        write_log_archive(&path, &json)?;
    }
    Ok(())
}

/// Maps a block name to its archive path stem, turning the `::` of an EEST test id into a path
/// separator so the colon never reaches a URL a static origin must serve. This mapping must stay in
/// sync with the URL side in frontend/src/features/blocks/BlockTraceFullscreen.tsx archivePath,
/// which splits the same name on `::` and rejoins with a slash so both sides address the same file.
fn archive_stem(name: &str) -> String {
    name.replace("::", "/")
}

/// Writes the block's log JSON as a single-member gzipped tar at the path. The member is named
/// log.json, a short fixed name independent of the block name, so the frontend reads the one member
/// by position and a long block name never lands in a tar header.
fn write_log_archive(path: &Path, json: &str) -> crate::parse_benchmark::Result<()> {
    let file = File::create(path).map_err(io_at(path))?;
    let mut tar = Builder::new(GzEncoder::new(file, Compression::default()));
    let mut header = Header::new_ustar();
    header.set_size(json.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    tar.append_data(&mut header, "log.json", json.as_bytes())
        .map_err(io_at(path))?;
    tar.into_inner()
        .map_err(io_at(path))?
        .finish()
        .map_err(io_at(path))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::parse_benchmark::output::archive_stem;

    #[test]
    fn archive_stem_maps_an_eest_id_to_a_path() {
        // An EEST test id carries a `::` between its file and test, which the stem turns into a
        // path separator while leaving the bracketed parameters intact, matching the
        // frontend URL side.
        let name = "test_account_query.py::test_codecopy_benchmark[fork_Osaka-blockchain_test-code_size_0-mem_size_0-benchmark-gas-value_60M]";
        let stem = archive_stem(name);
        assert_eq!(
            stem,
            "test_account_query.py/test_codecopy_benchmark[fork_Osaka-blockchain_test-code_size_0-mem_size_0-benchmark-gas-value_60M]"
        );
        assert!(!stem.contains("::"), "the colon pair must not survive");
        assert!(stem.contains('['), "the bracketed parameters are preserved");
        assert!(stem.contains(']'), "the bracketed parameters are preserved");
    }
}
