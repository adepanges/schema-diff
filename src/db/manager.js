'use strict';

const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');

const DB_DEFAULTS = {
  postgres: {
    image: 'postgres',
    port: 5432,
    dbName: 'schema_diff',
    user: 'schema_diff',
    password: 'schema_diff',
    readyCmd: ['pg_isready', '-U', 'schema_diff'],
    env: (cfg) => ({
      POSTGRES_DB: cfg.dbName,
      POSTGRES_USER: cfg.user,
      POSTGRES_PASSWORD: cfg.password,
    }),
  },
  mysql: {
    image: 'mysql',
    port: 3306,
    dbName: 'schema_diff',
    user: 'schema_diff',
    password: 'schema_diff',
    readyCmd: ['mysqladmin', 'ping', '-h', '127.0.0.1', '-u', 'schema_diff', '--password=schema_diff'],
    env: (cfg) => ({
      MYSQL_DATABASE: cfg.dbName,
      MYSQL_USER: cfg.user,
      MYSQL_PASSWORD: cfg.password,
      MYSQL_ROOT_PASSWORD: cfg.password,
    }),
  },
};

class DbManager {
  constructor(engine, version = 'latest') {
    if (!DB_DEFAULTS[engine]) {
      throw new Error(`Unsupported database engine: ${engine}. Supported: ${Object.keys(DB_DEFAULTS).join(', ')}`);
    }
    this.engine = engine;
    this.version = version;
    this.cfg = { ...DB_DEFAULTS[engine] };
    this.containerId = null;
    this.hostPort = null;
  }

  async start() {
    const image = `${this.cfg.image}:${this.version}`;
    const containerName = `schema-diff-${this.engine}-${crypto.randomBytes(6).toString('hex')}`;
    const envVars = this.cfg.env(this.cfg);
    const envFlags = Object.entries(envVars)
      .map(([k, v]) => `-e ${k}=${v}`)
      .join(' ');

    this.hostPort = await this._getFreePort();

    const cmd = `docker run -d --name ${containerName} ${envFlags} -p ${this.hostPort}:${this.cfg.port} ${image}`;
    const result = spawnSync('docker', ['run', '-d',
      '--name', containerName,
      ...Object.entries(envVars).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      '-p', `${this.hostPort}:${this.cfg.port}`,
      image,
    ], { encoding: 'utf8' });

    if (result.status !== 0) {
      throw new Error(`Failed to start Docker container: ${result.stderr || result.stdout}`);
    }

    this.containerId = result.stdout.trim();
    this.containerName = containerName;

    await this._waitForReady();
    return this;
  }

  async stop() {
    if (this.containerId) {
      spawnSync('docker', ['rm', '-f', this.containerId], { encoding: 'utf8' });
      this.containerId = null;
    }
  }

  getConnectionEnv() {
    if (this.engine === 'postgres') {
      return {
        PGHOST: '127.0.0.1',
        PGPORT: String(this.hostPort),
        PGDATABASE: this.cfg.dbName,
        PGUSER: this.cfg.user,
        PGPASSWORD: this.cfg.password,
        DATABASE_URL: this.getConnectionUrl(),
      };
    }
    if (this.engine === 'mysql') {
      return {
        MYSQL_HOST: '127.0.0.1',
        MYSQL_PORT: String(this.hostPort),
        MYSQL_DATABASE: this.cfg.dbName,
        MYSQL_USER: this.cfg.user,
        MYSQL_PASSWORD: this.cfg.password,
        DATABASE_URL: this.getConnectionUrl(),
      };
    }
    return {};
  }

  getConnectionUrl() {
    const { dbName, user, password } = this.cfg;
    if (this.engine === 'postgres') {
      return `postgresql://${user}:${password}@127.0.0.1:${this.hostPort}/${dbName}`;
    }
    if (this.engine === 'mysql') {
      return `mysql://${user}:${password}@127.0.0.1:${this.hostPort}/${dbName}`;
    }
    return '';
  }

  getConfig() {
    return {
      engine: this.engine,
      host: '127.0.0.1',
      port: this.hostPort,
      dbName: this.cfg.dbName,
      user: this.cfg.user,
      password: this.cfg.password,
    };
  }

  async _waitForReady(maxAttempts = 30, intervalMs = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = spawnSync('docker', ['exec', this.containerId, ...this.cfg.readyCmd], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (result.status === 0) return;
      await this._sleep(intervalMs);
    }
    throw new Error(`Database container did not become ready after ${maxAttempts} attempts`);
  }

  async _getFreePort() {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { DbManager };
