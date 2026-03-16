import fs from 'fs';
import { DbManager } from '../../src/db/manager';

describe('DbManager — SQLite (dockerless)', () => {
  let db: DbManager | null;

  afterEach(async () => {
    if (db) {
      await db.stop();
      db = null;
    }
  });

  test('constructor succeeds for sqlite engine', () => {
    db = new DbManager('sqlite');
    expect(db.engine).toBe('sqlite');
  });

  test('start() creates a temp directory and dbFile path', async () => {
    db = new DbManager('sqlite');
    await db.start();
    expect(db.dbFile).toBeTruthy();
    expect(fs.existsSync(db._tmpDir!)).toBe(true);
  });

  test('getConnectionEnv() returns SQLITE_FILE and DATABASE_URL', async () => {
    db = new DbManager('sqlite');
    await db.start();
    const env = db.getConnectionEnv();
    expect(env['SQLITE_FILE']).toBe(db.dbFile);
    expect(env['DATABASE_URL']).toMatch(/^sqlite:\/\/\//);
  });

  test('getConnectionUrl() returns sqlite:/// URL', async () => {
    db = new DbManager('sqlite');
    await db.start();
    expect(db.getConnectionUrl()).toBe(`sqlite:///${db.dbFile}`);
  });

  test('getConfig() returns engine and dbFile', async () => {
    db = new DbManager('sqlite');
    await db.start();
    const cfg = db.getConfig() as { engine: string; dbFile: string };
    expect(cfg.engine).toBe('sqlite');
    expect(cfg.dbFile).toBe(db.dbFile);
  });

  test('stop() removes the temp directory', async () => {
    db = new DbManager('sqlite');
    await db.start();
    const tmpDir = db._tmpDir!;
    expect(fs.existsSync(tmpDir)).toBe(true);
    await db.stop();
    expect(fs.existsSync(tmpDir)).toBe(false);
    expect(db.dbFile).toBeNull();
    db = null; // prevent double-stop in afterEach
  });

  test('stop() is idempotent (calling twice is safe)', async () => {
    db = new DbManager('sqlite');
    await db.start();
    await db.stop();
    await db.stop(); // second call should not throw
    db = null;
  });
});

describe('DbManager — constructor validation', () => {
  test('throws for unsupported engine', () => {
    expect(() => new DbManager('mssql')).toThrow(/Unsupported database engine/);
  });

  test('supports postgres engine', () => {
    const m = new DbManager('postgres');
    expect(m.engine).toBe('postgres');
  });

  test('supports mysql engine', () => {
    const m = new DbManager('mysql');
    expect(m.engine).toBe('mysql');
  });

  test('supports sqlite engine', () => {
    const m = new DbManager('sqlite');
    expect(m.engine).toBe('sqlite');
  });
});
