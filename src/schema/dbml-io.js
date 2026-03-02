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
