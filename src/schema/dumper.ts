import { spawnSync } from 'child_process';

interface DumpConfig {
  engine: string;
  containerId?: string | null;
  dbName?: string;
  user?: string;
  password?: string;
  dbFile?: string | null;
}

/**
 * Dump the schema (DDL only) from a running database container.
 */
export function dumpSchema(dbCfg: DumpConfig): string {
  const { engine, containerId, dbName, user, password } = dbCfg;

  if (engine === 'postgres') {
    return _dumpPostgres(containerId!, dbName!, user!, password!);
  }
  if (engine === 'mysql') {
    return _dumpMysql(containerId!, dbName!, user!, password!);
  }
  if (engine === 'sqlite') {
    return _dumpSqlite(dbCfg.dbFile!);
  }
  throw new Error(`Schema dump not supported for engine: ${engine}`);
}

function _dumpPostgres(containerId: string, dbName: string, user: string, password: string): string {
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

function _dumpMysql(containerId: string, dbName: string, user: string, password: string): string {
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

function _dumpSqlite(dbFile: string): string {
  const result = spawnSync('sqlite3', [dbFile, '.schema'], { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) {
    throw new Error(`sqlite3 dump failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
