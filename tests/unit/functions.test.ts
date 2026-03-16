import { parseSchema } from '../../src/schema/parser';
import { diffSchemas } from '../../src/diff/engine';
import type { Schema, DbFunction } from '../../src/types';

describe('parseSchema — PostgreSQL functions', () => {
  test('parses CREATE FUNCTION with dollar-quoted body', () => {
    const sql = `
      CREATE FUNCTION calculate_tax(amount NUMERIC, rate NUMERIC)
      RETURNS NUMERIC AS $$
        SELECT amount * rate;
      $$ LANGUAGE plpgsql;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['calculate_tax']).toBeDefined();
    const fn = schema.functions['calculate_tax']!;
    expect(fn.kind).toBe('function');
    expect(fn.params).toHaveLength(2);
    expect(fn.params[0]!.name).toBe('amount');
    expect(fn.params[0]!.type).toBe('NUMERIC');
    expect(fn.params[1]!.name).toBe('rate');
    expect(fn.returnType).toBe('NUMERIC');
    expect(fn.language).toBe('plpgsql');
    expect(fn.body).toContain('SELECT');
  });

  test('parses CREATE OR REPLACE FUNCTION', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION get_user(user_id INT)
      RETURNS TEXT AS $$
        SELECT name FROM users WHERE id = user_id;
      $$ LANGUAGE sql;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['get_user']).toBeDefined();
    expect(schema.functions['get_user']!.returnType).toBe('TEXT');
  });

  test('parses CREATE PROCEDURE', () => {
    const sql = `
      CREATE PROCEDURE reset_counters()
      AS $$
        UPDATE counters SET value = 0;
      $$ LANGUAGE sql;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['reset_counters']).toBeDefined();
    expect(schema.functions['reset_counters']!.kind).toBe('procedure');
    expect(schema.functions['reset_counters']!.returnType).toBe('void');
  });

  test('parses function with IN/OUT params', () => {
    const sql = `
      CREATE FUNCTION split_name(IN full_name TEXT, OUT first_name TEXT, OUT last_name TEXT)
      RETURNS RECORD AS $$
        BEGIN
          first_name := split_part(full_name, ' ', 1);
          last_name := split_part(full_name, ' ', 2);
        END;
      $$ LANGUAGE plpgsql;
    `;
    const schema = parseSchema(sql);
    const fn = schema.functions['split_name']!;
    expect(fn.params).toHaveLength(3);
    expect(fn.params[0]!.mode).toBe('IN');
    expect(fn.params[1]!.mode).toBe('OUT');
    expect(fn.params[2]!.mode).toBe('OUT');
  });

  test('parses function with tagged dollar-quote', () => {
    const sql = `
      CREATE FUNCTION tagged_func(x INT)
      RETURNS INT AS $fn$
        SELECT x * 2;
      $fn$ LANGUAGE sql;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['tagged_func']).toBeDefined();
    expect(schema.functions['tagged_func']!.body).toContain('x * 2');
  });
});

describe('parseSchema — MySQL functions', () => {
  test('parses CREATE FUNCTION with BEGIN...END', () => {
    const sql = `
      CREATE FUNCTION add_numbers(a INT, b INT)
      RETURNS INT
      DETERMINISTIC
      BEGIN
        RETURN a + b;
      END;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['add_numbers']).toBeDefined();
    const fn = schema.functions['add_numbers']!;
    expect(fn.kind).toBe('function');
    expect(fn.params).toHaveLength(2);
    expect(fn.returnType).toBe('INT');
    expect(fn.body).toContain('RETURN a + b');
  });

  test('parses CREATE PROCEDURE with BEGIN...END', () => {
    const sql = `
      CREATE PROCEDURE delete_old_orders()
      BEGIN
        DELETE FROM orders WHERE created_at < NOW() - INTERVAL 1 YEAR;
      END;
    `;
    const schema = parseSchema(sql);
    expect(schema.functions['delete_old_orders']).toBeDefined();
    expect(schema.functions['delete_old_orders']!.kind).toBe('procedure');
  });
});

describe('parseSchema — mixed tables and functions', () => {
  test('parses both tables and functions from same SQL', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE FUNCTION greet(username TEXT)
      RETURNS TEXT AS $$
        SELECT 'Hello, ' || username;
      $$ LANGUAGE sql;
    `;
    const schema = parseSchema(sql);
    expect(Object.keys(schema.tables)).toContain('users');
    expect(Object.keys(schema.functions)).toContain('greet');
  });
});

describe('diffSchemas — function diffing', () => {
  function makeSchemaWithFns(fns: Record<string, DbFunction>): Schema {
    return { tables: {}, functions: fns };
  }

  function makeFn(name: string, opts: Partial<DbFunction> = {}): DbFunction {
    return {
      name,
      params: opts.params ?? [],
      returnType: opts.returnType ?? 'void',
      language: opts.language ?? 'sql',
      body: opts.body ?? '',
      kind: opts.kind ?? 'function',
    };
  }

  test('detects added function', () => {
    const baseline = makeSchemaWithFns({});
    const current = makeSchemaWithFns({ greet: makeFn('greet') });
    const diff = diffSchemas(baseline, current);
    expect(diff.addedFunctions).toContain('greet');
    expect(diff.removedFunctions).toHaveLength(0);
  });

  test('detects removed function', () => {
    const baseline = makeSchemaWithFns({ greet: makeFn('greet') });
    const current = makeSchemaWithFns({});
    const diff = diffSchemas(baseline, current);
    expect(diff.removedFunctions).toContain('greet');
    expect(diff.addedFunctions).toHaveLength(0);
  });

  test('identical functions produce no diff', () => {
    const fn = makeFn('greet', { body: 'SELECT 1', returnType: 'INT' });
    const baseline = makeSchemaWithFns({ greet: fn });
    const current = makeSchemaWithFns({ greet: { ...fn } });
    const diff = diffSchemas(baseline, current);
    expect(diff.addedFunctions).toHaveLength(0);
    expect(diff.removedFunctions).toHaveLength(0);
    expect(Object.keys(diff.modifiedFunctions)).toHaveLength(0);
  });

  test('detects body change', () => {
    const baseline = makeSchemaWithFns({ greet: makeFn('greet', { body: 'SELECT 1' }) });
    const current = makeSchemaWithFns({ greet: makeFn('greet', { body: 'SELECT 2' }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedFunctions['greet']).toBeDefined();
    expect(diff.modifiedFunctions['greet']!.bodyChanged).toBe(true);
  });

  test('detects param change', () => {
    const baseline = makeSchemaWithFns({
      calc: makeFn('calc', { params: [{ name: 'x', type: 'INT', mode: 'IN' }] }),
    });
    const current = makeSchemaWithFns({
      calc: makeFn('calc', { params: [{ name: 'x', type: 'INT', mode: 'IN' }, { name: 'y', type: 'INT', mode: 'IN' }] }),
    });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedFunctions['calc']).toBeDefined();
    expect(diff.modifiedFunctions['calc']!.params).toBeDefined();
  });

  test('detects return type change', () => {
    const baseline = makeSchemaWithFns({ calc: makeFn('calc', { returnType: 'INT' }) });
    const current = makeSchemaWithFns({ calc: makeFn('calc', { returnType: 'NUMERIC' }) });
    const diff = diffSchemas(baseline, current);
    expect(diff.modifiedFunctions['calc']).toBeDefined();
    expect(diff.modifiedFunctions['calc']!.returnType).toEqual({ from: 'INT', to: 'NUMERIC' });
  });

  test('function removal does not set hasDestructive', () => {
    const baseline = makeSchemaWithFns({ greet: makeFn('greet') });
    const current = makeSchemaWithFns({});
    const diff = diffSchemas(baseline, current);
    expect(diff.hasDestructive).toBe(false);
  });
});
