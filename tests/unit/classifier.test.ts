import { classify } from '../../src/report/classifier';
import type { DiffResult } from '../../src/types';

function emptyDiff(): DiffResult {
  return {
    addedTables: [],
    removedTables: [],
    modifiedTables: {},
    addedFunctions: [],
    removedFunctions: [],
    modifiedFunctions: {},
    hasDestructive: false,
  };
}

describe('classify — no changes', () => {
  test('returns empty report for no changes', () => {
    const result = classify(emptyDiff());
    expect(result.changes).toHaveLength(0);
    expect(result.counts).toEqual({ info: 0, warning: 0, danger: 0 });
    expect(result.hasDestructive).toBe(false);
  });
});

describe('classify — table-level', () => {
  test('added table is info', () => {
    const diff = { ...emptyDiff(), addedTables: ['users'] };
    const result = classify(diff);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.severity).toBe('info');
    expect(result.changes[0]!.category).toBe('table');
    expect(result.changes[0]!.action).toBe('added');
    expect(result.counts.info).toBe(1);
  });

  test('removed table is danger', () => {
    const diff = { ...emptyDiff(), removedTables: ['users'], hasDestructive: true };
    const result = classify(diff);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.severity).toBe('danger');
    expect(result.hasDestructive).toBe(true);
  });
});

describe('classify — column-level', () => {
  test('added column is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: ['email'],
          removedColumns: [],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'column' && c.action === 'added')).toBe(true);
  });

  test('removed column is danger', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: ['email'],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'danger' && c.category === 'column')).toBe(true);
    expect(result.hasDestructive).toBe(true);
  });

  test('type change is warning', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: { age: { type: { from: 'integer', to: 'varchar(10)' } } },
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'warning' && c.category === 'column')).toBe(true);
  });

  test('nullable to not-null is warning', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: { name: { nullable: { from: true, to: false } } },
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'warning')).toBe(true);
  });

  test('default changed is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: { status: { default: { from: 'active', to: 'pending' } } },
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.detail.includes('default'))).toBe(true);
  });
});

describe('classify — index and FK', () => {
  test('added index is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: {},
          addedIndexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'index')).toBe(true);
  });

  test('removed index is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [{ name: 'idx_email', columns: ['email'], unique: false }],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'index' && c.action === 'removed')).toBe(true);
  });

  test('added FK is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        posts: {
          name: 'posts',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [{ name: 'fk_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'], onDelete: null, onUpdate: null }],
          removedForeignKeys: [],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'fk')).toBe(true);
  });

  test('removed FK is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedTables: {
        posts: {
          name: 'posts',
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [{ name: 'fk_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'], onDelete: null, onUpdate: null }],
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'fk' && c.action === 'removed')).toBe(true);
  });
});

describe('classify — functions', () => {
  test('added function is info', () => {
    const diff = { ...emptyDiff(), addedFunctions: ['calc_tax'] };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'function' && c.action === 'added')).toBe(true);
  });

  test('removed function is warning', () => {
    const diff = { ...emptyDiff(), removedFunctions: ['calc_tax'] };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'warning' && c.category === 'function' && c.action === 'removed')).toBe(true);
  });

  test('function signature changed is warning', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedFunctions: {
        calc_tax: {
          name: 'calc_tax',
          kind: 'function',
          params: {
            from: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' as const }],
            to: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' as const }, { name: 'region', type: 'TEXT', mode: 'IN' as const }],
          },
          bodyChanged: false,
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'warning' && c.category === 'function')).toBe(true);
  });

  test('function body changed is info', () => {
    const diff: DiffResult = {
      ...emptyDiff(),
      modifiedFunctions: {
        calc_tax: {
          name: 'calc_tax',
          kind: 'function',
          bodyChanged: true,
        },
      },
    };
    const result = classify(diff);
    expect(result.changes.some((c) => c.severity === 'info' && c.category === 'function' && c.detail.includes('body'))).toBe(true);
  });
});
