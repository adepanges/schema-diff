import { sqlToDbml, dbmlToSchema } from '../../src/schema/dbml-io';
import { diffSchemas } from '../../src/diff/engine';

const PG_DUMP = `
CREATE TABLE users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    name text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title varchar(500) NOT NULL,
    body text,
    published boolean DEFAULT false
);

ALTER TABLE ONLY posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_users_email ON users USING btree (email);
CREATE INDEX idx_posts_user_id ON posts USING btree (user_id);
`;

const MYSQL_DUMP = `
CREATE TABLE \`orders\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`customer_id\` int(11) NOT NULL,
  \`total\` decimal(10,2) NOT NULL,
  \`status\` varchar(50) DEFAULT 'pending',
  PRIMARY KEY (\`id\`),
  KEY \`idx_orders_customer\` (\`customer_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

describe('sqlToDbml', () => {
  test('converts PostgreSQL dump to DBML string', () => {
    const dbml = sqlToDbml(PG_DUMP, 'postgres');
    expect(typeof dbml).toBe('string');
    expect(dbml).toContain('Table');
    expect(dbml).toContain('users');
    expect(dbml).toContain('posts');
    expect(dbml).toContain('Ref');
  });

  test('converts MySQL dump to DBML string', () => {
    const dbml = sqlToDbml(MYSQL_DUMP, 'mysql');
    expect(typeof dbml).toBe('string');
    expect(dbml).toContain('orders');
  });

  test('returns empty string for empty SQL', () => {
    const dbml = sqlToDbml('', 'postgres');
    expect(dbml).toBe('');
  });

  test('throws for unsupported engine', () => {
    expect(() => sqlToDbml('SELECT 1', 'mssql')).toThrow();
  });
});

const SAMPLE_DBML = `
Table "users" {
  "id" integer [not null]
  "email" varchar(255) [not null]
  "name" text
  "created_at" timestamp [default: \`now()\`]

  Indexes {
    id [pk, name: "users_pkey"]
    email [unique, name: "idx_users_email"]
  }
}

Table "posts" {
  "id" integer [pk, not null]
  "user_id" integer [not null]
  "title" varchar(500) [not null]

  Indexes {
    user_id [name: "idx_posts_user"]
  }
}

Ref "posts_user_fk":"posts"."user_id" > "users"."id" [delete: cascade]
`;

describe('dbmlToSchema', () => {
  let schema: ReturnType<typeof dbmlToSchema>;

  beforeAll(() => {
    schema = dbmlToSchema(SAMPLE_DBML);
  });

  test('returns object with tables key', () => {
    expect(schema).toHaveProperty('tables');
  });

  test('parses table names', () => {
    expect(Object.keys(schema.tables)).toEqual(expect.arrayContaining(['users', 'posts']));
  });

  test('parses columns with correct structure', () => {
    const col = schema.tables['users']!.columns['email'];
    expect(col).toEqual({
      name: 'email',
      type: 'varchar(255)',
      nullable: false,
      default: null,
      pk: false,
    });
  });

  test('parses primary key from index', () => {
    expect(schema.tables['users']!.primaryKey).toContain('id');
    expect(schema.tables['users']!.columns['id']!.pk).toBe(true);
  });

  test('parses primary key from field attribute', () => {
    expect(schema.tables['posts']!.primaryKey).toContain('id');
    expect(schema.tables['posts']!.columns['id']!.pk).toBe(true);
  });

  test('parses nullable correctly', () => {
    expect(schema.tables['users']!.columns['name']!.nullable).toBe(true);
    expect(schema.tables['users']!.columns['id']!.nullable).toBe(false);
  });

  test('parses default value', () => {
    expect(schema.tables['users']!.columns['created_at']!.default).toBe('now()');
  });

  test('parses unique index', () => {
    const idx = schema.tables['users']!.indexes.find((i) => i.name === 'idx_users_email');
    expect(idx).toBeDefined();
    expect(idx!.unique).toBe(true);
    expect(idx!.columns).toEqual(['email']);
  });

  test('parses non-unique index', () => {
    const idx = schema.tables['posts']!.indexes.find((i) => i.name === 'idx_posts_user');
    expect(idx).toBeDefined();
    expect(idx!.unique).toBe(false);
    expect(idx!.columns).toEqual(['user_id']);
  });

  test('parses foreign key', () => {
    const fk = schema.tables['posts']!.foreignKeys[0];
    expect(fk).toBeDefined();
    expect(fk!.name).toBe('posts_user_fk');
    expect(fk!.columns).toEqual(['user_id']);
    expect(fk!.refTable).toBe('users');
    expect(fk!.refColumns).toEqual(['id']);
    expect(fk!.onDelete).toBe('CASCADE');
  });

  test('returns empty tables for empty DBML', () => {
    const s = dbmlToSchema('');
    expect(s.tables).toEqual({});
  });
});

describe('round-trip: SQL → DBML → schema → diff', () => {
  test('baseline and current from SQL produce correct diff', () => {
    const baselineSql = `
      CREATE TABLE users (
        id integer NOT NULL,
        email varchar(255) NOT NULL,
        CONSTRAINT users_pkey PRIMARY KEY (id)
      );
    `;
    const currentSql = `
      CREATE TABLE users (
        id integer NOT NULL,
        email varchar(255) NOT NULL,
        phone varchar(20),
        CONSTRAINT users_pkey PRIMARY KEY (id)
      );
      CREATE TABLE orders (
        id integer NOT NULL,
        user_id integer NOT NULL,
        CONSTRAINT orders_pkey PRIMARY KEY (id)
      );
      ALTER TABLE ONLY orders ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id);
    `;

    const baselineDbml = sqlToDbml(baselineSql, 'postgres');
    const currentDbml = sqlToDbml(currentSql, 'postgres');

    const baselineSchema = dbmlToSchema(baselineDbml);
    const currentSchema = dbmlToSchema(currentDbml);

    const diff = diffSchemas(baselineSchema, currentSchema);

    expect(diff.addedTables).toContain('orders');
    expect(diff.removedTables).toHaveLength(0);
    expect(diff.modifiedTables['users']).toBeDefined();
    expect(diff.modifiedTables['users']!.addedColumns).toContain('phone');
  });
});
