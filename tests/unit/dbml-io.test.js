'use strict';

const { sqlToDbml } = require('../../src/schema/dbml-io');

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
