/**
 * Lint Runner
 *
 * Core lint execution engine. Matches rules to files,
 * runs checks, and collects diagnostics.
 *
 * @issue #810
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import type {
  LintCheck,
  LintDiagnostic,
  LintResult,
  LintRule,
  LintRuleset,
  LintSeverity,
} from './types.js';

/**
 * Parse YAML-style frontmatter from a markdown file
 * Returns key-value pairs from the --- delimited block
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kv) {
      result[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

/**
 * Run a single check against a file's content and frontmatter
 */
function runCheck(
  check: LintCheck,
  content: string,
  frontmatter: Record<string, string>,
  filePath: string,
  targetDir: string,
  allFiles: string[]
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  switch (check.type) {
    case 'frontmatter-required': {
      if (!check.fields) break;
      for (const field of check.fields) {
        if (!frontmatter[field] || frontmatter[field].trim() === '') {
          diagnostics.push({
            ruleId: '',
            ruleName: '',
            severity: 'error',
            file: filePath,
            message: `Missing required frontmatter field: ${field}`,
            fix: `Add '${field}:' to the YAML frontmatter block`,
          });
        }
      }
      break;
    }

    case 'frontmatter-format': {
      if (!check.field || !check.pattern) break;
      const value = frontmatter[check.field];
      if (value && !new RegExp(check.pattern).test(value)) {
        diagnostics.push({
          ruleId: '',
          ruleName: '',
          severity: 'warn',
          file: filePath,
          message: `Frontmatter field '${check.field}' value '${value}' does not match pattern: ${check.pattern}`,
          fix: `Update '${check.field}' to match the expected format`,
        });
      }
      break;
    }

    case 'reference-resolves': {
      const refPattern = check.referencePattern || 'REF-\\d{3}';
      const regex = new RegExp(refPattern, 'g');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        let match;
        while ((match = regex.exec(lines[i])) !== null) {
          const refId = match[0];
          const basePath = check.basePath || '.aiwg/research/findings';
          const refFile = path.join(targetDir, basePath, `${refId}.md`);

          if (!fs.existsSync(refFile)) {
            // Also check relative to cwd
            const altPath = path.join(process.cwd(), basePath, `${refId}.md`);
            if (!fs.existsSync(altPath)) {
              diagnostics.push({
                ruleId: '',
                ruleName: '',
                severity: 'error',
                file: filePath,
                message: `Reference '${refId}' does not resolve to an existing file`,
                line: i + 1,
              });
            }
          }
        }
      }
      break;
    }

    case 'pattern-match': {
      if (!check.pattern) break;
      const regex = new RegExp(check.pattern);
      if (!regex.test(content)) {
        diagnostics.push({
          ruleId: '',
          ruleName: '',
          severity: 'warn',
          file: filePath,
          message: `File content does not match expected pattern: ${check.pattern}`,
        });
      }
      break;
    }

    case 'file-exists': {
      if (!check.field) break;
      const refPath = frontmatter[check.field];
      if (refPath) {
        const resolved = path.resolve(targetDir, refPath);
        if (!fs.existsSync(resolved)) {
          diagnostics.push({
            ruleId: '',
            ruleName: '',
            severity: 'error',
            file: filePath,
            message: `Referenced file '${refPath}' (from field '${check.field}') does not exist`,
          });
        }
      }
      break;
    }

    case 'id-unique': {
      // Handled at ruleset level in runRule
      break;
    }

    case 'id-format': {
      if (!check.pattern) break;
      const basename = path.basename(filePath, '.md');
      if (!new RegExp(check.pattern).test(basename)) {
        diagnostics.push({
          ruleId: '',
          ruleName: '',
          severity: 'warn',
          file: filePath,
          message: `File name '${basename}' does not match expected format: ${check.pattern}`,
          fix: `Rename to match the pattern ${check.pattern}`,
        });
      }
      break;
    }

    case 'cross-ref-bidirectional': {
      const refPattern = check.referencePattern || 'REF-\\d{3}';
      const regex = new RegExp(refPattern, 'g');
      const currentBasename = path.basename(filePath, '.md');
      const matches = content.match(regex) || [];

      for (const ref of matches) {
        if (ref === currentBasename) continue;
        // Find the referenced file
        const refFile = allFiles.find(f => path.basename(f, '.md') === ref);
        if (refFile) {
          try {
            const refContent = fs.readFileSync(path.resolve(targetDir, refFile), 'utf8');
            if (!refContent.includes(currentBasename)) {
              diagnostics.push({
                ruleId: '',
                ruleName: '',
                severity: 'info',
                file: filePath,
                message: `References '${ref}' but '${ref}' does not reference back to '${currentBasename}'`,
                fix: `Add a cross-reference to '${currentBasename}' in ${ref}.md`,
              });
            }
          } catch {
            // Skip if can't read
          }
        }
      }
      break;
    }
  }

  return diagnostics;
}

/**
 * Run a single rule against all matching files in the target
 */
async function runRule(
  rule: LintRule,
  targetDir: string,
  allFiles: string[]
): Promise<LintDiagnostic[]> {
  const diagnostics: LintDiagnostic[] = [];

  // Filter files matching the rule's glob
  const ruleGlob = rule.appliesTo.glob;
  const matchingFiles = allFiles.filter(f => minimatch(f, ruleGlob));

  if (matchingFiles.length === 0) return diagnostics;

  // Handle id-unique check at the ruleset level
  const uniqueCheck = rule.checks.find(c => c.type === 'id-unique');
  if (uniqueCheck) {
    const ids = new Map<string, string>();
    for (const file of matchingFiles) {
      const basename = path.basename(file, '.md');
      if (ids.has(basename)) {
        diagnostics.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          file,
          message: `Duplicate identifier '${basename}' — also found in ${ids.get(basename)}`,
        });
      } else {
        ids.set(basename, file);
      }
    }
  }

  // Run per-file checks
  for (const file of matchingFiles) {
    const absPath = path.resolve(targetDir, file);
    let content: string;
    try {
      content = await fsp.readFile(absPath, 'utf8');
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(content);

    for (const check of rule.checks) {
      if (check.type === 'id-unique') continue; // Already handled

      const checkDiagnostics = runCheck(check, content, frontmatter, file, targetDir, allFiles);
      for (const d of checkDiagnostics) {
        d.ruleId = rule.id;
        d.ruleName = rule.name;
        d.severity = d.severity || rule.severity;
        diagnostics.push(d);
      }
    }
  }

  return diagnostics;
}

/**
 * Collect all files under a target directory
 */
async function collectFiles(targetDir: string, recursive: boolean): Promise<string[]> {
  const pattern = recursive ? '**/*' : '*';
  try {
    const files = await glob(pattern, {
      cwd: targetDir,
      nodir: true,
      dot: false,
    });
    return files.filter(f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * Auto-detect which rulesets apply to a target path
 *
 * Maps known directory patterns to rulesets:
 * - .aiwg/research/ → research-complete
 * - .aiwg/requirements/, .aiwg/architecture/ → sdlc-complete
 */
function autoDetectRulesets(target: string, available: LintRuleset[]): LintRuleset[] {
  const normalized = target.replace(/\\/g, '/');

  const matches: LintRuleset[] = [];
  for (const rs of available) {
    // Match by framework ID patterns
    if (normalized.includes('research') && rs.framework.includes('research')) {
      matches.push(rs);
    } else if (
      (normalized.includes('requirements') ||
        normalized.includes('architecture') ||
        normalized.includes('testing') ||
        normalized.includes('deployment')) &&
      rs.framework.includes('sdlc')
    ) {
      matches.push(rs);
    }
  }

  // If no auto-detection, return all available
  return matches.length > 0 ? matches : available;
}

/**
 * Run lint on a target path with specified or auto-detected rulesets
 */
export async function runLint(
  targetDir: string,
  rulesets: LintRuleset[],
  options: { recursive?: boolean; failOn?: LintSeverity } = {}
): Promise<LintResult> {
  const recursive = options.recursive ?? true;
  const allFiles = await collectFiles(targetDir, recursive);
  const allDiagnostics: LintDiagnostic[] = [];

  for (const ruleset of rulesets) {
    for (const rule of ruleset.rules) {
      const diagnostics = await runRule(rule, targetDir, allFiles);
      allDiagnostics.push(...diagnostics);
    }
  }

  const errors = allDiagnostics.filter(d => d.severity === 'error').length;
  const warnings = allDiagnostics.filter(d => d.severity === 'warn').length;
  const infos = allDiagnostics.filter(d => d.severity === 'info').length;

  const failOn = options.failOn || 'error';
  let passed = true;
  if (failOn === 'error' && errors > 0) passed = false;
  if (failOn === 'warn' && (errors > 0 || warnings > 0)) passed = false;
  if (failOn === 'info' && allDiagnostics.length > 0) passed = false;

  return {
    target: targetDir,
    rulesets: rulesets.map(r => r.id),
    diagnostics: allDiagnostics,
    summary: {
      filesChecked: allFiles.length,
      errors,
      warnings,
      infos,
      passed,
    },
    timestamp: new Date().toISOString(),
  };
}

export { autoDetectRulesets };
