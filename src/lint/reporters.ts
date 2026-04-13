/**
 * Lint Result Reporters
 *
 * Format lint results for terminal output, JSON export, and summary views.
 *
 * @issue #810
 */

import type { LintDiagnostic, LintOutputFormat, LintResult, LintRuleset } from './types.js';

const SEVERITY_ICONS: Record<string, string> = {
  error: '\u2718',   // ✘
  warn: '\u26A0',    // ⚠
  info: '\u2139',    // ℹ
};

const SEVERITY_COLORS: Record<string, string> = {
  error: '\x1b[31m',  // red
  warn: '\x1b[33m',   // yellow
  info: '\x1b[36m',   // cyan
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

/**
 * Format a single diagnostic line
 */
function formatDiagnostic(d: LintDiagnostic): string {
  const icon = SEVERITY_ICONS[d.severity] || '?';
  const color = SEVERITY_COLORS[d.severity] || '';
  const lineRef = d.line ? `:${d.line}` : '';
  const fixHint = d.fix ? `${DIM}  fix: ${d.fix}${RESET}` : '';

  return `  ${color}${icon}${RESET} ${d.file}${lineRef}: ${d.message} ${DIM}[${d.ruleId}]${RESET}${fixHint}`;
}

/**
 * Format lint results in full detail
 */
function formatFull(result: LintResult): string {
  const lines: string[] = [];

  lines.push(`${BOLD}AIWG Lint${RESET}`);
  lines.push(`Target: ${result.target}`);
  lines.push(`Rulesets: ${result.rulesets.join(', ')}`);
  lines.push(`Files checked: ${result.summary.filesChecked}`);
  lines.push('');

  if (result.diagnostics.length === 0) {
    lines.push('\x1b[32m\u2714 No issues found\x1b[0m');
  } else {
    // Group by file
    const byFile = new Map<string, LintDiagnostic[]>();
    for (const d of result.diagnostics) {
      const list = byFile.get(d.file) || [];
      list.push(d);
      byFile.set(d.file, list);
    }

    for (const [file, diagnostics] of byFile) {
      lines.push(`${BOLD}${file}${RESET}`);
      for (const d of diagnostics) {
        lines.push(formatDiagnostic(d));
      }
      lines.push('');
    }
  }

  // Summary line
  const parts: string[] = [];
  if (result.summary.errors > 0) {
    parts.push(`\x1b[31m${result.summary.errors} error(s)\x1b[0m`);
  }
  if (result.summary.warnings > 0) {
    parts.push(`\x1b[33m${result.summary.warnings} warning(s)\x1b[0m`);
  }
  if (result.summary.infos > 0) {
    parts.push(`\x1b[36m${result.summary.infos} info(s)\x1b[0m`);
  }
  if (parts.length > 0) {
    lines.push(parts.join(', '));
  }

  const statusIcon = result.summary.passed ? '\x1b[32m\u2714 PASS\x1b[0m' : '\x1b[31m\u2718 FAIL\x1b[0m';
  lines.push(`\nResult: ${statusIcon}`);

  return lines.join('\n');
}

/**
 * Format lint results as a summary (counts only)
 */
function formatSummary(result: LintResult): string {
  const lines: string[] = [];
  lines.push(`Lint: ${result.summary.filesChecked} files, ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.infos} info`);
  const statusIcon = result.summary.passed ? '\u2714 PASS' : '\u2718 FAIL';
  lines.push(`Result: ${statusIcon}`);
  return lines.join('\n');
}

/**
 * Format lint results as JSON
 */
function formatJson(result: LintResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format lint result in the requested output format
 */
export function formatResult(result: LintResult, format: LintOutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'summary':
      return formatSummary(result);
    case 'full':
    default:
      return formatFull(result);
  }
}

/**
 * Format a list of available rulesets
 */
export function formatRulesetList(rulesets: LintRuleset[]): string {
  if (rulesets.length === 0) {
    return 'No lint rulesets found. Install a framework with lint rules (e.g., aiwg use research).';
  }

  const lines: string[] = [];
  lines.push(`${BOLD}Available Lint Rulesets${RESET}\n`);

  for (const rs of rulesets) {
    lines.push(`  ${BOLD}${rs.id}${RESET} (${rs.framework})`);
    lines.push(`    ${rs.description}`);
    lines.push(`    ${rs.rules.length} rule(s), v${rs.version}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format the rules within a ruleset
 */
export function formatRuleList(ruleset: LintRuleset): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Rules in '${ruleset.id}' (${ruleset.framework})${RESET}\n`);

  for (const rule of ruleset.rules) {
    const icon = SEVERITY_ICONS[rule.severity] || '?';
    const color = SEVERITY_COLORS[rule.severity] || '';
    lines.push(`  ${color}${icon}${RESET} ${BOLD}${rule.id}${RESET} [${rule.severity}]`);
    lines.push(`    ${rule.description}`);
    lines.push(`    applies to: ${rule.appliesTo.glob}`);
    lines.push('');
  }

  return lines.join('\n');
}
