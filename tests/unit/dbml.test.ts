import { toDbml } from '../../src/schema/dbml';
import type { Schema } from '../../src/types';

function makeSchema(tables: Schema['tables']): Schema {
  return { tables, functions: {} };
}

describe('toDbml', () => {
  test('generates a simple Table block', () => {
    const schema = makeSchema({
      users: {
        name: 'users',
        columns: {
          id: { name: 'id', type: 'integer', nullable: false, default: null, pk: true },
          email: { name: 'email', type: 'varchar(255)', nullable: false, default: null, pk: false },
        },
        primaryKey: ['id'],
        indexes: [],
        foreignKeys: [],
      },
    });

    const dbml = toDbml(schema);
    expect(dbml).toContain('Table users {');
    expect(dbml).toContain('id integer [pk, not null]');
    expect(dbml).toContain('email varchar(255) [not null]');
    expect(dbml).toContain('}');
  });

  test('includes indexes block', () => {
    const schema = makeSchema({
      users: {
        name: 'users',
        columns: { email: { name: 'email', type: 'varchar(255)', nullable: true, default: null, pk: false } },
        primaryKey: [],
        indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
        foreignKeys: [],
      },
    });

    const dbml = toDbml(schema);
    expect(dbml).toContain('indexes {');
    expect(dbml).toContain('email [unique, name: "idx_email"]');
  });

  test('includes Ref for foreign keys', () => {
    const schema = makeSchema({
      posts: {
        name: 'posts',
        columns: { user_id: { name: 'user_id', type: 'integer', nullable: false, default: null, pk: false } },
        primaryKey: [],
        indexes: [],
        foreignKeys: [
          { name: 'fk_posts_user', columns: ['user_id'], refTable: 'users', refColumns: ['id'], onDelete: 'CASCADE', onUpdate: null },
        ],
      },
    });

    const dbml = toDbml(schema);
    expect(dbml).toContain('Ref: posts.user_id > users.id [delete: cascade]');
  });

  test('handles default values', () => {
    const schema = makeSchema({
      settings: {
        name: 'settings',
        columns: {
          active: { name: 'active', type: 'boolean', nullable: true, default: 'false', pk: false },
          created_at: { name: 'created_at', type: 'timestamp', nullable: true, default: 'now()', pk: false },
        },
        primaryKey: [],
        indexes: [],
        foreignKeys: [],
      },
    });

    const dbml = toDbml(schema);
    expect(dbml).toContain("default: 'false'");
    expect(dbml).toContain('default: `now()`');
  });

  test('empty schema returns empty string', () => {
    expect(toDbml(makeSchema({}))).toBe('');
  });
});
