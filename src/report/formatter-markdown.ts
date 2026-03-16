import type { ClassifiedReport, ClassifiedChange } from './classifier';
import type { Schema, Table, Column, DiffResult } from '../types';

const BADGE: Record<string, string> = { danger: '🔴', warning: '🟡', info: '🔵' };

/**
 * Render a classified report as rich Markdown with collapsible sections.
 */
export function formatMarkdown(report: ClassifiedReport, schemas: { baseline: Schema; current: Schema }, diff: DiffResult): string {
  const { counts, hasDestructive, changes } = report;
  const total = counts.info + counts.warning + counts.danger;

  if (total === 0) {
    return '## ✅ No Schema Changes Detected\n\nThe schema is identical to the baseline.';
  }

  const lines: string[] = [];
  lines.push('## 🔍 Schema Diff Report');
  lines.push('');

  // Summary table with badge counts
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  if (counts.danger > 0) lines.push(`| ${BADGE.danger} Danger | ${counts.danger} |`);
  if (counts.warning > 0) lines.push(`| ${BADGE.warning} Warning | ${counts.warning} |`);
  if (counts.info > 0) lines.push(`| ${BADGE.info} Info | ${counts.info} |`);
  lines.push('');

  if (hasDestructive) {
    lines.push('> ⚠️ **Destructive changes detected.** Review carefully before merging.');
    lines.push('');
  }

  // Added tables
  if (diff.addedTables.length > 0) {
    lines.push('### ✅ Added Tables');
    lines.push('');
    for (const name of diff.addedTables) {
      const table = schemas.current.tables[name];
      if (table) {
        lines.push('```dbml');
        lines.push(_tableToDbml(table));
        lines.push('```');
        lines.push('');
      }
    }
  }

  // Removed tables
  if (diff.removedTables.length > 0) {
    lines.push('### ❌ Removed Tables');
    lines.push('');
    for (const name of diff.removedTables) {
      lines.push(`- ${BADGE.danger} \`${name}\``);
    }
    lines.push('');
    lines.push('> ⚠️ **Destructive change:** Removing tables drops all data in those tables.');
    lines.push('');
  }

  // Modified tables — collapsible per-table
  if (Object.keys(diff.modifiedTables).length > 0) {
    lines.push('### ✏️ Modified Tables');
    lines.push('');
    for (const [name, tableDiff] of Object.entries(diff.modifiedTables)) {
      const tableChanges = changes.filter((c) => c.tableName === name);
      const dangerCount = tableChanges.filter((c) => c.severity === 'danger').length;
      const warnCount = tableChanges.filter((c) => c.severity === 'warning').length;

      const parts: string[] = [];
      if (tableDiff.addedColumns.length > 0) parts.push(`${tableDiff.addedColumns.length} added`);
      if (tableDiff.removedColumns.length > 0) parts.push(`${tableDiff.removedColumns.length} removed`);
      if (Object.keys(tableDiff.modifiedColumns).length > 0) parts.push(`${Object.keys(tableDiff.modifiedColumns).length} modified`);
      const summaryBadge = dangerCount > 0 ? ` ${BADGE.danger}` : warnCount > 0 ? ` ${BADGE.warning}` : '';
      const summaryText = parts.length > 0 ? parts.join(', ') : 'changed';

      lines.push(`<details><summary><strong>${name}</strong> — ${summaryText}${summaryBadge}</summary>`);
      lines.push('');

      // Diff block
      const baseline = schemas.baseline.tables[name];
      const current = schemas.current.tables[name];
      if (baseline && current) {
        lines.push('```diff');
        lines.push(`  Table ${name} {`);

        for (const colName of Object.keys(baseline.columns)) {
          if (!tableDiff.removedColumns.includes(colName) && !tableDiff.modifiedColumns[colName]) {
            lines.push(`    ${_colToDiff(baseline.columns[colName]!)}`);
          }
        }

        for (const colName of Object.keys(tableDiff.modifiedColumns)) {
          lines.push(`-   ${_colToDiff(baseline.columns[colName]!)}`);
          lines.push(`+   ${_colToDiff(current.columns[colName]!)}`);
        }

        for (const colName of tableDiff.removedColumns) {
          lines.push(`-   ${_colToDiff(baseline.columns[colName]!)}`);
        }

        for (const colName of tableDiff.addedColumns) {
          lines.push(`+   ${_colToDiff(current.columns[colName]!)}`);
        }

        lines.push('  }');
        lines.push('```');
        lines.push('');
      }

      // Index changes
      if (tableDiff.addedIndexes.length > 0 || tableDiff.removedIndexes.length > 0) {
        lines.push('**Index changes:**');
        for (const idx of tableDiff.addedIndexes) {
          lines.push(`- ${BADGE.info} Added index \`${idx.name || idx.columns.join(',')}\` on \`(${idx.columns.join(', ')})\`${idx.unique ? ' (unique)' : ''}`);
        }
        for (const idx of tableDiff.removedIndexes) {
          lines.push(`- ${BADGE.info} Removed index \`${idx.name || idx.columns.join(',')}\` on \`(${idx.columns.join(', ')})\``);
        }
        lines.push('');
      }

      // FK changes
      if (tableDiff.addedForeignKeys.length > 0 || tableDiff.removedForeignKeys.length > 0) {
        lines.push('**Foreign key changes:**');
        for (const fk of tableDiff.addedForeignKeys) {
          lines.push(`- ${BADGE.info} Added FK \`${fk.name || '(unnamed)'}\`: \`(${fk.columns.join(', ')})\` → \`${fk.refTable}(${fk.refColumns.join(', ')})\``);
        }
        for (const fk of tableDiff.removedForeignKeys) {
          lines.push(`- ${BADGE.info} Removed FK \`${fk.name || '(unnamed)'}\`: \`(${fk.columns.join(', ')})\` → \`${fk.refTable}(${fk.refColumns.join(', ')})\``);
        }
        lines.push('');
      }

      // Per-table warnings
      for (const c of tableChanges) {
        if (c.severity === 'danger' || c.severity === 'warning') {
          lines.push(`> ${BADGE[c.severity]} **${c.severity === 'danger' ? 'Destructive' : 'Warning'}:** ${c.detail}`);
        }
      }
      lines.push('');

      lines.push('</details>');
      lines.push('');
    }
  }

  // Functions section
  const hasFnChanges = diff.addedFunctions.length > 0 || diff.removedFunctions.length > 0 || Object.keys(diff.modifiedFunctions).length > 0;
  if (hasFnChanges) {
    lines.push('### 🔧 Functions & Procedures');
    lines.push('');

    for (const name of diff.addedFunctions) {
      const fn = schemas.current.functions[name];
      if (fn) {
        lines.push(`- ${BADGE.info} **Added** \`${_fnSignature(fn.name, fn.params, fn.returnType)}\``);
      }
    }

    for (const name of diff.removedFunctions) {
      const fn = schemas.baseline.functions[name];
      if (fn) {
        lines.push(`- ${BADGE.warning} **Removed** \`${_fnSignature(fn.name, fn.params, fn.returnType)}\``);
      }
    }

    for (const [name, fd] of Object.entries(diff.modifiedFunctions)) {
      const baseline = schemas.baseline.functions[name];
      const current = schemas.current.functions[name];
      if (baseline && current) {
        lines.push(`#### \`${current.name}\``);
        if (fd.params || fd.returnType) {
          lines.push(`${BADGE.warning} **Signature changed:**`);
          lines.push(`  - \`${_fnSignature(baseline.name, baseline.params, baseline.returnType)}\``);
          lines.push(`  + \`${_fnSignature(current.name, current.params, current.returnType)}\``);
        }
        if (fd.bodyChanged) {
          lines.push(`${BADGE.info} Body modified`);
        }
        lines.push('');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _tableToDbml(table: Table): string {
  const lines = [`Table ${table.name} {`];
  for (const col of Object.values(table.columns)) {
    lines.push(`  ${_colToDiff(col)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function _colToDiff(col: Column): string {
  const attrs: string[] = [];
  if (col.pk) attrs.push('pk');
  if (!col.nullable) attrs.push('not null');
  if (col.default !== null && col.default !== undefined) attrs.push(`default: ${col.default}`);
  const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
  return `${col.name} ${col.type}${attrsStr}`;
}

function _fnSignature(name: string, params: { name: string; type: string }[], returnType: string): string {
  const paramStr = params.map((p) => `${p.name} ${p.type}`).join(', ');
  return `${name}(${paramStr}) → ${returnType}`;
}
