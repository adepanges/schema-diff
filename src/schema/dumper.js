'use strict';

const { spawnSync } = require('child_process');

/**
 * Dump the schema (DDL only) from a running database container.
 *
 * @param {object} dbCfg  { engine, containerId, dbName, user, password, host, port }
 * @returns {string}  SQL DDL string
 */
function dumpSchema(dbCfg) {
  const { engine, containerId, dbName, user, password } = dbCfg;

  if (engine === 'postgres') {
    return _dumpPostgres(containerId, dbName, user, password);
  }
  if (engine === 'mysql') {
    return _dumpMysql(containerId, dbName, user, password);
  }
  if (engine === 'sqlite') {
    return _dumpSqlite(dbCfg.dbFile);
  }
  throw new Error(`Schema dump not supported for engine: ${engine}`);
}

function _dumpPostgres(containerId, dbName, user, password) {
  const result = spawnSync(
    'docker',
    ['exec', '-e', `PGPASSWORD=${password}`, containerId,
      'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
      '--no-comments', '-U', user, '-d', dbName,
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function _dumpMysql(containerId, dbName, user, password) {
  const result = spawnSync(
    'docker',
    ['exec', containerId,
      'mysqldump', '--no-data', '--no-tablespaces', '--skip-comments',
      `--password=${password}`, '-u', user, dbName,
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
  if (result.status !== 0) {
    throw new Error(`mysqldump failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function _dumpSqlite(dbFile) {
  const result = spawnSync('sqlite3', [dbFile, '.schema'], { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) {
    throw new Error(`sqlite3 dump failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

module.exports = { dumpSchema };
