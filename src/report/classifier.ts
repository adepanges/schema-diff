import type { DiffResult, TableDiff, FunctionDiff, Schema } from '../types';

export type Severity = 'info' | 'warning' | 'danger';

export interface ClassifiedChange {
  severity: Severity;
  category: string;
  action: string;
  target: string;
  detail: string;
  tableName?: string;
}

export interface ClassifiedReport {
  changes: ClassifiedChange[];
  counts: { info: number; warning: number; danger: number };
  hasDestructive: boolean;
}

/**
 * Classify a DiffResult into severity-tagged changes.
 */
export function classify(diff: DiffResult): ClassifiedReport {
  const changes: ClassifiedChange[] = [];

  // Table-level
  for (const name of diff.addedTables) {
    changes.push({ severity: 'info', category: 'table', action: 'added', target: name, detail: `Table \`${name}\` added` });
  }
  for (const name of diff.removedTables) {
    changes.push({ severity: 'danger', category: 'table', action: 'removed', target: name, detail: `Table \`${name}\` removed` });
  }

  // Modified tables — column/index/fk level
  for (const [tableName, td] of Object.entries(diff.modifiedTables)) {
    _classifyTableDiff(tableName, td, changes);
  }

  // Function-level
  for (const name of diff.addedFunctions) {
    changes.push({ severity: 'info', category: 'function', action: 'added', target: name, detail: `Function \`${name}\` added` });
  }
  for (const name of diff.removedFunctions) {
    changes.push({ severity: 'warning', category: 'function', action: 'removed', target: name, detail: `Function \`${name}\` removed` });
  }
  for (const [name, fd] of Object.entries(diff.modifiedFunctions)) {
    _classifyFunctionDiff(name, fd, changes);
  }

  const counts = { info: 0, warning: 0, danger: 0 };
  for (const c of changes) counts[c.severity]++;

  return { changes, counts, hasDestructive: counts.danger > 0 };
}

function _classifyTableDiff(tableName: string, td: TableDiff, out: ClassifiedChange[]): void {
  for (const col of td.addedColumns) {
    out.push({ severity: 'info', category: 'column', action: 'added', target: `${tableName}.${col}`, detail: `Column \`${col}\` added to \`${tableName}\``, tableName });
  }
  for (const col of td.removedColumns) {
    out.push({ severity: 'danger', category: 'column', action: 'removed', target: `${tableName}.${col}`, detail: `Column \`${col}\` removed from \`${tableName}\``, tableName });
  }
  for (const [col, diff] of Object.entries(td.modifiedColumns)) {
    if (diff.type) {
      out.push({ severity: 'warning', category: 'column', action: 'modified', target: `${tableName}.${col}`, detail: `Column \`${col}\` type changed from \`${diff.type.from}\` to \`${diff.type.to}\` in \`${tableName}\``, tableName });
    }
    if (diff.nullable && diff.nullable.to === false) {
      out.push({ severity: 'warning', category: 'column', action: 'modified', target: `${tableName}.${col}`, detail: `Column \`${col}\` changed to NOT NULL in \`${tableName}\``, tableName });
    }
    if (diff.nullable && diff.nullable.to === true) {
      out.push({ severity: 'info', category: 'column', action: 'modified', target: `${tableName}.${col}`, detail: `Column \`${col}\` changed to nullable in \`${tableName}\``, tableName });
    }
    if (diff.default) {
      out.push({ severity: 'info', category: 'column', action: 'modified', target: `${tableName}.${col}`, detail: `Column \`${col}\` default changed in \`${tableName}\``, tableName });
    }
  }
  for (const idx of td.addedIndexes) {
    const idxName = idx.name || idx.columns.join(',');
    out.push({ severity: 'info', category: 'index', action: 'added', target: `${tableName}.${idxName}`, detail: `Index \`${idxName}\` added on \`${tableName}(${idx.columns.join(', ')})\``, tableName });
  }
  for (const idx of td.removedIndexes) {
    const idxName = idx.name || idx.columns.join(',');
    out.push({ severity: 'info', category: 'index', action: 'removed', target: `${tableName}.${idxName}`, detail: `Index \`${idxName}\` removed from \`${tableName}\``, tableName });
  }
  for (const fk of td.addedForeignKeys) {
    const fkName = fk.name || '(unnamed)';
    out.push({ severity: 'info', category: 'fk', action: 'added', target: `${tableName}.${fkName}`, detail: `FK \`${fkName}\` added on \`${tableName}(${fk.columns.join(', ')})\` → \`${fk.refTable}(${fk.refColumns.join(', ')})\``, tableName });
  }
  for (const fk of td.removedForeignKeys) {
    const fkName = fk.name || '(unnamed)';
    out.push({ severity: 'info', category: 'fk', action: 'removed', target: `${tableName}.${fkName}`, detail: `FK \`${fkName}\` removed from \`${tableName}\``, tableName });
  }
}

function _classifyFunctionDiff(name: string, fd: FunctionDiff, out: ClassifiedChange[]): void {
  if (fd.params) {
    out.push({ severity: 'warning', category: 'function', action: 'modified', target: name, detail: `Function \`${name}\` signature changed` });
  }
  if (fd.returnType) {
    out.push({ severity: 'warning', category: 'function', action: 'modified', target: name, detail: `Function \`${name}\` return type changed from \`${fd.returnType.from}\` to \`${fd.returnType.to}\`` });
  }
  if (fd.bodyChanged) {
    out.push({ severity: 'info', category: 'function', action: 'modified', target: name, detail: `Function \`${name}\` body modified` });
  }
}
