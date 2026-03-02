'use strict';

/**
 * Diff two schema models.
 *
 * @param {object} baseline  Schema from parser.js (baseline branch)
 * @param {object} current   Schema from parser.js (current branch)
 * @returns {DiffResult}
 *
 * DiffResult: {
 *   addedTables:    string[],
 *   removedTables:  string[],
 *   modifiedTables: { [name]: TableDiff },
 *   hasDestructive: boolean,
 * }
 *
 * TableDiff: {
 *   name: string,
 *   addedColumns:    string[],
 *   removedColumns:  string[],
 *   modifiedColumns: { [name]: ColumnDiff },
 *   addedIndexes:    IndexDef[],
 *   removedIndexes:  IndexDef[],
 *   addedForeignKeys:   FKDef[],
 *   removedForeignKeys: FKDef[],
 * }
 */
function diffSchemas(baseline, current) {
  const baselineNames = new Set(Object.keys(baseline.tables));
  const currentNames = new Set(Object.keys(current.tables));

  const addedTables = [...currentNames].filter((n) => !baselineNames.has(n));
  const removedTables = [...baselineNames].filter((n) => !currentNames.has(n));

  const modifiedTables = {};
  const commonTables = [...baselineNames].filter((n) => currentNames.has(n));

  for (const name of commonTables) {
    const diff = _diffTable(baseline.tables[name], current.tables[name]);
    if (_hasTableChanges(diff)) {
      modifiedTables[name] = diff;
    }
  }

  const hasDestructive =
    removedTables.length > 0 ||
    Object.values(modifiedTables).some(_isDestructive);

  return { addedTables, removedTables, modifiedTables, hasDestructive };
}

function _diffTable(baseline, current) {
  const baselineCols = baseline.columns;
  const currentCols = current.columns;

  const baselineColNames = new Set(Object.keys(baselineCols));
  const currentColNames = new Set(Object.keys(currentCols));

  const addedColumns = [...currentColNames].filter((n) => !baselineColNames.has(n));
  const removedColumns = [...baselineColNames].filter((n) => !currentColNames.has(n));

  const modifiedColumns = {};
  const commonCols = [...baselineColNames].filter((n) => currentColNames.has(n));
  for (const name of commonCols) {
    const d = _diffColumn(baselineCols[name], currentCols[name]);
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

function _diffColumn(baseline, current) {
  const changes = {};

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

function _hasTableChanges(diff) {
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

function _isDestructive(tableDiff) {
  // Removed columns, type changes that narrow data are destructive
  if (tableDiff.removedColumns.length > 0) return true;
  for (const changes of Object.values(tableDiff.modifiedColumns)) {
    if (changes.type) return true;
    if (changes.nullable && changes.nullable.to === false) return true;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _normalizeType(t) {
  return (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _indexKey(idx) {
  return `${idx.unique ? 'unique:' : ''}${idx.columns.slice().sort().join(',')}`;
}

function _fkKey(fk) {
  return `${fk.columns.join(',')}->${fk.refTable}.${fk.refColumns.join(',')}`;
}

function _diffArrays(baseArr, curArr, keyFn) {
  const baseMap = new Map((baseArr || []).map((x) => [keyFn(x), x]));
  const curMap = new Map((curArr || []).map((x) => [keyFn(x), x]));
  const added = [...curMap.values()].filter((x) => !baseMap.has(keyFn(x)));
  const removed = [...baseMap.values()].filter((x) => !curMap.has(keyFn(x)));
  return { added, removed };
}

module.exports = { diffSchemas };
