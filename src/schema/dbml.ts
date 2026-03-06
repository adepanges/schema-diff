import type { Schema, Column } from '../types';

/**
 * Convert a parsed schema model (from parser.ts) to a DBML string.
 */
export function toDbml(schema: Schema): string {
  const lines: string[] = [];

  for (const table of Object.values(schema.tables)) {
    lines.push(`Table ${table.name} {`);

    for (const col of Object.values(table.columns)) {
      lines.push(`  ${_colToDbml(col)}`);
    }

    if (table.indexes.length > 0) {
      lines.push('');
      lines.push('  indexes {');
      for (const idx of table.indexes) {
        const cols = idx.columns.length === 1 ? idx.columns[0]! : `(${idx.columns.join(', ')})`;
        const attrs: string[] = [];
        if (idx.unique) attrs.push('unique');
        if (idx.name) attrs.push(`name: "${idx.name}"`);
        const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
        lines.push(`    ${cols}${attrsStr}`);
      }
      lines.push('  }');
    }

    lines.push('}');
    lines.push('');
  }

  // Refs (foreign keys)
  for (const table of Object.values(schema.tables)) {
    for (const fk of table.foreignKeys) {
      const fromCols = fk.columns.length === 1
        ? `${table.name}.${fk.columns[0]!}`
        : `(${fk.columns.map((c) => `${table.name}.${c}`).join(', ')})`;
      const toCols = fk.refColumns.length === 1
        ? `${fk.refTable}.${fk.refColumns[0]!}`
        : `(${fk.refColumns.map((c) => `${fk.refTable}.${c}`).join(', ')})`;
      const attrs: string[] = [];
      if (fk.onDelete) attrs.push(`delete: ${fk.onDelete.toLowerCase()}`);
      if (fk.onUpdate) attrs.push(`update: ${fk.onUpdate.toLowerCase()}`);
      const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
      lines.push(`Ref: ${fromCols} > ${toCols}${attrsStr}`);
    }
  }

  return lines.join('\n');
}

function _colToDbml(col: Column): string {
  const attrs: string[] = [];
  if (col.pk) attrs.push('pk');
  if (!col.nullable) attrs.push('not null');
  if (col.default !== null && col.default !== undefined) {
    const val = _isExpression(col.default) ? `\`${col.default}\`` : `'${col.default}'`;
    attrs.push(`default: ${val}`);
  }
  const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
  return `${col.name} ${col.type}${attrsStr}`;
}

function _isExpression(val: string): boolean {
  return /[()[\]{}]/.test(val) || /^(now|current_timestamp|nextval|uuid_generate|gen_random_uuid)/i.test(val);
}
