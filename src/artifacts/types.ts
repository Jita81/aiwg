/**
 * Artifact Index Types
 *
 * Shared TypeScript types for the artifact indexing system.
 * Used by index-builder, query-engine, dep-graph, and stats modules.
 *
 * @implements #420
 * @source @src/artifacts/cli.ts
 * @tests @test/unit/artifacts/index-builder.test.ts
 */

/**
 * A single indexed artifact entry
 */
export interface MetadataEntry {
  /** Relative path from project root */
  path: string;

  /** Artifact type (use-case, adr, test-plan, nfr, threat-model, etc.) */
  type: string;

  /** SDLC phase (requirements, architecture, testing, security, deployment, etc.) */
  phase: string;

  /** Title from frontmatter or first heading */
  title: string;

  /** Tags from frontmatter */
  tags: string[];

  /** ISO timestamp — file creation or frontmatter date */
  created: string;

  /** ISO timestamp — file modification */
  updated: string;

  /** Truncated SHA-256 hex (16 chars) for change detection */
  checksum: string;

  /** Brief content summary (max 500 chars) */
  summary: string;

  /** Outbound @-mention references (paths this artifact depends on) */
  dependencies: string[];

  /** Computed: paths that reference this artifact */
  dependents: string[];
}

/**
 * The master artifact index stored at .aiwg/.index/metadata.json
 */
export interface ArtifactIndex {
  /** Index format version */
  version: string;

  /** ISO timestamp of last build */
  builtAt: string;

  /** Build duration in milliseconds */
  buildTimeMs: number;

  /** All indexed entries keyed by path */
  entries: Record<string, MetadataEntry>;
}

/**
 * Tag reverse index stored at .aiwg/.index/tags.json
 */
export interface TagIndex {
  /** Tag name -> array of artifact paths */
  [tag: string]: string[];
}

/**
 * Dependency graph stored at .aiwg/.index/dependencies.json
 */
export interface DependencyGraph {
  /** Path -> upstream and downstream relationships */
  [path: string]: {
    /** Artifacts this one depends on */
    upstream: string[];
    /** Artifacts that depend on this one */
    downstream: string[];
  };
}

/**
 * Index statistics stored at .aiwg/.index/stats.json
 */
export interface IndexStats {
  /** Index format version */
  version: string;

  /** ISO timestamp of last build */
  builtAt: string;

  /** Build duration in milliseconds */
  buildTimeMs: number;

  /** Total artifact count */
  totalArtifacts: number;

  /** Counts by SDLC phase */
  byPhase: Record<string, number>;

  /** Counts by artifact type */
  byType: Record<string, number>;

  /** Tag name -> count */
  tagDistribution: Record<string, number>;

  /** Dependency graph metrics */
  graphMetrics: {
    totalEdges: number;
    orphanedArtifacts: number;
    mostReferenced: { path: string; count: number } | null;
  };
}

/**
 * Result from a query operation
 */
export interface QueryResult {
  /** The matching entry */
  entry: MetadataEntry;

  /** Relevance score (0-1) */
  score: number;
}

/**
 * Query parameters for artifact search
 */
export interface QueryParams {
  /** Keyword search term */
  text?: string;

  /** Filter by path glob pattern */
  path?: string;

  /** Filter by artifact type */
  type?: string;

  /** Filter by SDLC phase */
  phase?: string;

  /** Filter by tags (AND logic) */
  tags?: string[];

  /** Filter by modification date */
  updatedAfter?: string;

  /** Maximum results */
  limit?: number;
}

/**
 * Phase name to directory mapping
 */
export const PHASE_DIRECTORIES: Record<string, string> = {
  requirements: '.aiwg/requirements',
  architecture: '.aiwg/architecture',
  testing: '.aiwg/testing',
  security: '.aiwg/security',
  deployment: '.aiwg/deployment',
  risks: '.aiwg/risks',
  planning: '.aiwg/planning',
  intake: '.aiwg/intake',
  reports: '.aiwg/reports',
};

/**
 * Default index output directory
 */
export const INDEX_DIR = '.aiwg/.index';

/**
 * Current index format version
 */
export const INDEX_VERSION = '1.0.0';

/**
 * Built-in graph type identifiers
 *
 * @implements #421 #426
 */
export type BuiltinGraphType = 'framework' | 'project' | 'codebase';

/**
 * Any graph identifier — built-in or user-defined via .aiwg/config.yaml
 *
 * @implements #426
 */
export type GraphType = string;

/**
 * Graph configuration — defines what each graph indexes
 */
export interface GraphConfig {
  /** Graph type identifier */
  type: string;

  /** Directories to scan (relative to project/framework root) */
  scanDirs: string[];

  /** File extensions to index */
  extensions: string[];

  /** Whether this graph is shared across projects */
  shared: boolean;

  /** Whether to include in default `aiwg index build` (no --graph flag) */
  defaultBuild: boolean;
}

/**
 * Built-in graph definitions
 */
export const BUILTIN_GRAPH_CONFIGS: Record<BuiltinGraphType, GraphConfig> = {
  framework: {
    type: 'framework',
    scanDirs: ['agentic/code/frameworks', 'agentic/code/addons', 'agentic/code/agents', 'docs'],
    extensions: ['.md', '.yaml', '.json'],
    shared: true,
    defaultBuild: false, // Explicitly requested via --graph framework
  },
  project: {
    type: 'project',
    scanDirs: ['.aiwg'],
    extensions: ['.md', '.yaml', '.json'],
    shared: false,
    defaultBuild: true,
  },
  codebase: {
    type: 'codebase',
    scanDirs: ['src', 'test', 'tools'],
    extensions: ['.ts', '.mts', '.js', '.mjs', '.json', '.yaml'],
    shared: false,
    defaultBuild: true,
  },
};

/**
 * Mutable graph configs — starts with built-ins, extended by user config
 *
 * @implements #426
 */
export const GRAPH_CONFIGS: Record<string, GraphConfig> = { ...BUILTIN_GRAPH_CONFIGS };

/**
 * Load user-defined graph configs from .aiwg/config.yaml
 *
 * Merges user graphs into GRAPH_CONFIGS. User graphs cannot override built-in names.
 *
 * @param cwd - Project root directory
 * @returns Names of user-defined graphs that were loaded
 *
 * @implements #426
 */
export function loadUserGraphConfigs(cwd: string): string[] {
  const configPath = `${cwd}/.aiwg/config.yaml`;
  const loaded: string[] = [];

  try {
    const fs = await_fs();
    if (!fs.existsSync(configPath)) return loaded;

    const { load } = await_yaml();
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = load(content) as Record<string, unknown> | null;
    if (!config || typeof config !== 'object') return loaded;

    const indexConfig = config.index as Record<string, unknown> | undefined;
    if (!indexConfig || typeof indexConfig !== 'object') return loaded;

    const graphs = indexConfig.graphs as Record<string, unknown> | undefined;
    if (!graphs || typeof graphs !== 'object') return loaded;

    for (const [name, def] of Object.entries(graphs)) {
      if (name in BUILTIN_GRAPH_CONFIGS) {
        // Cannot override built-in graph names
        continue;
      }
      const graphDef = def as Record<string, unknown>;
      if (!Array.isArray(graphDef.scanDirs)) continue;

      GRAPH_CONFIGS[name] = {
        type: name,
        scanDirs: graphDef.scanDirs as string[],
        extensions: Array.isArray(graphDef.extensions) ? graphDef.extensions as string[] : ['.md', '.yaml', '.json'],
        shared: graphDef.shared === true,
        defaultBuild: graphDef.defaultBuild !== false, // Default true for user graphs
      };
      loaded.push(name);
    }
  } catch {
    // Config loading is best-effort
  }

  return loaded;
}

// Lazy imports to avoid circular dependency issues at module load time
function await_fs(): typeof import('fs') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('fs');
}
function await_yaml(): { load: (s: string) => unknown } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('js-yaml');
}

/**
 * Get the index output directory for a given graph type
 *
 * @param cwd - Project root
 * @param graphType - Graph type
 * @returns Absolute path to the graph's index directory
 */
export function getGraphIndexDir(cwd: string, graphType: GraphType): string {
  if (graphType === 'framework') {
    // Shared across projects — XDG data directory
    const xdgData = process.env.XDG_DATA_HOME ?? `${process.env.HOME}/.local/share`;
    return `${xdgData}/aiwg/index/framework`;
  }
  return `${cwd}/.aiwg/.index/${graphType}`;
}

/**
 * Framework graph version tracking
 */
export interface FrameworkGraphVersion {
  /** AIWG version when graph was built */
  aiwg_version: string;

  /** Frameworks included in the graph */
  frameworks_installed: string[];

  /** Build timestamp */
  built_at: string;
}
