import { diffSchemas } from '../../src/diff/engine';
import type { Schema, Table, Column } from '../../src/types';

function makeSchema(tables: Record<string, Table>): Schema {
  return { tables, functions: {} };
}

function makeTable(
  name: string,
  columns: Record<string, Column> = {},
  opts: { primaryKey?: string[]; indexes?: Table['indexes']; foreignKeys?: Table['foreignKeys'] } = {}
): Table {
  return {
    name,
    columns,
    primaryKey: opts.primaryKey ?? [],
    indexes: opts.indexes ?? [],
    foreignKeys: opts.foreignKeys ?? [],
  };
}

function makeCol(
  name: string,
  type = 'integer',
  opts: { nullable?: boolean; default?: string | null; pk?: boolean } = {}
): Column {
  return {
    name,
    type,
    nullable: opts.nullable !== undefined ? opts.nullable : true,
    default: opts.default ?? null,
    pk: opts.pk ?? false,
  };
}

describe('diffSchemas — table-level changes', () => {
  test('detects added table', () => {
    const baseline = makeSchema({});
    const current = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.addedTables).toContain('users');
    expect(diff.removedTables).toHaveLength(0);
    expect(Object.keys(diff.modifiedTables)).toHaveLength(0);
  });

  test('detects removed table', () => {
    const baseline = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const current = makeSchema({});
    const diff = diffSchemas(baseline, current);
    expect(diff.removedTables).toContain('users');
    expect(diff.addedTables).toHaveLength(0);
  });

  test('detects no changes when schemas are identical', () => {
    const table = makeTable('users', { id: makeCol('id') });
    const baseline = makeSchema({ users: table });
    const current = makeSchema({ users: { ...table } });
    const diff = diffSchemas(baseline, current);
    expect(diff.addedTables).toHaveLength(0);
    expect(diff.removedTables).toHaveLength(0);
    expect(Object.keys(diff.modifiedTables)).toHaveLength(0);
    expect(diff.hasDestructive).toBe(false);
  });
});

describe('diffSchemas — column-level changes', () => {
  test('detects added column', () => {
    const baseline = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const current = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email', 'varchar(255)') }),
    });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']).toBeDefined();
    expect(diff.modifiedTables['users']!.addedColumns).toContain('email');
  });

  test('detects removed column (destructive)', () => {
    const baseline = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email', 'varchar(255)') }),
    });
    const current = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.removedColumns).toContain('email');
    expect(diff.hasDestructive).toBe(true);
  });

  test('detects type change (destructive)', () => {
    const baseline = makeSchema({ users: makeTable('users', { age: makeCol('age', 'integer') }) });
    const current = makeSchema({ users: makeTable('users', { age: makeCol('age', 'varchar(10)') }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.modifiedColumns['age']).toBeDefined();
    expect(diff.modifiedTables['users']!.modifiedColumns['age']!.type).toEqual({ from: 'integer', to: 'varchar(10)' });
    expect(diff.hasDestructive).toBe(true);
  });

  test('detects nullable change to NOT NULL (destructive)', () => {
    const baseline = makeSchema({ users: makeTable('users', { name: makeCol('name', 'text', { nullable: true }) }) });
    const current = makeSchema({ users: makeTable('users', { name: makeCol('name', 'text', { nullable: false }) }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.modifiedColumns['name']).toBeDefined();
    expect(diff.hasDestructive).toBe(true);
  });

  test('nullable change from NOT NULL to nullable is not destructive', () => {
    const baseline = makeSchema({ users: makeTable('users', { name: makeCol('name', 'text', { nullable: false }) }) });
    const current = makeSchema({ users: makeTable('users', { name: makeCol('name', 'text', { nullable: true }) }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.modifiedColumns['name']).toBeDefined();
    expect(diff.hasDestructive).toBe(false);
  });
});

describe('diffSchemas — index changes', () => {
  test('detects added index', () => {
    const baseline = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email') }, { indexes: [] }),
    });
    const current = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email') }, {
        indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
      }),
    });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.addedIndexes).toHaveLength(1);
    expect(diff.modifiedTables['users']!.addedIndexes[0]!.name).toBe('idx_email');
  });

  test('detects removed index', () => {
    const baseline = makeSchema({
      users: makeTable('users', { id: makeCol('id') }, {
        indexes: [{ name: 'idx_email', columns: ['email'], unique: false }],
      }),
    });
    const current = makeSchema({
      users: makeTable('users', { id: makeCol('id') }, { indexes: [] }),
    });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['users']!.removedIndexes).toHaveLength(1);
  });
});

describe('diffSchemas — foreign key changes', () => {
  test('detects added foreign key', () => {
    const fk: Table['foreignKeys'][number] = {
      name: 'fk_user',
      columns: ['user_id'],
      refTable: 'users',
      refColumns: ['id'],
      onDelete: null,
      onUpdate: null,
    };
    const baseline = makeSchema({ posts: makeTable('posts', { id: makeCol('id') }, { foreignKeys: [] }) });
    const current = makeSchema({ posts: makeTable('posts', { id: makeCol('id') }, { foreignKeys: [fk] }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['posts']!.addedForeignKeys).toHaveLength(1);
  });

  test('detects removed foreign key', () => {
    const fk: Table['foreignKeys'][number] = {
      name: 'fk_user',
      columns: ['user_id'],
      refTable: 'users',
      refColumns: ['id'],
      onDelete: null,
      onUpdate: null,
    };
    const baseline = makeSchema({ posts: makeTable('posts', { id: makeCol('id') }, { foreignKeys: [fk] }) });
    const current = makeSchema({ posts: makeTable('posts', { id: makeCol('id') }, { foreignKeys: [] }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedTables['posts']!.removedForeignKeys).toHaveLength(1);
  });
});

describe('diffSchemas — removed table is destructive', () => {
  test('dropping a table is destructive', () => {
    const baseline = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const current = makeSchema({});
    const diff = diffSchemas(baseline, current);
    expect(diff.hasDestructive).toBe(true);
  });
});
