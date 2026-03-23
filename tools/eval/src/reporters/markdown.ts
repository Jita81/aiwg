/**
 * Markdown report generator for eval results
 */

import type { EvalReport } from '../models/types.js';

export function generateMarkdownReport(report: EvalReport): string {
  const lines = [
    `# AIWG Model Evaluation Report`,
    '',
    `**Model**: ${report.model}`,
    `**Backend**: ${report.backend}`,
    `**Date**: ${report.date.split('T')[0]}`,
    `**AIWG Version**: ${report.aiwgVersion}`,
    '',
    `## Scores`,
    '',
    `| Dimension | Score | Tier | Tests | Passed |`,
    `|-----------|-------|------|-------|--------|`,
  ];

  for (const dim of report.dimensions) {
    lines.push(
      `| ${dim.dimension} | ${dim.score} | ${dim.tier} | ${dim.testCases} | ${dim.passed} |`
    );
  }

  lines.push(
    '',
    `**Overall**: ${report.overall}/100 — **${report.overallTier} tier**`,
    '',
    `## Recommendation`,
    '',
  );

  const suitable = report.dimensions.filter((d) => d.score >= 70).map((d) => d.dimension);
  const limited = report.dimensions.filter((d) => d.score >= 50 && d.score < 70).map((d) => d.dimension);
  const notRec = report.dimensions.filter((d) => d.score < 50).map((d) => d.dimension);

  if (suitable.length > 0) lines.push(`Suitable for: ${suitable.join(', ')}`);
  if (limited.length > 0) lines.push(`Limited for: ${limited.join(', ')}`);
  if (notRec.length > 0) lines.push(`Not recommended for: ${notRec.join(', ')}`);

  lines.push('', `Total evaluation time: ${(report.totalLatencyMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
