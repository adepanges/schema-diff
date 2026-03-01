'use strict';

const fs = require('fs');
const path = require('path');

const { DbManager } = require('./db/manager');
const { runMigration } = require('./migrate/runner');
const { dumpSchema } = require('./schema/dumper');
const { parseSchema } = require('./schema/parser');
const { toDbml } = require('./schema/dbml');
const { diffSchemas } = require('./diff/engine');
const { generateReport } = require('./report/generator');

/**
 * Main schema-diff flow.
 *
 * @param {object} opts
 * @param {string}  opts.dbEngine          'postgres' | 'mysql'
 * @param {string}  [opts.dbVersion]       Docker image tag (default 'latest')
 * @param {string}  opts.migrateCommand    Shell command to run migrations
 * @param {string}  [opts.migrationsPath]  Working directory for the migration command
 * @param {string}  [opts.baselineFile]    Path to a baseline DBML file (optional)
 * @param {string}  [opts.outputDir]       Directory to write output files (default '.schema-diff')
 * @param {string}  [opts.format]          Report format: 'markdown' | 'text' | 'json'
 * @param {boolean} [opts.failOnDestructive]  Throw if destructive changes found
 * @param {function} [opts.log]            Logger function (default console.log)
 * @returns {Promise<RunResult>}
 *
 * RunResult: {
 *   report: string,
 *   diff: DiffResult,
 *   currentDbml: string,
 *   currentSql: string,
 *   outputDir: string,
 * }
 */
async function run(opts) {
  const {
    dbEngine,
    dbVersion = 'latest',
    migrateCommand,
    migrationsPath = process.cwd(),
    baselineFile = null,
    outputDir = '.schema-diff',
    format = 'markdown',
    failOnDestructive = false,
    log = console.log,
  } = opts;

  if (!dbEngine) throw new Error('dbEngine is required');
  if (!migrateCommand) throw new Error('migrateCommand is required');

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Start ephemeral DB
  log(`[schema-diff] Starting ${dbEngine}:${dbVersion} container...`);
  const db = new DbManager(dbEngine, dbVersion);
  await db.start();

  let currentSql;
  let currentDbml;
  let diff;
  let report;

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

    // 3. Dump schema
    log('[schema-diff] Dumping schema...');
    const dbCfg = { ...db.getConfig(), containerId: db.containerId };
    currentSql = dumpSchema(dbCfg);
    fs.writeFileSync(path.join(outputDir, 'dump.sql'), currentSql, 'utf8');

    // 4. Parse and convert to DBML
    const currentSchema = parseSchema(currentSql);
    currentDbml = toDbml(currentSchema);
    fs.writeFileSync(path.join(outputDir, 'current.dbml'), currentDbml, 'utf8');

    // 5. Load/parse baseline
    let baselineSchema;
    if (baselineFile && fs.existsSync(baselineFile)) {
      log(`[schema-diff] Loading baseline from ${baselineFile}`);
      // Baseline can be a DBML file or SQL dump
      const baselineContent = fs.readFileSync(baselineFile, 'utf8');
      baselineSchema = parseSchema(baselineContent);
      fs.writeFileSync(path.join(outputDir, 'baseline.dbml'), toDbml(baselineSchema), 'utf8');
    } else {
      log('[schema-diff] No baseline provided — treating all tables as new');
      baselineSchema = { tables: {} };
    }

    // 6. Diff
    log('[schema-diff] Computing diff...');
    diff = diffSchemas(baselineSchema, currentSchema);

    // 7. Generate report
    const schemas = { baseline: baselineSchema, current: currentSchema };
    report = generateReport(diff, schemas, format);
    const ext = format === 'json' ? 'json' : format === 'text' ? 'txt' : 'md';
    fs.writeFileSync(path.join(outputDir, `diff.${ext}`), report, 'utf8');

    // 8. Fail on destructive (if requested)
    if (failOnDestructive && diff.hasDestructive) {
      throw new Error('Destructive schema changes detected. See the diff report for details.');
    }
  } finally {
    log('[schema-diff] Stopping database container...');
    await db.stop();
  }

  return { report, diff, currentDbml, currentSql, outputDir };
}

module.exports = { run };
