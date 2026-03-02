# DBML-Powered Schema Diffing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate `@dbml/core` as the DBML I/O layer for SQL→DBML conversion and baseline reading, add multi-schema dump support with PostgreSQL namespace discovery, and write output to `schemas/` directory.

**Architecture:** Hybrid approach — keep existing SQL parser (`parser.js`) and diff engine (`engine.js`) unchanged. New `dbml-io.js` module wraps `@dbml/core` for SQL→DBML and DBML→internal-model conversion. New `discovery.js` module discovers PostgreSQL namespaces. Updated `dumper.js` supports per-schema dumps. Updated `core.js` orchestrates the new pipeline.

**Tech Stack:** Node.js, `@dbml/core` (already in package.json), Jest for testing, `commander` for CLI.

---

### Task 1: Create `src/schema/dbml-io.js` — `sqlToDbml()`

**Files:**
- Create: `src/schema/dbml-io.js`
- Create: `tests/unit/dbml-io.test.js`

**Step 1: Write the failing test for `sqlToDbml`**

```js
// tests/unit/dbml-io.test.js
'use strict';

const { sqlToDbml } = require('../../src/schema/dbml-io');

const PG_DUMP = `
CREATE TABLE users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    name text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title varchar(500) NOT NULL,
    body text,
    published boolean DEFAULT false
);

ALTER TABLE ONLY posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_users_email ON users USING btree (email);
CREATE INDEX idx_posts_user_id ON posts USING btree (user_id);
`;

const MYSQL_DUMP = `
CREATE TABLE \`orders\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`customer_id\` int(11) NOT NULL,
  \`total\` decimal(10,2) NOT NULL,
  \`status\` varchar(50) DEFAULT 'pending',
  PRIMARY KEY (\`id\`),
  KEY \`idx_orders_customer\` (\`customer_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

describe('sqlToDbml', () => {
  test('converts PostgreSQL dump to DBML string', () => {
    const dbml = sqlToDbml(PG_DUMP, 'postgres');
    expect(typeof dbml).toBe('string');
    expect(dbml).toContain('Table');
    expect(dbml).toContain('users');
    expect(dbml).toContain('posts');
    expect(dbml).toContain('Ref');
  });

  test('converts MySQL dump to DBML string', () => {
    const dbml = sqlToDbml(MYSQL_DUMP, 'mysql');
    expect(typeof dbml).toBe('string');
    expect(dbml).toContain('orders');
  });

  test('returns empty string for empty SQL', () => {
    const dbml = sqlToDbml('', 'postgres');
    expect(dbml).toBe('');
  });

  test('throws for unsupported engine', () => {
    expect(() => sqlToDbml('SELECT 1', 'mssql')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/dbml-io.test.js --testNamePattern="sqlToDbml" -v`
Expected: FAIL — `Cannot find module '../../src/schema/dbml-io'`

**Step 3: Write minimal implementation**

```js
// src/schema/dbml-io.js
'use strict';

const { importer } = require('@dbml/core');

const SUPPORTED_ENGINES = {
  postgres: 'postgres',
  mysql: 'mysql',
};

/**
 * Convert a SQL dump string to a DBML string using @dbml/core.
 *
 * @param {string} sql     SQL DDL string (from pg_dump, mysqldump, etc.)
 * @param {string} engine  'postgres' | 'mysql'
 * @returns {string}       DBML string
 */
function sqlToDbml(sql, engine) {
  if (!sql || !sql.trim()) return '';

  const format = SUPPORTED_ENGINES[engine];
  if (!format) {
    throw new Error(`sqlToDbml: unsupported engine "${engine}". Supported: ${Object.keys(SUPPORTED_ENGINES).join(', ')}`);
  }

  return importer.import(sql, format);
}

module.exports = { sqlToDbml };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/dbml-io.test.js --testNamePattern="sqlToDbml" -v`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/schema/dbml-io.js tests/unit/dbml-io.test.js
git commit -m "feat: add sqlToDbml() using @dbml/core importer"
```

---

### Task 2: Add `dbmlToSchema()` to `src/schema/dbml-io.js`

**Files:**
- Modify: `src/schema/dbml-io.js`
- Modify: `tests/unit/dbml-io.test.js`

**Step 1: Write the failing test for `dbmlToSchema`**

Append to `tests/unit/dbml-io.test.js`:

```js
const { dbmlToSchema } = require('../../src/schema/dbml-io');

const SAMPLE_DBML = `
Table "users" {
  "id" integer [not null]
  "email" varchar(255) [not null]
  "name" text
  "created_at" timestamp [default: \`now()\`]

  Indexes {
    id [pk, name: "users_pkey"]
    email [unique, name: "idx_users_email"]
  }
}

Table "posts" {
  "id" integer [pk, not null]
  "user_id" integer [not null]
  "title" varchar(500) [not null]

  Indexes {
    user_id [name: "idx_posts_user"]
  }
}

Ref "posts_user_fk":"posts"."user_id" > "users"."id" [delete: cascade]
`;

describe('dbmlToSchema', () => {
  let schema;

  beforeAll(() => {
    schema = dbmlToSchema(SAMPLE_DBML);
  });

  test('returns object with tables key', () => {
    expect(schema).toHaveProperty('tables');
  });

  test('parses table names', () => {
    expect(Object.keys(schema.tables)).toEqual(expect.arrayContaining(['users', 'posts']));
  });

  test('parses columns with correct structure', () => {
    const col = schema.tables.users.columns.email;
    expect(col).toEqual({
      name: 'email',
      type: 'varchar(255)',
      nullable: false,
      default: null,
      pk: false,
    });
  });

  test('parses primary key from index', () => {
    expect(schema.tables.users.primaryKey).toContain('id');
    expect(schema.tables.users.columns.id.pk).toBe(true);
  });

  test('parses primary key from field attribute', () => {
    expect(schema.tables.posts.primaryKey).toContain('id');
    expect(schema.tables.posts.columns.id.pk).toBe(true);
  });

  test('parses nullable correctly', () => {
    expect(schema.tables.users.columns.name.nullable).toBe(true);
    expect(schema.tables.users.columns.id.nullable).toBe(false);
  });

  test('parses default value', () => {
    expect(schema.tables.users.columns.created_at.default).toBe('now()');
  });

  test('parses unique index', () => {
    const idx = schema.tables.users.indexes.find((i) => i.name === 'idx_users_email');
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(true);
    expect(idx.columns).toEqual(['email']);
  });

  test('parses non-unique index', () => {
    const idx = schema.tables.posts.indexes.find((i) => i.name === 'idx_posts_user');
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(false);
    expect(idx.columns).toEqual(['user_id']);
  });

  test('parses foreign key', () => {
    const fk = schema.tables.posts.foreignKeys[0];
    expect(fk).toBeDefined();
    expect(fk.name).toBe('posts_user_fk');
    expect(fk.columns).toEqual(['user_id']);
    expect(fk.refTable).toBe('users');
    expect(fk.refColumns).toEqual(['id']);
    expect(fk.onDelete).toBe('CASCADE');
  });

  test('returns empty tables for empty DBML', () => {
    const s = dbmlToSchema('');
    expect(s.tables).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/dbml-io.test.js --testNamePattern="dbmlToSchema" -v`
Expected: FAIL — `dbmlToSchema is not a function`

**Step 3: Write minimal implementation**

Add to `src/schema/dbml-io.js`:

```js
const { Parser } = require('@dbml/core');

/**
 * Convert a DBML string to the internal schema model used by the diff engine.
 *
 * @param {string} dbmlStr  DBML string
 * @returns {object}        { tables: { [name]: { name, columns, primaryKey, indexes, foreignKeys } } }
 */
function dbmlToSchema(dbmlStr) {
  if (!dbmlStr || !dbmlStr.trim()) return { tables: {} };

  const parser = new Parser();
  const db = parser.parse(dbmlStr, 'dbml');
  const dbSchema = db.schemas[0];
  if (!dbSchema) return { tables: {} };

  const tables = {};

  for (const table of dbSchema.tables) {
    const columns = {};
    const primaryKey = [];
    const indexes = [];

    // Parse fields
    for (const field of table.fields) {
      const isPk = field.pk === true;
      const isNotNull = field.not_null === true;
      let defaultVal = null;
      if (field.dbdefault) {
        defaultVal = field.dbdefault.value;
      }

      columns[field.name] = {
        name: field.name,
        type: field.type.type_name,
        nullable: !isNotNull,
        default: defaultVal,
        pk: isPk,
      };

      if (isPk) primaryKey.push(field.name);
    }

    // Parse indexes
    for (const idx of table.indexes) {
      const cols = idx.columns.map((c) => c.value);

      if (idx.pk) {
        // PK index — mark columns as pk
        for (const colName of cols) {
          if (columns[colName]) columns[colName].pk = true;
          if (!primaryKey.includes(colName)) primaryKey.push(colName);
        }
      } else {
        indexes.push({
          name: idx.name || null,
          columns: cols,
          unique: idx.unique === true,
        });
      }
    }

    tables[table.name] = {
      name: table.name,
      columns,
      primaryKey,
      indexes,
      foreignKeys: [],
    };
  }

  // Parse refs (foreign keys)
  for (const ref of dbSchema.refs) {
    if (ref.endpoints.length < 2) continue;

    // Find the "many" side (relation === '*') as the FK source
    const manyEnd = ref.endpoints.find((e) => e.relation === '*');
    const oneEnd = ref.endpoints.find((e) => e.relation === '1');
    if (!manyEnd || !oneEnd) continue;

    const sourceTable = tables[manyEnd.tableName];
    if (!sourceTable) continue;

    sourceTable.foreignKeys.push({
      name: ref.name || null,
      columns: manyEnd.fieldNames,
      refTable: oneEnd.tableName,
      refColumns: oneEnd.fieldNames,
      onDelete: ref.onDelete ? ref.onDelete.toUpperCase() : null,
      onUpdate: ref.onUpdate ? ref.onUpdate.toUpperCase() : null,
    });
  }

  return { tables };
}

module.exports = { sqlToDbml, dbmlToSchema };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/dbml-io.test.js -v`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/schema/dbml-io.js tests/unit/dbml-io.test.js
git commit -m "feat: add dbmlToSchema() to convert DBML to internal model"
```

---

### Task 3: Add round-trip test — SQL→DBML→internal model→diff

**Files:**
- Modify: `tests/unit/dbml-io.test.js`

**Step 1: Write the round-trip test**

Append to `tests/unit/dbml-io.test.js`:

```js
const { diffSchemas } = require('../../src/diff/engine');

describe('round-trip: SQL → DBML → schema → diff', () => {
  test('baseline and current from SQL produce correct diff', () => {
    const baselineSql = `
      CREATE TABLE users (
        id integer NOT NULL,
        email varchar(255) NOT NULL,
        CONSTRAINT users_pkey PRIMARY KEY (id)
      );
    `;
    const currentSql = `
      CREATE TABLE users (
        id integer NOT NULL,
        email varchar(255) NOT NULL,
        phone varchar(20),
        CONSTRAINT users_pkey PRIMARY KEY (id)
      );
      CREATE TABLE orders (
        id integer NOT NULL,
        user_id integer NOT NULL,
        CONSTRAINT orders_pkey PRIMARY KEY (id)
      );
      ALTER TABLE ONLY orders ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id);
    `;

    const baselineDbml = sqlToDbml(baselineSql, 'postgres');
    const currentDbml = sqlToDbml(currentSql, 'postgres');

    const baselineSchema = dbmlToSchema(baselineDbml);
    const currentSchema = dbmlToSchema(currentDbml);

    const diff = diffSchemas(baselineSchema, currentSchema);

    expect(diff.addedTables).toContain('orders');
    expect(diff.removedTables).toHaveLength(0);
    expect(diff.modifiedTables.users).toBeDefined();
    expect(diff.modifiedTables.users.addedColumns).toContain('phone');
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx jest tests/unit/dbml-io.test.js --testNamePattern="round-trip" -v`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/dbml-io.test.js
git commit -m "test: add round-trip SQL→DBML→schema→diff integration test"
```

---

### Task 4: Create `src/schema/discovery.js`

**Files:**
- Create: `src/schema/discovery.js`
- Create: `tests/unit/discovery.test.js`

**Step 1: Write the failing test**

```js
// tests/unit/discovery.test.js
'use strict';

const { discoverSchemas } = require('../../src/schema/discovery');

describe('discoverSchemas', () => {
  test('returns ["schema"] for mysql engine', () => {
    const result = discoverSchemas({ engine: 'mysql' });
    expect(result).toEqual(['schema']);
  });

  test('returns ["schema"] for sqlite engine', () => {
    const result = discoverSchemas({ engine: 'sqlite' });
    expect(result).toEqual(['schema']);
  });

  test('returns ["schema"] for postgres when query fails (no container)', () => {
    // Without a running container, falls back to ['schema']
    const result = discoverSchemas({ engine: 'postgres', containerId: 'nonexistent', dbName: 'test', user: 'test', password: 'test' });
    expect(result).toEqual(['schema']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/discovery.test.js -v`
Expected: FAIL — `Cannot find module`

**Step 3: Write minimal implementation**

```js
// src/schema/discovery.js
'use strict';

const { spawnSync } = require('child_process');

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

/**
 * Discover database schemas/namespaces.
 *
 * @param {object} dbCfg  { engine, containerId, dbName, user, password }
 * @param {string[]} [filter]  If provided, return only these schemas (skip discovery).
 * @returns {string[]}  Schema names (e.g., ['public', 'auth'] or ['schema'])
 */
function discoverSchemas(dbCfg, filter) {
  if (filter && filter.length > 0) {
    return filter;
  }

  if (dbCfg.engine !== 'postgres') {
    return ['schema'];
  }

  return _discoverPostgresSchemas(dbCfg);
}

function _discoverPostgresSchemas(dbCfg) {
  const { containerId, dbName, user, password } = dbCfg;
  const query = `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(', ')}) ORDER BY schema_name;`;

  const result = spawnSync(
    'docker',
    [
      'exec', '-e', `PGPASSWORD=${password}`,
      containerId,
      'psql', '-U', user, '-d', dbName,
      '-t', '-A', '-c', query,
    ],
    { encoding: 'utf8', timeout: 15000 }
  );

  if (result.status !== 0 || !result.stdout || !result.stdout.trim()) {
    // Fallback: if discovery fails, return a single default
    return ['schema'];
  }

  const schemas = result.stdout
    .trim()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return schemas.length > 0 ? schemas : ['schema'];
}

module.exports = { discoverSchemas };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/discovery.test.js -v`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/schema/discovery.js tests/unit/discovery.test.js
git commit -m "feat: add schema discovery for PostgreSQL namespaces"
```

---

### Task 5: Update `src/schema/dumper.js` — multi-schema dumps

**Files:**
- Modify: `src/schema/dumper.js`
- Modify: `tests/unit/dumper.test.js` (create if not exists)

**Step 1: Write the failing test**

```js
// tests/unit/dumper.test.js
'use strict';

const { dumpSchemas } = require('../../src/schema/dumper');

describe('dumpSchemas', () => {
  test('sqlite returns { schema: sql } with single key', () => {
    // This requires sqlite3 to be installed, but the point is the shape
    // We test with an empty db file
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dumper-test-'));
    const dbFile = path.join(tmpDir, 'test.db');
    // Create empty db
    const { spawnSync } = require('child_process');
    spawnSync('sqlite3', [dbFile, 'SELECT 1;'], { encoding: 'utf8' });

    const result = dumpSchemas({ engine: 'sqlite', dbFile }, ['schema']);
    expect(result).toHaveProperty('schema');
    expect(typeof result.schema).toBe('string');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns object keyed by schema name', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dumper-test-'));
    const dbFile = path.join(tmpDir, 'test.db');
    const { spawnSync } = require('child_process');
    spawnSync('sqlite3', [dbFile, 'CREATE TABLE users (id INTEGER PRIMARY KEY);'], { encoding: 'utf8' });

    const result = dumpSchemas({ engine: 'sqlite', dbFile }, ['schema']);
    expect(result.schema).toContain('CREATE TABLE');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/dumper.test.js -v`
Expected: FAIL — `dumpSchemas is not a function`

**Step 3: Update `src/schema/dumper.js`**

Keep the existing `dumpSchema()` for backward compatibility, add `dumpSchemas()`:

```js
// Add to src/schema/dumper.js

/**
 * Dump schemas from a running database, one SQL string per schema name.
 *
 * @param {object} dbCfg         { engine, containerId, dbName, user, password, dbFile }
 * @param {string[]} schemaNames  Schema names to dump (e.g., ['public', 'auth'] or ['schema'])
 * @returns {{ [name: string]: string }}  Map of schema name to SQL DDL string
 */
function dumpSchemas(dbCfg, schemaNames) {
  const { engine } = dbCfg;
  const result = {};

  for (const name of schemaNames) {
    if (engine === 'postgres') {
      result[name] = _dumpPostgresSchema(dbCfg.containerId, dbCfg.dbName, dbCfg.user, dbCfg.password, name);
    } else if (engine === 'mysql') {
      result[name] = _dumpMysql(dbCfg.containerId, dbCfg.dbName, dbCfg.user, dbCfg.password);
    } else if (engine === 'sqlite') {
      result[name] = _dumpSqlite(dbCfg.dbFile);
    } else {
      throw new Error(`Schema dump not supported for engine: ${engine}`);
    }
  }

  return result;
}

function _dumpPostgresSchema(containerId, dbName, user, password, schemaName) {
  const result = spawnSync(
    'docker',
    ['exec', '-e', `PGPASSWORD=${password}`, containerId,
      'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
      '--no-comments', '-n', schemaName, '-U', user, '-d', dbName,
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
  if (result.status !== 0) {
    throw new Error(`pg_dump failed for schema ${schemaName}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
```

Update the module exports: `module.exports = { dumpSchema, dumpSchemas };`

**Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/dumper.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/schema/dumper.js tests/unit/dumper.test.js
git commit -m "feat: add dumpSchemas() for multi-schema SQL dumps"
```

---

### Task 6: Update `src/core.js` — new pipeline

**Files:**
- Modify: `src/core.js`
- Test file: existing tests still pass (run full suite)

**Step 1: Update `src/core.js`**

Replace the current `run()` function body with the new pipeline:

```js
'use strict';

const fs = require('fs');
const path = require('path');

const { DbManager } = require('./db/manager');
const { runMigration } = require('./migrate/runner');
const { dumpSchemas } = require('./schema/dumper');
const { discoverSchemas } = require('./schema/discovery');
const { sqlToDbml, dbmlToSchema } = require('./schema/dbml-io');
const { diffSchemas } = require('./diff/engine');
const { generateReport } = require('./report/generator');

/**
 * Main schema-diff flow.
 *
 * @param {object} opts
 * @param {string}   opts.dbEngine
 * @param {string}   [opts.dbVersion]
 * @param {string}   opts.migrateCommand
 * @param {string}   [opts.migrationsPath]
 * @param {string}   [opts.baselineFile]    Path to baseline SQL file
 * @param {string}   [opts.outputDir]       Parent directory (schemas/ goes inside)
 * @param {string}   [opts.format]
 * @param {boolean}  [opts.failOnDestructive]
 * @param {boolean}  [opts.outputDbml]
 * @param {string[]} [opts.schemas]         Specific schemas to dump (empty = all)
 * @param {function} [opts.log]
 * @returns {Promise<RunResult>}
 */
async function run(opts) {
  const {
    dbEngine,
    dbVersion = 'latest',
    migrateCommand,
    migrationsPath = process.cwd(),
    baselineFile = null,
    outputDir = '.',
    format = 'markdown',
    failOnDestructive = false,
    outputDbml = true,
    schemas: schemaFilter = [],
    log = console.log,
  } = opts;

  if (!dbEngine) throw new Error('dbEngine is required');
  if (!migrateCommand) throw new Error('migrateCommand is required');

  const schemasDir = path.join(outputDir, 'schemas');
  const workDir = path.join(outputDir, '.schema-diff');
  fs.mkdirSync(schemasDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  // 1. Start ephemeral DB
  log(`[schema-diff] Starting ${dbEngine}:${dbVersion} container...`);
  const db = new DbManager(dbEngine, dbVersion);
  await db.start();

  let report;
  let diff;
  let currentDbmls = {};

  try {
    // 2. Run migrations
    log(`[schema-diff] Running migration command: ${migrateCommand}`);
    const connEnv = db.getConnectionEnv();
    try {
      const result = runMigration(migrateCommand, migrationsPath, connEnv);
      if (result.stdout) log(result.stdout);
      if (result.stderr) log(result.stderr);
    } catch (err) {
      throw new Error(`Migration failed: ${err.message}`);
    }

    // 3. Discover schemas
    const dbCfg = { ...db.getConfig(), containerId: db.containerId };
    const schemaNames = discoverSchemas(dbCfg, schemaFilter);
    log(`[schema-diff] Discovered schemas: ${schemaNames.join(', ')}`);

    // 4. Dump each schema as SQL
    log('[schema-diff] Dumping schemas...');
    const sqlDumps = dumpSchemas(dbCfg, schemaNames);

    // 5. Convert to DBML, save files, build models
    const allDiffs = {};
    let hasDestructive = false;

    for (const [name, sql] of Object.entries(sqlDumps)) {
      // Write SQL dump
      fs.writeFileSync(path.join(schemasDir, `${name}.sql`), sql, 'utf8');

      // SQL → DBML
      const currentDbml = sqlToDbml(sql, dbEngine);
      currentDbmls[name] = currentDbml;
      fs.writeFileSync(path.join(workDir, `${name}.current.dbml`), currentDbml, 'utf8');

      if (outputDbml) {
        fs.writeFileSync(path.join(schemasDir, `${name}.dbml`), currentDbml, 'utf8');
      }

      // DBML → internal schema model
      const currentSchema = dbmlToSchema(currentDbml);

      // Load baseline
      let baselineSchema = { tables: {} };
      const baselineSqlFile = baselineFile || path.join(schemasDir, `${name}.sql`);
      // Only use baseline if it's a different file from what we just wrote
      if (baselineFile && fs.existsSync(baselineFile)) {
        log(`[schema-diff] Loading baseline from ${baselineFile}`);
        const baselineSql = fs.readFileSync(baselineFile, 'utf8');
        const baselineDbml = sqlToDbml(baselineSql, dbEngine);
        baselineSchema = dbmlToSchema(baselineDbml);
        fs.writeFileSync(path.join(workDir, `${name}.baseline.dbml`), baselineDbml, 'utf8');
      } else {
        log(`[schema-diff] No baseline found — treating all tables as new`);
      }

      // Diff
      const schemaDiff = diffSchemas(baselineSchema, currentSchema);
      allDiffs[name] = { diff: schemaDiff, baseline: baselineSchema, current: currentSchema };
      if (schemaDiff.hasDestructive) hasDestructive = true;
    }

    // 6. Generate report (combine all schema diffs)
    // For single-schema case, use it directly. For multi-schema, merge.
    const schemaEntries = Object.entries(allDiffs);
    if (schemaEntries.length === 1) {
      const [, entry] = schemaEntries[0];
      diff = entry.diff;
      report = generateReport(diff, { baseline: entry.baseline, current: entry.current }, format);
    } else {
      // Multi-schema: generate per-schema reports and concatenate
      const reports = [];
      diff = { addedTables: [], removedTables: [], modifiedTables: {}, hasDestructive };
      for (const [name, entry] of schemaEntries) {
        diff.addedTables.push(...entry.diff.addedTables);
        diff.removedTables.push(...entry.diff.removedTables);
        Object.assign(diff.modifiedTables, entry.diff.modifiedTables);
        const schemaReport = generateReport(entry.diff, { baseline: entry.baseline, current: entry.current }, format);
        reports.push(`### Schema: \`${name}\`\n\n${schemaReport}`);
      }
      report = reports.join('\n\n---\n\n');
    }

    // Write report
    const ext = format === 'json' ? 'json' : format === 'text' ? 'txt' : 'md';
    fs.writeFileSync(path.join(workDir, `diff.${ext}`), report, 'utf8');

    // 7. Fail on destructive
    if (failOnDestructive && diff.hasDestructive) {
      throw new Error('Destructive schema changes detected. See the diff report for details.');
    }
  } finally {
    log('[schema-diff] Stopping database container...');
    await db.stop();
  }

  return { report, diff, currentDbmls, schemasDir, outputDir };
}

module.exports = { run };
```

**Step 2: Run all existing tests**

Run: `npx jest -v`
Expected: All existing tests still PASS (parser, diff, report, dbml tests are independent of core.js)

**Step 3: Commit**

```bash
git add src/core.js
git commit -m "feat: update core pipeline with DBML I/O, multi-schema dumps, and schemas/ output"
```

---

### Task 7: Update `src/cli.js` — new CLI options

**Files:**
- Modify: `src/cli.js`

**Step 1: Update CLI**

```js
#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { run } = require('./core');

program
  .name('schema-diff')
  .description('Migration-tool agnostic database schema diff tool')
  .version(require('../package.json').version);

program
  .command('diff')
  .description('Run migrations and produce a schema diff report')
  .requiredOption('--db-engine <engine>', 'Database engine: postgres | mysql | sqlite')
  .option('--db-version <version>', 'Docker image version tag', 'latest')
  .requiredOption('--migrate-command <cmd>', 'Shell command to run your migrations')
  .option('--migrations-path <path>', 'Working directory for the migration command', process.cwd())
  .option('--schemas <list>', 'Comma-separated schemas to dump (default: all)')
  .option('--baseline <file>', 'Baseline SQL file to diff against')
  .option('--output-dir <path>', 'Parent directory for schemas/ output', '.')
  .option('--output-dbml', 'Save .dbml files alongside .sql dumps', false)
  .option('--format <format>', 'Report format: markdown | text | json', 'markdown')
  .option('--fail-on-destructive', 'Exit with code 1 if destructive changes are detected', false)
  .action(async (opts) => {
    try {
      const schemas = opts.schemas ? opts.schemas.split(',').map((s) => s.trim()).filter(Boolean) : [];

      const result = await run({
        dbEngine: opts.dbEngine,
        dbVersion: opts.dbVersion,
        migrateCommand: opts.migrateCommand,
        migrationsPath: opts.migrationsPath,
        baselineFile: opts.baseline || null,
        outputDir: opts.outputDir,
        format: opts.format,
        failOnDestructive: opts.failOnDestructive,
        outputDbml: opts.outputDbml,
        schemas,
      });

      console.log(result.report);
      console.log(`\nSchemas written to: ${result.schemasDir}`);

      if (result.diff.hasDestructive && opts.failOnDestructive) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
```

**Step 2: Verify CLI help renders**

Run: `node src/cli.js diff --help`
Expected: Shows all options including `--schemas`, `--output-dbml`

**Step 3: Commit**

```bash
git add src/cli.js
git commit -m "feat: update CLI with --schemas, --output-dbml options"
```

---

### Task 8: Update `src/main.js` — GitHub Action with summary

**Files:**
- Modify: `src/main.js`

**Step 1: Update GitHub Action entry point**

```js
'use strict';

const core = require('@actions/core');
const github = require('@actions/github');
const path = require('path');

const { run } = require('./core');
const { postPrComment } = require('./github/comment');

async function main() {
  try {
    const dbEngine = core.getInput('db-engine', { required: true });
    const dbVersion = core.getInput('db-version') || 'latest';
    const migrateCommand = core.getInput('migrate-command', { required: true });
    const migrationsPath = core.getInput('migrations-path') || process.cwd();
    const baselineBranch = core.getInput('baseline-branch') || 'main';
    const postComment = core.getBooleanInput('post-pr-comment');
    const outputDbml = core.getBooleanInput('output-dbml');
    const failOnDestructive = core.getBooleanInput('fail-on-destructive');
    const schemasInput = core.getInput('schemas') || '';
    const schemas = schemasInput ? schemasInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const outputDir = '.';
    const format = 'markdown';

    // Resolve baseline: look for committed schemas/*.sql from baseline branch
    // The user is expected to have these files committed from a previous run
    const baselineFile = null; // Resolved per-schema in core.js
    // TODO: support fetching baseline from another branch via git show

    core.info(`[schema-diff] db-engine: ${dbEngine}`);
    core.info(`[schema-diff] db-version: ${dbVersion}`);
    core.info(`[schema-diff] migrate-command: ${migrateCommand}`);
    core.info(`[schema-diff] migrations-path: ${migrationsPath}`);
    core.info(`[schema-diff] baseline-branch: ${baselineBranch}`);
    core.info(`[schema-diff] schemas filter: ${schemas.length > 0 ? schemas.join(', ') : '(all)'}`);

    const result = await run({
      dbEngine,
      dbVersion,
      migrateCommand,
      migrationsPath,
      baselineFile,
      outputDir,
      format,
      failOnDestructive,
      outputDbml,
      schemas,
      log: core.info,
    });

    core.info(result.report);

    // Set outputs
    core.setOutput('diff-report', result.report);
    core.setOutput('has-destructive', String(result.diff.hasDestructive));
    core.setOutput('added-tables', result.diff.addedTables.join(','));
    core.setOutput('removed-tables', result.diff.removedTables.join(','));
    core.setOutput('modified-tables', Object.keys(result.diff.modifiedTables).join(','));
    core.setOutput('schemas-dir', result.schemasDir);

    // Write to GitHub Actions Job Summary
    await core.summary.addRaw(result.report).write();

    if (outputDbml) {
      core.info(`[schema-diff] DBML snapshots written to ${result.schemasDir}`);
    }

    // Post PR comment
    if (postComment && github.context.payload.pull_request) {
      const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
      if (!token) {
        core.warning('[schema-diff] github-token not provided — skipping PR comment');
      } else {
        const octokit = github.getOctokit(token);
        await postPrComment(octokit, github.context, result.report);
        core.info('[schema-diff] Posted diff report as PR comment');
      }
    }

    if (result.diff.hasDestructive) {
      core.warning('[schema-diff] Destructive schema changes detected!');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
```

**Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: update GitHub Action with job summary, schemas filter, output-dbml"
```

---

### Task 9: Update `action.yml`

**Files:**
- Modify: `action.yml`

**Step 1: Update action definition**

Add `schemas` input, update `output-sql-dump` → removed, update outputs:

```yaml
name: 'schema-diff'
description: 'Migration-tool agnostic database schema diff — detects schema changes across any migration tool'
author: 'adepanges'

inputs:
  db-engine:
    description: 'Database engine: postgres | mysql | sqlite'
    required: true
  db-version:
    description: 'Docker image version tag (e.g. "15", "8.0", "latest")'
    required: false
    default: 'latest'
  migrate-command:
    description: 'Shell command to run your migrations (e.g. "npx db-migrate up" or "flyway migrate")'
    required: true
  migrations-path:
    description: 'Working directory for the migration command (defaults to repository root)'
    required: false
    default: '.'
  schemas:
    description: 'Comma-separated list of schemas to dump (default: all discovered schemas)'
    required: false
    default: ''
  baseline-branch:
    description: 'Branch whose schemas/*.sql files are used as baseline'
    required: false
    default: 'main'
  post-pr-comment:
    description: 'Post the diff report as a PR comment'
    required: false
    default: 'true'
  github-token:
    description: 'GitHub token for posting PR comments (defaults to GITHUB_TOKEN env var)'
    required: false
    default: ''
  output-dbml:
    description: 'Save .dbml files alongside SQL dumps in schemas/'
    required: false
    default: 'true'
  fail-on-destructive:
    description: 'Fail the workflow if destructive schema changes are detected'
    required: false
    default: 'false'

outputs:
  diff-report:
    description: 'The full schema diff report (markdown)'
  has-destructive:
    description: '"true" if destructive changes were detected'
  added-tables:
    description: 'Comma-separated list of added table names'
  removed-tables:
    description: 'Comma-separated list of removed table names'
  modified-tables:
    description: 'Comma-separated list of modified table names'
  schemas-dir:
    description: 'Path to the schemas/ directory containing SQL and DBML dumps'

runs:
  using: 'node20'
  main: 'src/main.js'

branding:
  icon: 'database'
  color: 'blue'
```

**Step 2: Commit**

```bash
git add action.yml
git commit -m "feat: update action.yml with schemas filter, output-dbml, remove output-sql-dump"
```

---

### Task 10: Run full test suite and fix any failures

**Files:**
- All test files

**Step 1: Run full suite**

Run: `npx jest --coverage -v`
Expected: All tests PASS

**Step 2: Fix any failures**

If any tests fail (especially existing tests that may reference old `core.js` exports or old `dumpSchema` signature), update them.

**Step 3: Commit**

```bash
git add -A
git commit -m "test: fix any broken tests after pipeline refactor"
```

---

### Task 11: Remove unused `src/schema/dbml.js` (old toDbml)

**Files:**
- Delete: `src/schema/dbml.js`
- Modify: `tests/unit/dbml.test.js` — delete or repurpose
- Verify no other files import it

**Step 1: Check for remaining imports**

Run: `grep -r "schema/dbml" src/ tests/ --include="*.js" -l`

Remove any references to the old module. The new `src/schema/dbml-io.js` replaces it.

**Step 2: Delete old files**

```bash
rm src/schema/dbml.js
rm tests/unit/dbml.test.js
```

**Step 3: Run full suite to confirm nothing breaks**

Run: `npx jest -v`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old toDbml module, replaced by dbml-io.js"
```
