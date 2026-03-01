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
    const outputDir = '.schema-diff';
    const format = 'markdown';

    // Resolve baseline DBML snapshot if available (from a previous run artifact or committed file)
    const baselineFile = path.join(outputDir, 'baseline.dbml');

    core.info(`[schema-diff] db-engine: ${dbEngine}`);
    core.info(`[schema-diff] db-version: ${dbVersion}`);
    core.info(`[schema-diff] migrate-command: ${migrateCommand}`);
    core.info(`[schema-diff] migrations-path: ${migrationsPath}`);
    core.info(`[schema-diff] baseline-branch: ${baselineBranch}`);

    const result = await run({
      dbEngine,
      dbVersion,
      migrateCommand,
      migrationsPath,
      baselineFile,
      outputDir,
      format,
      failOnDestructive,
      log: core.info,
    });

    core.info(result.report);

    // Set outputs
    core.setOutput('diff-report', result.report);
    core.setOutput('has-destructive', String(result.diff.hasDestructive));
    core.setOutput('added-tables', result.diff.addedTables.join(','));
    core.setOutput('removed-tables', result.diff.removedTables.join(','));
    core.setOutput('modified-tables', Object.keys(result.diff.modifiedTables).join(','));
    core.setOutput('output-dir', result.outputDir);

    if (outputDbml) {
      core.info(`[schema-diff] DBML snapshot written to ${outputDir}/current.dbml`);
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
      core.warning('[schema-diff] ⚠️ Destructive schema changes detected!');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
