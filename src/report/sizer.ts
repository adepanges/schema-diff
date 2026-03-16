import type { ClassifiedReport } from './classifier';
import type { DiffResult } from '../types';

const GITHUB_COMMENT_LIMIT = 65_536;
const SAFE_MARGIN = 1_000;

export interface SizedOutput {
  comment: string;
  artifact: string;
  truncated: boolean;
}

/**
 * Fit a full markdown report into GitHub's comment size limit.
 *
 * If the full report fits, it is returned as-is.
 * If it exceeds the limit, a summary is generated and the full report is
 * available via the `artifact` field (to be written to the output directory).
 */
export function sizeForPr(fullReport: string, report: ClassifiedReport, diff: DiffResult): SizedOutput {
  if (fullReport.length <= GITHUB_COMMENT_LIMIT - SAFE_MARGIN) {
    return { comment: fullReport, artifact: fullReport, truncated: false };
  }

  // Generate a compact summary
  const lines: string[] = [];
  lines.push('## 🔍 Schema Diff Report (Summary)');
  lines.push('');
  lines.push('> ℹ️ Full report exceeded GitHub comment limit. See CI artifacts for the complete diff.');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  if (report.counts.danger > 0) lines.push(`| 🔴 Danger | ${report.counts.danger} |`);
  if (report.counts.warning > 0) lines.push(`| 🟡 Warning | ${report.counts.warning} |`);
  if (report.counts.info > 0) lines.push(`| 🔵 Info | ${report.counts.info} |`);
  lines.push('');

  if (diff.addedTables.length > 0) lines.push(`**Added tables:** ${diff.addedTables.map((t) => `\`${t}\``).join(', ')}`);
  if (diff.removedTables.length > 0) lines.push(`**Removed tables:** ${diff.removedTables.map((t) => `\`${t}\``).join(', ')}`);
  if (Object.keys(diff.modifiedTables).length > 0) lines.push(`**Modified tables:** ${Object.keys(diff.modifiedTables).map((t) => `\`${t}\``).join(', ')}`);
  if (diff.addedFunctions.length > 0) lines.push(`**Added functions:** ${diff.addedFunctions.map((f) => `\`${f}\``).join(', ')}`);
  if (diff.removedFunctions.length > 0) lines.push(`**Removed functions:** ${diff.removedFunctions.map((f) => `\`${f}\``).join(', ')}`);
  if (Object.keys(diff.modifiedFunctions).length > 0) lines.push(`**Modified functions:** ${Object.keys(diff.modifiedFunctions).map((f) => `\`${f}\``).join(', ')}`);
  lines.push('');

  return { comment: lines.join('\n'), artifact: fullReport, truncated: true };
}
