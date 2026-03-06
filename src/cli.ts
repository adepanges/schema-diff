#!/usr/bin/env node
import { program } from 'commander';
import { run } from './core';

// Use require() for package.json to avoid rootDir constraint
const pkg = require('../package.json') as { version: string };

program
  .name('schema-diff')
  .description('Migration-tool agnostic database schema diff tool')
  .version(pkg.version);

program
  .command('diff')
  .description('Run migrations and produce a schema diff report')
  .requiredOption('--db-engine <engine>', 'Database engine: postgres | mysql | sqlite')
  .option('--db-version <version>', 'Docker image version tag', 'latest')
  .requiredOption('--migrate-command <cmd>', 'Shell command to run your migrations')
  .option('--migrations-path <path>', 'Working directory for the migration command', process.cwd())
  .option('--baseline <file>', 'Baseline DBML or SQL file to diff against')
  .option('--output-dir <path>', 'Directory to write output files', '.schema-diff')
  .option('--format <format>', 'Report format: markdown | text | json', 'markdown')
  .option('--fail-on-destructive', 'Exit with code 1 if destructive changes are detected', false)
  .action(async (opts: {
    dbEngine: string;
    dbVersion: string;
    migrateCommand: string;
    migrationsPath: string;
    baseline?: string;
    outputDir: string;
    format: string;
    failOnDestructive: boolean;
  }) => {
    try {
      const result = await run({
        dbEngine: opts.dbEngine,
        dbVersion: opts.dbVersion,
        migrateCommand: opts.migrateCommand,
        migrationsPath: opts.migrationsPath,
        baselineFile: opts.baseline || null,
        outputDir: opts.outputDir,
        format: opts.format,
        failOnDestructive: opts.failOnDestructive,
      });

      console.log(result.report);
      console.log(`\nOutput written to: ${result.outputDir}`);

      if (result.diff.hasDestructive && opts.failOnDestructive) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
