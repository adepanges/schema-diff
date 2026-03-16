import type { ClassifiedReport } from './classifier';

const SEVERITY_PREFIX: Record<string, string> = { danger: '[DANGER]', warning: '[WARNING]', info: '[INFO]' };

/**
 * Render a classified report as plain text with severity prefixes.
 */
export function formatText(report: ClassifiedReport): string {
  const { changes, counts, hasDestructive } = report;
  const total = counts.info + counts.warning + counts.danger;

  if (total === 0) {
    return 'No schema changes detected. The schema is identical to the baseline.';
  }

  const lines: string[] = [];
  lines.push('Schema Diff Report');
  lines.push('==================');
  lines.push(`Danger:  ${counts.danger}`);
  lines.push(`Warning: ${counts.warning}`);
  lines.push(`Info:    ${counts.info}`);
  if (hasDestructive) lines.push('DESTRUCTIVE CHANGES DETECTED');
  lines.push('');

  // Group changes by category for readability
  const tables = changes.filter((c) => c.category === 'table');
  const columns = changes.filter((c) => c.category === 'column');
  const indexes = changes.filter((c) => c.category === 'index');
  const fks = changes.filter((c) => c.category === 'fk');
  const functions = changes.filter((c) => c.category === 'function');

  if (tables.length > 0) {
    lines.push('TABLES');
    lines.push('------');
    for (const c of tables) {
      lines.push(`  ${SEVERITY_PREFIX[c.severity]} ${c.detail}`);
    }
    lines.push('');
  }

  if (columns.length > 0) {
    lines.push('COLUMNS');
    lines.push('-------');
    for (const c of columns) {
      lines.push(`  ${SEVERITY_PREFIX[c.severity]} ${c.detail}`);
    }
    lines.push('');
  }

  if (indexes.length > 0) {
    lines.push('INDEXES');
    lines.push('-------');
    for (const c of indexes) {
      lines.push(`  ${SEVERITY_PREFIX[c.severity]} ${c.detail}`);
    }
    lines.push('');
  }

  if (fks.length > 0) {
    lines.push('FOREIGN KEYS');
    lines.push('------------');
    for (const c of fks) {
      lines.push(`  ${SEVERITY_PREFIX[c.severity]} ${c.detail}`);
    }
    lines.push('');
  }

  if (functions.length > 0) {
    lines.push('FUNCTIONS');
    lines.push('---------');
    for (const c of functions) {
      lines.push(`  ${SEVERITY_PREFIX[c.severity]} ${c.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
