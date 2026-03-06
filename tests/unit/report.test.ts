import { generateReport } from '../../src/report/generator';
import type { DiffResult, Schema, Table, Column } from '../../src/types';

function emptySchema(): Schema {
  return { tables: {} };
}

function makeSchema(tables: Record<string, Table>): Schema {
  return { tables };
}

function makeTable(name: string, columns: Record<string, Column> = {}): Table {
  return { name, columns, primaryKey: [], indexes: [], foreignKeys: [] };
}

function makeCol(name: string, type = 'integer', nullable = true, def: string | null = null): Column {
  return { name, type, nullable, default: def, pk: false };
}

describe('generateReport — no changes', () => {
  test('markdown report shows no changes message', () => {
    const diff: DiffResult = { addedTables: [], removedTables: [], modifiedTables: {}, hasDestructive: false };
    const report = generateReport(diff, { baseline: emptySchema(), current: emptySchema() }, 'markdown');
    expect(report).toContain('No Schema Changes Detected');
  });

  test('text report shows no changes message', () => {
    const diff: DiffResult = { addedTables: [], removedTables: [], modifiedTables: {}, hasDestructive: false };
    const report = generateReport(diff, { baseline: emptySchema(), current: emptySchema() }, 'text');
    expect(report).toContain('No schema changes detected');
  });

  test('json report is valid JSON', () => {
    const diff: DiffResult = { addedTables: [], removedTables: [], modifiedTables: {}, hasDestructive: false };
    const report = generateReport(diff, { baseline: emptySchema(), current: emptySchema() }, 'json');
    const parsed = JSON.parse(report) as DiffResult;
    expect(parsed.addedTables).toEqual([]);
  });
});

describe('generateReport — added tables', () => {
  test('lists added table in markdown', () => {
    const current = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff: DiffResult = {
      addedTables: ['users'],
      removedTables: [],
      modifiedTables: {},
      hasDestructive: false,
    };
    const report = generateReport(diff, { baseline: emptySchema(), current }, 'markdown');
    expect(report).toContain('Added Tables');
    expect(report).toContain('users');
  });

  test('lists added table in text', () => {
    const current = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff: DiffResult = {
      addedTables: ['users'],
      removedTables: [],
      modifiedTables: {},
      hasDestructive: false,
    };
    const report = generateReport(diff, { baseline: emptySchema(), current }, 'text');
    expect(report).toContain('ADDED TABLES');
    expect(report).toContain('users');
  });
});

describe('generateReport — removed tables', () => {
  test('shows destructive warning for removed table', () => {
    const baseline = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff: DiffResult = {
      addedTables: [],
      removedTables: ['users'],
      modifiedTables: {},
      hasDestructive: true,
    };
    const report = generateReport(diff, { baseline, current: emptySchema() }, 'markdown');
    expect(report).toContain('Removed Tables');
    expect(report).toContain('Destructive');
  });
});

describe('generateReport — modified tables', () => {
  test('shows added and removed columns in diff block', () => {
    const baseline = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email', 'varchar(255)') }),
    });
    const current = makeSchema({
      users: makeTable('users', { id: makeCol('id'), phone: makeCol('phone', 'varchar(20)') }),
    });
    const diff: DiffResult = {
      addedTables: [],
      removedTables: [],
      modifiedTables: {
        users: {
          name: 'users',
          addedColumns: ['phone'],
          removedColumns: ['email'],
          modifiedColumns: {},
          addedIndexes: [],
          removedIndexes: [],
          addedForeignKeys: [],
          removedForeignKeys: [],
        },
      },
      hasDestructive: true,
    };
    const report = generateReport(diff, { baseline, current }, 'markdown');
    expect(report).toContain('Modified Tables');
    expect(report).toContain('users');
    expect(report).toContain('+   phone');
    expect(report).toContain('-   email');
    expect(report).toContain('Destructive change');
  });
});

describe('generateReport — summary counts', () => {
  test('markdown report shows correct counts', () => {
    const current = makeSchema({ orders: makeTable('orders', { id: makeCol('id') }) });
    const diff: DiffResult = {
      addedTables: ['orders'],
      removedTables: [],
      modifiedTables: {},
      hasDestructive: false,
    };
    const report = generateReport(diff, { baseline: emptySchema(), current }, 'markdown');
    expect(report).toContain('1 table');
    expect(report).toContain('0 tables');
  });
});
