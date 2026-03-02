'use strict';

const { importer, Parser } = require('@dbml/core');

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
