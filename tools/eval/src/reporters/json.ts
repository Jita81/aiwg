/**
 * JSON report output
 */

import type { EvalReport } from '../models/types.js';

export function generateJsonReport(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}
