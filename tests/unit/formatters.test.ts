import { formatMarkdown } from '../../src/report/formatter-markdown';
import { formatText } from '../../src/report/formatter-text';
import { formatJson } from '../../src/report/formatter-json';
import { sizeForPr } from '../../src/report/sizer';
import { classify } from '../../src/report/classifier';
import type { DiffResult, Schema, Table, Column } from '../../src/types';

function emptySchema(): Schema {
  return { tables: {}, functions: {} };
}

function makeSchema(tables: Record<string, Table>): Schema {
  return { tables, functions: {} };
}

function makeTable(name: string, columns: Record<string, Column> = {}): Table {
  return { name, columns, primaryKey: [], indexes: [], foreignKeys: [] };
}

function makeCol(name: string, type = 'integer', nullable = true, def: string | null = null): Column {
  return { name, type, nullable, default: def, pk: false };
}

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

describe('formatMarkdown', () => {
  test('no changes produces no-changes message', () => {
    const report = classify(emptyDiff());
    const result = formatMarkdown(report, { baseline: emptySchema(), current: emptySchema() }, emptyDiff());
    expect(result).toContain('No Schema Changes Detected');
  });

  test('added table shows in Added Tables section with dbml', () => {
    const current = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff: DiffResult = { ...emptyDiff(), addedTables: ['users'] };
    const report = classify(diff);
    const result = formatMarkdown(report, { baseline: emptySchema(), current }, diff);
    expect(result).toContain('Added Tables');
    expect(result).toContain('```dbml');
    expect(result).toContain('users');
  });

  test('removed table shows danger badge and destructive warning', () => {
    const baseline = makeSchema({ users: makeTable('users', { id: makeCol('id') }) });
    const diff: DiffResult = { ...emptyDiff(), removedTables: ['users'], hasDestructive: true };
    const report = classify(diff);
    const result = formatMarkdown(report, { baseline, current: emptySchema() }, diff);
    expect(result).toContain('Removed Tables');
    expect(result).toContain('🔴');
    expect(result).toContain('Destructive');
  });

  test('modified table uses collapsible details', () => {
    const baseline = makeSchema({
      users: makeTable('users', { id: makeCol('id'), email: makeCol('email', 'varchar(255)') }),
    });
    const current = makeSchema({
      users: makeTable('users', { id: makeCol('id'), phone: makeCol('phone', 'varchar(20)') }),
    });
    const diff: DiffResult = {
      ...emptyDiff(),
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
    const report = classify(diff);
    const result = formatMarkdown(report, { baseline, current }, diff);
    expect(result).toContain('<details>');
    expect(result).toContain('</details>');
    expect(result).toContain('users');
    expect(result).toContain('+   phone');
    expect(result).toContain('-   email');
  });

  test('severity badge counts in summary table', () => {
    const diff: DiffResult = { ...emptyDiff(), addedTables: ['a'], removedTables: ['b'], hasDestructive: true };
    const report = classify(diff);
    const result = formatMarkdown(report, { baseline: makeSchema({ b: makeTable('b') }), current: makeSchema({ a: makeTable('a') }) }, diff);
    expect(result).toContain('Danger');
    expect(result).toContain('Info');
  });

  test('functions section shows added/removed/modified', () => {
    const baseline: Schema = {
      tables: {},
      functions: {
        calc_tax: { name: 'calc_tax', params: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' }], returnType: 'NUMERIC', language: 'plpgsql', body: 'old', kind: 'function' },
      },
    };
    const current: Schema = {
      tables: {},
      functions: {
        calc_tax: { name: 'calc_tax', params: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' }, { name: 'region', type: 'TEXT', mode: 'IN' }], returnType: 'NUMERIC', language: 'plpgsql', body: 'new', kind: 'function' },
        get_user: { name: 'get_user', params: [{ name: 'id', type: 'INT', mode: 'IN' }], returnType: 'TEXT', language: 'plpgsql', body: 'body', kind: 'function' },
      },
    };
    const diff: DiffResult = {
      ...emptyDiff(),
      addedFunctions: ['get_user'],
      modifiedFunctions: {
        calc_tax: {
          name: 'calc_tax',
          kind: 'function',
          params: {
            from: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' }],
            to: [{ name: 'amount', type: 'NUMERIC', mode: 'IN' }, { name: 'region', type: 'TEXT', mode: 'IN' }],
          },
          bodyChanged: true,
        },
      },
    };
    const report = classify(diff);
    const result = formatMarkdown(report, { baseline, current }, diff);
    expect(result).toContain('Functions');
    expect(result).toContain('get_user');
    expect(result).toContain('Signature changed');
    expect(result).toContain('Body modified');
  });
});

describe('formatText', () => {
  test('no changes produces no-changes message', () => {
    const report = classify(emptyDiff());
    const result = formatText(report);
    expect(result).toContain('No schema changes detected');
  });

  test('severity prefixes present', () => {
    const diff: DiffResult = { ...emptyDiff(), addedTables: ['users'], removedTables: ['old_table'], hasDestructive: true };
    const report = classify(diff);
    const result = formatText(report);
    expect(result).toContain('[INFO]');
    expect(result).toContain('[DANGER]');
    expect(result).toContain('DESTRUCTIVE CHANGES DETECTED');
  });

  test('functions section present', () => {
    const diff: DiffResult = { ...emptyDiff(), addedFunctions: ['my_func'] };
    const report = classify(diff);
    const result = formatText(report);
    expect(result).toContain('FUNCTIONS');
    expect(result).toContain('my_func');
  });
});

describe('formatJson', () => {
  test('contains both classified and diff', () => {
    const diff = emptyDiff();
    const report = classify(diff);
    const result = formatJson(report, diff);
    const parsed = JSON.parse(result);
    expect(parsed.classified).toBeDefined();
    expect(parsed.classified.counts).toEqual({ info: 0, warning: 0, danger: 0 });
    expect(parsed.diff).toBeDefined();
    expect(parsed.diff.addedTables).toEqual([]);
  });
});

describe('sizeForPr', () => {
  test('short report is not truncated', () => {
    const diff = emptyDiff();
    const report = classify(diff);
    const fullReport = 'Short report content';
    const sized = sizeForPr(fullReport, report, diff);
    expect(sized.truncated).toBe(false);
    expect(sized.comment).toBe(fullReport);
    expect(sized.artifact).toBe(fullReport);
  });

  test('oversized report is truncated with summary', () => {
    const diff: DiffResult = { ...emptyDiff(), addedTables: ['users'], removedTables: ['old'] };
    const report = classify(diff);
    const longReport = 'x'.repeat(70_000);
    const sized = sizeForPr(longReport, report, diff);
    expect(sized.truncated).toBe(true);
    expect(sized.comment.length).toBeLessThan(65_536);
    expect(sized.comment).toContain('Summary');
    expect(sized.comment).toContain('users');
    expect(sized.comment).toContain('old');
    expect(sized.artifact).toBe(longReport);
  });
});
