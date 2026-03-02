# DBML-Powered Schema Diffing — Design Document

**Date:** 2026-03-02
**Approach:** Hybrid — SQL parser for diffing, `@dbml/core` for DBML I/O

## Summary

Integrate `@dbml/core` as the DBML conversion layer while keeping the existing SQL parser and diff engine unchanged. SQL dumps remain the source of truth; DBML is used for clean output and human-readable comparison.

## Architecture

### Pipeline

```
SQL dump (from pg_dump / mysqldump / sqlite3)
  |
  +---> schemas/{name}.sql          (always saved)
  |
  +---> sqlToDbml(sql, engine)      (via @dbml/core)
  |       |
  |       +---> schemas/{name}.dbml (optional, if output-dbml enabled)
  |       |
  |       +---> dbmlToSchema(dbml)  (convert @dbml/core AST to internal model)
  |                   |
  |                   v
  |             internal schema model  <-- current
  |
  +---> baseline: read schemas/{name}.sql (existing file from target branch)
              |
              +---> sqlToDbml(sql, engine) -> dbmlToSchema(dbml)
                          |
                          v
                    internal schema model  <-- baseline
                          |
                          v
                    diffSchemas(baseline, current)   [unchanged]
                          |
                          v
                    generateReport()                 [unchanged]
```

### What stays unchanged

- `src/schema/parser.js` — existing SQL DDL parser (untouched)
- `src/diff/engine.js` — diff two internal schema models (untouched)
- `src/report/generator.js` — generate markdown/text/JSON reports (untouched)

### New modules

#### `src/schema/dbml-io.js`

All `@dbml/core` interactions:

- `sqlToDbml(sql, engine)` — SQL dump string to DBML string. Uses `@dbml/core`'s SQL importer (supports PostgreSQL and MySQL dialects).
- `dbmlToSchema(dbmlStr)` — DBML string to the existing internal schema model (`{ tables: { ... } }`) so the diff engine works unchanged. Converts `@dbml/core`'s parsed AST into the internal format.

#### `src/schema/discovery.js`

PostgreSQL namespace discovery:

- `discoverSchemas(dbCfg)` — returns an array of schema names (e.g., `['public', 'auth']`).

For PostgreSQL, runs:

```sql
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast');
```

For MySQL/SQLite, returns `['schema']` (hardcoded single entry).

## File Layout

### `schemas/` directory

```
schemas/
  public.sql            # PostgreSQL namespace "public" (always written)
  public.dbml           # optional, if output-dbml: true
  auth.sql              # if multiple PG schemas exist
  auth.dbml
  schema.sql            # MySQL / SQLite (no namespace)
  schema.dbml           # optional
```

- PostgreSQL: one file pair per namespace (e.g., `public.sql` + `public.dbml`)
- MySQL / SQLite: single pair `schema.sql` + `schema.dbml`
- SQL dumps are always written. DBML files are optional (controlled by `output-dbml`).

### `.schema-diff/` directory

Kept as a working directory for intermediate files (`current.dbml`, `baseline.dbml`, `diff.md`, `diff.json`). Not intended for long-term storage.

## Baseline Resolution

The baseline SQL file is read from `schemas/{name}.sql` that already exists in the repo, committed by a previous run on the target branch. The target branch is configurable (default: `main`). If no baseline file exists, all current tables are treated as new.

## Schema Filtering

By default, all schemas are discovered and dumped. Users can specify a comma-separated list to limit which schemas are dumped.

- Empty (default): discover all schemas (PostgreSQL) or use `schema` (MySQL/SQLite)
- Specified (e.g., `public,auth`): only dump those listed, skip discovery

## GitHub Action

### Updated inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `db-engine` | yes | — | `postgres`, `mysql`, `sqlite` |
| `db-version` | no | `latest` | Docker image version tag |
| `migrate-command` | yes | — | Shell command to run migrations |
| `migrations-path` | no | `.` | Working directory for migration command |
| `schemas` | no | (empty = all) | Comma-separated schemas to dump |
| `baseline-branch` | no | `main` | Branch whose `schemas/*.sql` are the baseline |
| `post-pr-comment` | no | `true` | Post diff as PR comment |
| `github-token` | no | `$GITHUB_TOKEN` | Token for posting PR comments |
| `output-dbml` | no | `true` | Save `.dbml` files alongside SQL dumps |
| `fail-on-destructive` | no | `false` | Fail CI if destructive changes detected |

Removed: `output-sql-dump` — SQL dumps to `schemas/` are now always written.

### Updated outputs

| Output | Description |
|--------|-------------|
| `schemas-dir` | Path to the `schemas/` directory |
| `diff-report` | Full markdown diff report |
| `has-destructive` | `"true"` if destructive changes detected |
| `added-tables` | Comma-separated added table names |
| `removed-tables` | Comma-separated removed table names |
| `modified-tables` | Comma-separated modified table names |

### Action Summary

The diff report is written to the GitHub Actions job summary (`core.summary`) with DBML-flavored markdown. Added tables rendered as DBML blocks, modified tables as diff blocks.

## CLI

```
schema-diff diff [options]

Options:
  --db-engine <engine>         postgres | mysql | sqlite
  --db-version <version>       Docker image version (default: latest)
  --migrate-command <cmd>      Migration command to run
  --migrations-path <path>     Working directory for migration command
  --schemas <list>             Comma-separated schemas to dump (default: all)
  --baseline <file>            Baseline SQL file to diff against
  --output-dir <path>          Parent directory for schemas/ output (default: .)
  --output-dbml                Save .dbml files alongside .sql dumps
  --format <format>            Report format: text | markdown | json
  --fail-on-destructive        Exit 1 if destructive changes found
```

Key differences from action:
- `--baseline` takes an explicit SQL file path (no branch resolution)
- `--output-dir` is the parent of `schemas/`
- `--output-dbml` is off by default in CLI

## Updated `src/schema/dumper.js`

- `dumpSchema(dbCfg)` becomes `dumpSchemas(dbCfg, schemaNames)` returning `{ [name]: sql }`
- PostgreSQL: passes `--schema={name}` to `pg_dump` per namespace
- MySQL/SQLite: single key `schema`

## Updated `src/core.js`

1. Discover schemas (or use user-specified list)
2. Dump each schema → `schemas/{name}.sql`
3. For each schema: `sqlToDbml()` → optionally save `schemas/{name}.dbml`
4. Convert both current and baseline DBML to internal model via `dbmlToSchema()`
5. `diffSchemas()` and `generateReport()` — unchanged
6. Write report to output directory and action summary
