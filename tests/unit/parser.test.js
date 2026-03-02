'use strict';

const { parseSchema } = require('../../src/schema/parser');

describe('parseSchema — PostgreSQL pg_dump output', () => {
  const pgDump = `
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

  let schema;
  beforeAll(() => {
    schema = parseSchema(pgDump);
  });

  test('parses two tables', () => {
    expect(Object.keys(schema.tables)).toHaveLength(2);
    expect(schema.tables.users).toBeDefined();
    expect(schema.tables.posts).toBeDefined();
  });

  test('parses columns in users', () => {
    const cols = schema.tables.users.columns;
    expect(cols.id).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.created_at).toBeDefined();
  });

  test('id column is not nullable', () => {
    expect(schema.tables.users.columns.id.nullable).toBe(false);
  });

  test('name column is nullable', () => {
    expect(schema.tables.users.columns.name.nullable).toBe(true);
  });

  test('email column is not nullable', () => {
    expect(schema.tables.users.columns.email.nullable).toBe(false);
  });

  test('created_at has default', () => {
    expect(schema.tables.users.columns.created_at.default).toBeTruthy();
  });

  test('published has default false', () => {
    expect(schema.tables.posts.columns.published.default).toBe('false');
  });

  test('parses primary key from CONSTRAINT', () => {
    expect(schema.tables.users.primaryKey).toContain('id');
  });

  test('parses primary key from ALTER TABLE', () => {
    expect(schema.tables.posts.primaryKey).toContain('id');
  });

  test('parses foreign key from ALTER TABLE', () => {
    const fks = schema.tables.posts.foreignKeys;
    expect(fks).toHaveLength(1);
    expect(fks[0].refTable).toBe('users');
    expect(fks[0].columns).toContain('user_id');
    expect(fks[0].refColumns).toContain('id');
    expect(fks[0].onDelete).toBe('CASCADE');
  });

  test('parses unique index', () => {
    const idxs = schema.tables.users.indexes;
    const uniqueIdx = idxs.find((i) => i.name === 'idx_users_email');
    expect(uniqueIdx).toBeDefined();
    expect(uniqueIdx.unique).toBe(true);
  });

  test('parses non-unique index', () => {
    const idxs = schema.tables.posts.indexes;
    const idx = idxs.find((i) => i.name === 'idx_posts_user_id');
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(false);
  });
});

describe('parseSchema — MySQL mysqldump output', () => {
  const mysqlDump = `
    CREATE TABLE \`orders\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`customer_id\` int(11) NOT NULL,
      \`total\` decimal(10,2) NOT NULL,
      \`status\` varchar(50) DEFAULT 'pending',
      \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_orders_customer\` (\`customer_id\`),
      UNIQUE KEY \`idx_orders_unique_status\` (\`customer_id\`,\`status\`),
      CONSTRAINT \`fk_orders_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  let schema;
  beforeAll(() => {
    schema = parseSchema(mysqlDump);
  });

  test('parses the orders table', () => {
    expect(schema.tables.orders).toBeDefined();
  });

  test('parses all columns', () => {
    const cols = schema.tables.orders.columns;
    expect(cols.id).toBeDefined();
    expect(cols.customer_id).toBeDefined();
    expect(cols.total).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.created_at).toBeDefined();
  });

  test('id column is not nullable', () => {
    expect(schema.tables.orders.columns.id.nullable).toBe(false);
  });

  test('status has default pending', () => {
    expect(schema.tables.orders.columns.status.default).toBe('pending');
  });

  test('parses primary key', () => {
    expect(schema.tables.orders.primaryKey).toContain('id');
  });

  test('parses plain KEY index', () => {
    const idxs = schema.tables.orders.indexes;
    const idx = idxs.find((i) => i.name === 'idx_orders_customer');
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(false);
  });

  test('parses UNIQUE KEY', () => {
    const idxs = schema.tables.orders.indexes;
    const idx = idxs.find((i) => i.name === 'idx_orders_unique_status');
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(true);
  });

  test('parses CONSTRAINT foreign key', () => {
    const fks = schema.tables.orders.foreignKeys;
    expect(fks).toHaveLength(1);
    expect(fks[0].name).toBe('fk_orders_customer');
    expect(fks[0].refTable).toBe('customers');
    expect(fks[0].onDelete).toBe('RESTRICT');
    expect(fks[0].onUpdate).toBe('CASCADE');
  });
});

describe('parseSchema — empty SQL', () => {
  test('returns empty tables object', () => {
    const schema = parseSchema('');
    expect(schema.tables).toEqual({});
  });
});
