'use strict';

/**
 * Parse SQL DDL into a structured schema model.
 *
 * Supports output from:
 *  - pg_dump (--schema-only --no-owner --no-privileges)
 *  - mysqldump (--no-data)
 *
 * Returns:
 * {
 *   tables: {
 *     "tableName": {
 *       name: string,
 *       columns: { "colName": { name, type, nullable, default, pk } },
 *       primaryKey: string[],
 *       indexes: [{ name, columns, unique }],
 *       foreignKeys: [{ name, columns, refTable, refColumns, onDelete, onUpdate }],
 *     }
 *   }
 * }
 */
function parseSchema(sql) {
  const normalized = _normalize(sql);
  const tables = {};

  _parseCreateTables(normalized, tables);
  _parseAlterTableConstraints(normalized, tables);
  _parseCreateIndexes(normalized, tables);

  return { tables };
}

// ─── Normalize ───────────────────────────────────────────────────────────────

function _normalize(sql) {
  // Strip single-line comments
  let s = sql.replace(/--[^\n]*/g, '');
  // Strip multi-line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Collapse whitespace
  s = s.replace(/\r\n/g, '\n');
  return s;
}

// ─── CREATE TABLE ─────────────────────────────────────────────────────────────

function _parseCreateTables(sql, tables) {
  // Match CREATE TABLE [IF NOT EXISTS] [`]name[`] ( ... );
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?[\w.]+`?\.)?`?([\w]+)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE\s*=\s*\w+[^;]*)?;/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const tableName = m[1];
    const body = m[2];
    tables[tableName] = _parseTableBody(tableName, body);
  }
}

function _parseTableBody(tableName, body) {
  const columns = {};
  const primaryKey = [];
  const indexes = [];
  const foreignKeys = [];

  const lines = _splitTableLines(body);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // PRIMARY KEY inline or table-level
    if (/^PRIMARY\s+KEY/i.test(line)) {
      const cols = _extractColumnList(line);
      primaryKey.push(...cols);
      continue;
    }

    // UNIQUE KEY / INDEX (MySQL style)
    if (/^UNIQUE\s+(?:KEY|INDEX)/i.test(line)) {
      const idxName = _extractIndexName(line);
      const cols = _extractColumnList(line);
      indexes.push({ name: idxName, columns: cols, unique: true });
      continue;
    }

    // KEY / INDEX (MySQL style)
    if (/^(?:KEY|INDEX)\s+/i.test(line)) {
      const idxName = _extractIndexName(line);
      const cols = _extractColumnList(line);
      indexes.push({ name: idxName, columns: cols, unique: false });
      continue;
    }

    // CONSTRAINT ... FOREIGN KEY
    if (/^CONSTRAINT\s+/i.test(line) && /FOREIGN\s+KEY/i.test(line)) {
      const fk = _parseForeignKey(line);
      if (fk) foreignKeys.push(fk);
      continue;
    }

    // FOREIGN KEY (without CONSTRAINT prefix)
    if (/^FOREIGN\s+KEY/i.test(line)) {
      const fk = _parseForeignKey(line);
      if (fk) foreignKeys.push(fk);
      continue;
    }

    // CONSTRAINT ... PRIMARY KEY (PostgreSQL style)
    if (/^CONSTRAINT\s+/i.test(line) && /PRIMARY\s+KEY/i.test(line)) {
      const cols = _extractColumnList(line);
      primaryKey.push(...cols);
      continue;
    }

    // CONSTRAINT ... UNIQUE
    if (/^CONSTRAINT\s+/i.test(line) && /UNIQUE/i.test(line)) {
      const idxName = _extractConstraintName(line);
      const cols = _extractColumnList(line);
      indexes.push({ name: idxName, columns: cols, unique: true });
      continue;
    }

    // Skip CHECK constraints
    if (/^CONSTRAINT\s+/i.test(line) && /CHECK/i.test(line)) continue;

    // Column definition
    const col = _parseColumnDef(line);
    if (col) {
      columns[col.name] = col;
      if (col.pk) primaryKey.push(col.name);
    }
  }

  // Normalize PK: if primaryKey populated, mark those columns as pk
  if (primaryKey.length > 0) {
    for (const colName of primaryKey) {
      if (columns[colName]) columns[colName].pk = true;
    }
  }

  return { name: tableName, columns, primaryKey: [...new Set(primaryKey)], indexes, foreignKeys };
}

/** Split CREATE TABLE body into individual clause lines, respecting nested parens */
function _splitTableLines(body) {
  const lines = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      lines.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/** Parse a single column definition line */
function _parseColumnDef(line) {
  // Strip backticks and quotes from column name
  const colMatch = line.match(/^[`"']?([\w]+)[`"']?\s+(.+)$/i);
  if (!colMatch) return null;

  const name = colMatch[1];
  const rest = colMatch[2];

  // Skip reserved words that aren't column names
  const reserved = /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FOREIGN|REFERENCES|SET|FULLTEXT|SPATIAL)/i;
  if (reserved.test(name)) return null;

  const type = _extractType(rest);
  const nullable = !/NOT\s+NULL/i.test(rest);
  const defaultVal = _extractDefault(rest);
  const pk = /PRIMARY\s+KEY/i.test(rest);

  return { name, type, nullable, default: defaultVal, pk };
}

function _extractType(rest) {
  // Match data type: word optionally followed by (params)
  const m = rest.match(/^([\w\s]+(?:\([^)]*\))?)/);
  if (!m) return rest.split(/\s/)[0];
  // Clean up: take up to first keyword boundary
  let t = m[1].trim();
  // Remove trailing modifiers like UNSIGNED, ZEROFILL, CHARACTER SET ...
  t = t.replace(/\s+(NOT\s+NULL|NULL|DEFAULT|PRIMARY|UNIQUE|AUTO_INCREMENT|REFERENCES|CHECK|GENERATED|AS|COMMENT|COLLATE|CHARACTER\s+SET|UNSIGNED|ZEROFILL|ON\s+UPDATE).*/i, '');
  return t.trim();
}

function _extractDefault(rest) {
  const m = rest.match(/DEFAULT\s+('[^']*'|"[^"]*"|`[^`]*`|\S+)/i);
  if (!m) return null;
  return m[1].replace(/^['"`]|['"`]$/g, '');
}

// ─── ALTER TABLE (PostgreSQL constraints) ────────────────────────────────────

function _parseAlterTableConstraints(sql, tables) {
  const re = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:[\w]+\.)?`?([\w]+)`?\s+ADD\s+CONSTRAINT\s+`?([\w]+)`?\s+([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const tableName = m[1];
    const constraintName = m[2];
    const constraintDef = m[3].trim();
    const table = tables[tableName];
    if (!table) continue;

    if (/^PRIMARY\s+KEY/i.test(constraintDef)) {
      const cols = _extractColumnList(constraintDef);
      table.primaryKey.push(...cols);
      for (const c of cols) {
        if (table.columns[c]) table.columns[c].pk = true;
      }
    } else if (/^UNIQUE/i.test(constraintDef)) {
      const cols = _extractColumnList(constraintDef);
      table.indexes.push({ name: constraintName, columns: cols, unique: true });
    } else if (/^FOREIGN\s+KEY/i.test(constraintDef)) {
      const fk = _parseForeignKey(constraintDef, constraintName);
      if (fk) table.foreignKeys.push(fk);
    }
  }
}

// ─── CREATE INDEX ────────────────────────────────────────────────────────────

function _parseCreateIndexes(sql, tables) {
  const re = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?`?([\w]+)`?\s+ON\s+(?:[\w]+\.)?`?([\w]+)`?\s*(?:USING\s+\w+\s*)?\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const unique = Boolean(m[1]);
    const idxName = m[2];
    const tableName = m[3];
    const colsPart = m[4];
    const table = tables[tableName];
    if (!table) continue;

    // Extract column names (strip expressions like LOWER(email))
    const cols = colsPart.split(',').map((c) => {
      const cm = c.trim().match(/`?([\w]+)`?/);
      return cm ? cm[1] : c.trim();
    });

    table.indexes.push({ name: idxName, columns: cols, unique });
  }
}

// ─── Foreign Key Parser ───────────────────────────────────────────────────────

function _parseForeignKey(line, constraintName) {
  // FOREIGN KEY (col1, col2) REFERENCES refTable (refCol1, refCol2) [ON DELETE ...] [ON UPDATE ...]
  const ACTION = '(?:NO\\s+ACTION|SET\\s+NULL|SET\\s+DEFAULT|CASCADE|RESTRICT)';
  const fkRe = new RegExp(
    'FOREIGN\\s+KEY\\s+\\(([^)]+)\\)\\s+REFERENCES\\s+(?:[\\w]+\\.)?`?([\\w]+)`?\\s*\\(([^)]+)\\)' +
    '(?:\\s+ON\\s+DELETE\\s+(' + ACTION + '))?' +
    '(?:\\s+ON\\s+UPDATE\\s+(' + ACTION + '))?',
    'i'
  );
  const m = line.match(fkRe);
  if (!m) return null;

  const cols = m[1].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
  const refTable = m[2];
  const refCols = m[3].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
  const onDelete = m[4] ? m[4].toUpperCase() : null;
  const onUpdate = m[5] ? m[5].toUpperCase() : null;

  // Try to extract CONSTRAINT name if embedded
  if (!constraintName) {
    const nm = line.match(/CONSTRAINT\s+`?([\w]+)`?\s+FOREIGN/i);
    constraintName = nm ? nm[1] : null;
  }

  return { name: constraintName, columns: cols, refTable, refColumns: refCols, onDelete, onUpdate };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _extractColumnList(line) {
  const m = line.match(/\(([^)]+)\)/);
  if (!m) return [];
  return m[1].split(',').map((c) => c.trim().replace(/[`"'\s]/g, ''));
}

function _extractIndexName(line) {
  const m = line.match(/(?:KEY|INDEX)\s+`?([\w]+)`?\s*\(/i);
  return m ? m[1] : null;
}

function _extractConstraintName(line) {
  const m = line.match(/CONSTRAINT\s+`?([\w]+)`?/i);
  return m ? m[1] : null;
}

module.exports = { parseSchema };
