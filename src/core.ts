import fs from 'fs';
import path from 'path';

import { DbManager } from './db/manager';
import { runMigration } from './migrate/runner';
import { dumpSchema } from './schema/dumper';
import { parseSchema } from './schema/parser';
import { toDbml } from './schema/dbml';
import { diffSchemas } from './diff/engine';
import { generateReport } from './report/generator';
import type { RunOptions, RunResult, Schema } from './types';

/**
 * Main schema-diff flow.
 */
export async function run(opts: RunOptions): Promise<RunResult> {
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

  let currentSql: string;
  let currentDbml: string;
  let diff: ReturnType<typeof diffSchemas>;
  let report: string;

  try {
    // 2. Run migrations
    log(`[schema-diff] Running migration command: ${migrateCommand}`);
    const connEnv = db.getConnectionEnv();
    try {
      const result = runMigration(migrateCommand, migrationsPath, connEnv);
      if (result.stdout) log(result.stdout);
      if (result.stderr) log(result.stderr);
    } catch (err) {
      throw new Error(`Migration failed: ${(err as Error).message}`);
    }

    // 3. Dump schema
    log('[schema-diff] Dumping schema...');
    const dbCfg = { ...db.getConfig(), containerId: db.containerId };
    currentSql = dumpSchema(dbCfg as Parameters<typeof dumpSchema>[0]);
    fs.writeFileSync(path.join(outputDir, 'dump.sql'), currentSql, 'utf8');

    // 4. Parse and convert to DBML
    const currentSchema = parseSchema(currentSql);
    currentDbml = toDbml(currentSchema);
    fs.writeFileSync(path.join(outputDir, 'current.dbml'), currentDbml, 'utf8');

    // 5. Load/parse baseline
    let baselineSchema: Schema;
    if (baselineFile && fs.existsSync(baselineFile)) {
      log(`[schema-diff] Loading baseline from ${baselineFile}`);
      // Baseline can be a DBML file or SQL dump
      const baselineContent = fs.readFileSync(baselineFile, 'utf8');
      baselineSchema = parseSchema(baselineContent);
      fs.writeFileSync(path.join(outputDir, 'baseline.dbml'), toDbml(baselineSchema), 'utf8');
    } else {
      log('[schema-diff] No baseline provided — treating all tables as new');
      baselineSchema = { tables: {}, functions: {} };
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
