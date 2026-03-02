'use strict';

/**
 * Generate a diff report from a DiffResult.
 *
 * @param {object} diff    DiffResult from diffSchemas()
 * @param {object} schemas { baseline: schema, current: schema }
 * @param {string} format  'markdown' | 'text' | 'json'
 * @returns {string}
 */
function generateReport(diff, schemas, format = 'markdown') {
  if (format === 'json') return JSON.stringify(diff, null, 2);
  if (format === 'text') return _renderText(diff, schemas);
  return _renderMarkdown(diff, schemas);
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function _renderMarkdown(diff, schemas) {
  const { addedTables, removedTables, modifiedTables, hasDestructive } = diff;

  const addedCount = addedTables.length;
  const removedCount = removedTables.length;
  const modifiedCount = Object.keys(modifiedTables).length;

  if (addedCount === 0 && removedCount === 0 && modifiedCount === 0) {
    return '## ✅ No Schema Changes Detected\n\nThe schema is identical to the baseline.';
  }

  const lines = [];
  lines.push('## 🔍 Schema Diff Report');
  lines.push('');
  lines.push('| | Summary |');
  lines.push('|--|---------|');
  lines.push(`| ✅ Added | ${addedCount} table${addedCount !== 1 ? 's' : ''} |`);
  lines.push(`| ✏️ Modified | ${modifiedCount} table${modifiedCount !== 1 ? 's' : ''} |`);
  lines.push(`| ❌ Removed | ${removedCount} table${removedCount !== 1 ? 's' : ''} |`);
  if (hasDestructive) {
    lines.push(`| ⚠️ Destructive | Yes |`);
  }
  lines.push('');

  // Added tables
  if (addedTables.length > 0) {
    lines.push('### ✅ Added Tables');
    lines.push('');
    for (const name of addedTables) {
      const table = schemas.current.tables[name];
      lines.push('```dbml');
      lines.push(_tableToDbml(table));
      lines.push('```');
      lines.push('');
    }
  }

  // Removed tables
  if (removedTables.length > 0) {
    lines.push('### ❌ Removed Tables');
    lines.push('');
    for (const name of removedTables) {
      lines.push(`- \`${name}\``);
    }
    lines.push('');
    if (hasDestructive) {
      lines.push('> ⚠️ **Destructive change:** Removing tables drops all data in those tables.');
      lines.push('');
    }
  }

  // Modified tables
  if (modifiedCount > 0) {
    lines.push('### ✏️ Modified Tables');
    lines.push('');
    for (const [name, tableDiff] of Object.entries(modifiedTables)) {
      lines.push(`#### \`${name}\``);
      lines.push('');
      lines.push('```diff');
      lines.push(`  Table ${name} {`);

      const baseline = schemas.baseline.tables[name];
      const current = schemas.current.tables[name];

      // Unchanged columns
      for (const colName of Object.keys(baseline.columns)) {
        if (!tableDiff.removedColumns.includes(colName) && !tableDiff.modifiedColumns[colName]) {
          lines.push(`    ${_colToDiff(baseline.columns[colName])}`);
        }
      }

      // Modified columns
      for (const [colName, changes] of Object.entries(tableDiff.modifiedColumns)) {
        lines.push(`-   ${_colToDiff(baseline.columns[colName])}`);
        lines.push(`+   ${_colToDiff(current.columns[colName])}`);
      }

      // Removed columns
      for (const colName of tableDiff.removedColumns) {
        lines.push(`-   ${_colToDiff(baseline.columns[colName])}`);
      }

      // Added columns
      for (const colName of tableDiff.addedColumns) {
        lines.push(`+   ${_colToDiff(current.columns[colName])}`);
      }

      lines.push('  }');
      lines.push('```');
      lines.push('');

      // Index changes
      if (tableDiff.addedIndexes.length > 0 || tableDiff.removedIndexes.length > 0) {
        lines.push('**Index changes:**');
        for (const idx of tableDiff.addedIndexes) {
          lines.push(`- ✅ Added index \`${idx.name || idx.columns.join(',')}\` on \`(${idx.columns.join(', ')})\`${idx.unique ? ' (unique)' : ''}`);
        }
        for (const idx of tableDiff.removedIndexes) {
          lines.push(`- ❌ Removed index \`${idx.name || idx.columns.join(',')}\` on \`(${idx.columns.join(', ')})\``);
        }
        lines.push('');
      }

      // FK changes
      if (tableDiff.addedForeignKeys.length > 0 || tableDiff.removedForeignKeys.length > 0) {
        lines.push('**Foreign key changes:**');
        for (const fk of tableDiff.addedForeignKeys) {
          lines.push(`- ✅ Added FK \`${fk.name || '(unnamed)'}\`: \`(${fk.columns.join(', ')})\` → \`${fk.refTable}(${fk.refColumns.join(', ')})\``);
        }
        for (const fk of tableDiff.removedForeignKeys) {
          lines.push(`- ❌ Removed FK \`${fk.name || '(unnamed)'}\`: \`(${fk.columns.join(', ')})\` → \`${fk.refTable}(${fk.refColumns.join(', ')})\``);
        }
        lines.push('');
      }

      // Destructive warnings for this table
      const destructiveWarnings = _getDestructiveWarnings(name, tableDiff);
      for (const w of destructiveWarnings) {
        lines.push(`> ⚠️ **Destructive change:** ${w}`);
      }
      if (destructiveWarnings.length > 0) lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Text ────────────────────────────────────────────────────────────────────

function _renderText(diff, schemas) {
  const { addedTables, removedTables, modifiedTables, hasDestructive } = diff;

  if (addedTables.length === 0 && removedTables.length === 0 && Object.keys(modifiedTables).length === 0) {
    return 'No schema changes detected. The schema is identical to the baseline.';
  }

  const lines = [];
  lines.push('Schema Diff Report');
  lines.push('==================');
  lines.push(`Added tables:    ${addedTables.length}`);
  lines.push(`Removed tables:  ${removedTables.length}`);
  lines.push(`Modified tables: ${Object.keys(modifiedTables).length}`);
  if (hasDestructive) lines.push('DESTRUCTIVE CHANGES DETECTED');
  lines.push('');

  if (addedTables.length > 0) {
    lines.push('ADDED TABLES');
    lines.push('------------');
    for (const name of addedTables) lines.push(`  + ${name}`);
    lines.push('');
  }

  if (removedTables.length > 0) {
    lines.push('REMOVED TABLES');
    lines.push('--------------');
    for (const name of removedTables) lines.push(`  - ${name}`);
    lines.push('');
  }

  for (const [name, tableDiff] of Object.entries(modifiedTables)) {
    lines.push(`MODIFIED: ${name}`);
    lines.push('-'.repeat(10 + name.length));
    for (const c of tableDiff.addedColumns) lines.push(`  + column: ${c}`);
    for (const c of tableDiff.removedColumns) lines.push(`  - column: ${c}`);
    for (const [c, changes] of Object.entries(tableDiff.modifiedColumns)) {
      lines.push(`  ~ column: ${c} (${Object.keys(changes).join(', ')} changed)`);
    }
    for (const idx of tableDiff.addedIndexes) lines.push(`  + index: ${idx.name || idx.columns.join(',')}`);
    for (const idx of tableDiff.removedIndexes) lines.push(`  - index: ${idx.name || idx.columns.join(',')}`);
    for (const fk of tableDiff.addedForeignKeys) lines.push(`  + fk: ${fk.name || '(unnamed)'}`);
    for (const fk of tableDiff.removedForeignKeys) lines.push(`  - fk: ${fk.name || '(unnamed)'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _tableToDbml(table) {
  const lines = [`Table ${table.name} {`];
  for (const col of Object.values(table.columns)) {
    lines.push(`  ${_colToDiff(col)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function _colToDiff(col) {
  const attrs = [];
  if (col.pk) attrs.push('pk');
  if (!col.nullable) attrs.push('not null');
  if (col.default !== null && col.default !== undefined) attrs.push(`default: ${col.default}`);
  const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
  return `${col.name} ${col.type}${attrsStr}`;
}

function _getDestructiveWarnings(tableName, tableDiff) {
  const warnings = [];
  for (const col of tableDiff.removedColumns) {
    warnings.push(`Column \`${col}\` removed from \`${tableName}\`. Ensure data has been migrated before deploying.`);
  }
  for (const [col, changes] of Object.entries(tableDiff.modifiedColumns)) {
    if (changes.type) {
      warnings.push(`Column \`${col}\` type changed from \`${changes.type.from}\` to \`${changes.type.to}\` in \`${tableName}\`.`);
    }
    if (changes.nullable && changes.nullable.to === false) {
      warnings.push(`Column \`${col}\` changed to NOT NULL in \`${tableName}\`. Existing NULL values will cause migration to fail.`);
    }
  }
  return warnings;
}

module.exports = { generateReport };
