import type { Schema, Table, Column, Index, ForeignKey, DiffResult, TableDiff, ColumnDiff, FunctionDiff, DbFunction, FunctionParam } from '../types';

/**
 * Diff two schema models.
 */
export function diffSchemas(baseline: Schema, current: Schema): DiffResult {
  const baselineNames = new Set(Object.keys(baseline.tables));
  const currentNames = new Set(Object.keys(current.tables));

  const addedTables = [...currentNames].filter((n) => !baselineNames.has(n));
  const removedTables = [...baselineNames].filter((n) => !currentNames.has(n));

  const modifiedTables: Record<string, TableDiff> = {};
  const commonTables = [...baselineNames].filter((n) => currentNames.has(n));

  for (const name of commonTables) {
    const diff = _diffTable(baseline.tables[name]!, current.tables[name]!);
    if (_hasTableChanges(diff)) {
      modifiedTables[name] = diff;
    }
  }

  // Function diffing
  const baselineFns = baseline.functions ?? {};
  const currentFns = current.functions ?? {};
  const baselineFnNames = new Set(Object.keys(baselineFns));
  const currentFnNames = new Set(Object.keys(currentFns));

  const addedFunctions = [...currentFnNames].filter((n) => !baselineFnNames.has(n));
  const removedFunctions = [...baselineFnNames].filter((n) => !currentFnNames.has(n));

  const modifiedFunctions: Record<string, FunctionDiff> = {};
  const commonFns = [...baselineFnNames].filter((n) => currentFnNames.has(n));
  for (const name of commonFns) {
    const d = _diffFunction(baselineFns[name]!, currentFns[name]!);
    if (d) modifiedFunctions[name] = d;
  }

  const hasDestructive =
    removedTables.length > 0 ||
    Object.values(modifiedTables).some(_isDestructive);

  return { addedTables, removedTables, modifiedTables, addedFunctions, removedFunctions, modifiedFunctions, hasDestructive };
}

function _diffTable(baseline: Table, current: Table): TableDiff {
  const baselineCols = baseline.columns;
  const currentCols = current.columns;

  const baselineColNames = new Set(Object.keys(baselineCols));
  const currentColNames = new Set(Object.keys(currentCols));

  const addedColumns = [...currentColNames].filter((n) => !baselineColNames.has(n));
  const removedColumns = [...baselineColNames].filter((n) => !currentColNames.has(n));

  const modifiedColumns: Record<string, ColumnDiff> = {};
  const commonCols = [...baselineColNames].filter((n) => currentColNames.has(n));
  for (const name of commonCols) {
    const d = _diffColumn(baselineCols[name]!, currentCols[name]!);
    if (d) modifiedColumns[name] = d;
  }

  const addedIndexes = _diffArrays(baseline.indexes, current.indexes, _indexKey).added;
  const removedIndexes = _diffArrays(baseline.indexes, current.indexes, _indexKey).removed;

  const addedForeignKeys = _diffArrays(baseline.foreignKeys, current.foreignKeys, _fkKey).added;
  const removedForeignKeys = _diffArrays(baseline.foreignKeys, current.foreignKeys, _fkKey).removed;

  return {
    name: current.name,
    addedColumns,
    removedColumns,
    modifiedColumns,
    addedIndexes,
    removedIndexes,
    addedForeignKeys,
    removedForeignKeys,
  };
}

function _diffColumn(baseline: Column, current: Column): ColumnDiff | null {
  const changes: ColumnDiff = {};

  if (_normalizeType(baseline.type) !== _normalizeType(current.type)) {
    changes.type = { from: baseline.type, to: current.type };
  }
  if (baseline.nullable !== current.nullable) {
    changes.nullable = { from: baseline.nullable, to: current.nullable };
  }
  if ((baseline.default || null) !== (current.default || null)) {
    changes.default = { from: baseline.default, to: current.default };
  }
  if (baseline.pk !== current.pk) {
    changes.pk = { from: baseline.pk, to: current.pk };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

function _hasTableChanges(diff: TableDiff): boolean {
  return (
    diff.addedColumns.length > 0 ||
    diff.removedColumns.length > 0 ||
    Object.keys(diff.modifiedColumns).length > 0 ||
    diff.addedIndexes.length > 0 ||
    diff.removedIndexes.length > 0 ||
    diff.addedForeignKeys.length > 0 ||
    diff.removedForeignKeys.length > 0
  );
}

function _isDestructive(tableDiff: TableDiff): boolean {
  // Removed columns, type changes that narrow data are destructive
  if (tableDiff.removedColumns.length > 0) return true;
  for (const changes of Object.values(tableDiff.modifiedColumns)) {
    if (changes.type) return true;
    if (changes.nullable && changes.nullable.to === false) return true;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _normalizeType(t: string): string {
  return (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _indexKey(idx: Index): string {
  return `${idx.unique ? 'unique:' : ''}${idx.columns.slice().sort().join(',')}`;
}

function _fkKey(fk: ForeignKey): string {
  return `${fk.columns.join(',')}->${fk.refTable}.${fk.refColumns.join(',')}`;
}

function _diffArrays<T>(baseArr: T[], curArr: T[], keyFn: (x: T) => string): { added: T[]; removed: T[] } {
  const baseMap = new Map((baseArr || []).map((x) => [keyFn(x), x]));
  const curMap = new Map((curArr || []).map((x) => [keyFn(x), x]));
  const added = [...curMap.values()].filter((x) => !baseMap.has(keyFn(x)));
  const removed = [...baseMap.values()].filter((x) => !curMap.has(keyFn(x)));
  return { added, removed };
}

// ─── Function diffing ────────────────────────────────────────────────────────

function _paramsEqual(a: FunctionParam[], b: FunctionParam[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.name !== b[i]!.name || a[i]!.type !== b[i]!.type || a[i]!.mode !== b[i]!.mode) return false;
  }
  return true;
}

function _diffFunction(baseline: DbFunction, current: DbFunction): FunctionDiff | null {
  const changes: FunctionDiff = { name: current.name, kind: current.kind, bodyChanged: false };
  let hasChanges = false;

  if (!_paramsEqual(baseline.params, current.params)) {
    changes.params = { from: baseline.params, to: current.params };
    hasChanges = true;
  }

  if (baseline.returnType !== current.returnType) {
    changes.returnType = { from: baseline.returnType, to: current.returnType };
    hasChanges = true;
  }

  if (baseline.body !== current.body) {
    changes.bodyChanged = true;
    hasChanges = true;
  }

  return hasChanges ? changes : null;
}
