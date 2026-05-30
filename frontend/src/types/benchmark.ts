/* TypeScript shapes for the lean benchmark.json from the parse-benchmark tool. Cluster identity is held
 * once and runs accumulate, each with its own statistics, blocks, and telemetry. All time is integer ms
 * offset (block windows from the run epoch, phase windows from their block start). Telemetry is columnar
 * on an implicit one-second axis where tick i is i seconds from the run epoch. Phases are a per-zkVM
 * ordered preset, and counts and node ids are inferred from array lengths and positions. */

// Terminal proof outcome, a crash split from a timeout by crash reason.
export type BlockStatus = 'success' | 'crashed' | 'timeout';

// One entry of the run index built by enumerating the data directory.
export interface RunIndexEntry {
  id: string;
  url: string;
}

// Cluster hardware, assumed identical across nodes, node ids in order, counts inferred from lengths.
export interface Hardware {
  cpu_model: string | null;
  ram_gib: number | null;
  gpu_models: string[];
  nodes: string[];
}

// One proving-pipeline phase, `name` the stable key and `label` the display string, ordered by position.
export interface Phase {
  name: string;
  label: string;
}

// The zkVM that produced the proofs, carrying its ordered phase preset.
export interface Zkvm {
  name: string;
  version: string;
  phases: Phase[];
}

// The guest program that was proven.
export interface Guest {
  name: string;
  version: string;
}

export interface Software {
  zkvm: Zkvm;
  guest: Guest;
}

// One benchmark execution with its own statistics, blocks, and telemetry.
export interface Run {
  id: string;
  // First job start as unix epoch milliseconds.
  started_at: number;
  block_count: number;
  success_count: number;
  failure_count: number;
  statistics: Statistics;
  blocks: Block[];
  telemetry: Telemetry;
}

// Whole-run GPU rollup for one node, positioned to match Hardware.nodes, null where absent.
export interface NodeStats {
  max_temp: number | null;
  temp_throttle_seconds: number;
  mean_sm: number | null;
  mean_mem: number | null;
  peak_rxpci: number | null;
  peak_txpci: number | null;
}

export interface Statistics {
  mean_proving_ms: number | null;
  p50_proving_ms: number | null;
  p90_proving_ms: number | null;
  p95_proving_ms: number | null;
  p99_proving_ms: number | null;
  mean_gas_per_s: number | null;
  nodes: NodeStats[];
}

// A phase window relative to its block start, as offset and duration in milliseconds.
export interface PhaseWindow {
  start_ms: number;
  dur_ms: number;
}

// One node's contribution to a block, positioned to match Hardware.nodes. `phases[i]` aligns to
// Software.zkvm.phases[i] and the aggregate (last) window is non-null only on the aggregating node.
// `crashed_ms` is the block-start offset where this node was blamed for a crash, null otherwise.
export interface BlockNode {
  phases: (PhaseWindow | null)[];
  crashed_ms: number | null;
  // How this node ended a crashed block, 'crashed' for the lost node and 'cancelled' for one stopped
  // after a sibling crashed. Null when unmarked.
  crash_kind: 'crashed' | 'cancelled' | null;
  // Whether this node took part. False marks a less-than-full-cluster proof, not comparable to a full run.
  participated: boolean;
}

// zkVM-specific per-block metadata, for zisk the input size, instance count, and step count.
export interface BlockMeta {
  input_size?: number;
  instances?: number;
  steps?: number;
}

export interface Block {
  // The proof identifier, the metric file name verbatim, possibly a long fixture id.
  id: string;
  status: BlockStatus;
  // Block start offset from the run epoch in milliseconds.
  start_ms: number;
  gas_used: number | null;
  // Authoritative wall-clock proving time, null unless the proof succeeded.
  proving_ms: number | null;
  proof_size: number | null;
  verification_time_ms: number | null;
  meta: BlockMeta;
  nodes: BlockNode[];
}

// Display metadata for one telemetry metric.
export interface Metric {
  name: string;
  label: string;
  unit: string;
  max?: number;
}

// One node's telemetry as per-metric [gpu][tick] grids on the shared one-second axis (tick i is i
// seconds from the run epoch). A cell is null for an unread gpu or an unsampled second, and a metric
// entirely null on a node is omitted.
export interface NodeTelemetry {
  metrics: Record<string, (number | null)[][]>;
}

export interface Telemetry {
  metrics: Metric[];
  nodes: NodeTelemetry[];
}

export interface Benchmark {
  schema_version: number;
  hardware: Hardware;
  software: Software;
  // The benchmark identity shared by every run, unique among loaded documents.
  id: string;
  // One entry per execution. A patch appends a run, so the newest is not necessarily the last.
  runs: Run[];
}
