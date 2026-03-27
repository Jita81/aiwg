/**
 * Skills Registry Types
 *
 * Defines the RegistryAdapter interface and result types for
 * provider-agnostic skill search, install, and publish operations.
 *
 * @implements #539
 */

/**
 * Skill search result
 */
export interface SkillResult {
  /** Skill name (e.g., "parallel-dispatch") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Source registry (e.g., "local", "clawhub", "openclaw") */
  source: string;

  /** Framework or addon that provides this skill */
  package?: string;

  /** Supported platforms */
  platforms?: string[];

  /** Whether the skill is installed locally */
  installed?: boolean;
}

/**
 * Detailed skill information
 */
export interface SkillDetails extends SkillResult {
  /** Version string */
  version?: string;

  /** Natural language trigger phrases */
  triggers?: string[];

  /** Tools this skill uses */
  tools?: string[];

  /** File path (for local skills) */
  path?: string;

  /** Scripts associated with this skill */
  scripts?: string[];

  /** Input requirements */
  inputRequirements?: string[];

  /** Output format description */
  outputFormat?: string;

  /** Full markdown content */
  content?: string;
}

/**
 * Install options for cross-platform deployment
 */
export interface InstallOptions {
  /** Target platform for deployment (claude, copilot, cursor, etc.) */
  target?: string;

  /** Project directory to install into */
  projectDir: string;

  /** Artifact type to install (skill, agent, command, rule) */
  artifactType?: 'skill' | 'agent' | 'command' | 'rule';
}

/**
 * Registry adapter interface
 *
 * All skill registries (local, clawhub, openclaw, agentskills)
 * implement this interface for uniform access.
 */
export interface RegistryAdapter {
  /** Registry identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Whether this adapter is available (e.g., CLI installed, API reachable) */
  isAvailable(): Promise<boolean>;

  /** Search for skills matching a query */
  search(query: string): Promise<SkillResult[]>;

  /** Get detailed information about a specific skill */
  info(name: string): Promise<SkillDetails | undefined>;

  /** List all available skills */
  list(): Promise<SkillResult[]>;

  /** Install a skill to a target directory with cross-platform translation */
  install?(name: string, options: InstallOptions): Promise<void>;

  /** Publish a skill package to the registry */
  publish?(packageDir: string): Promise<void>;
}
