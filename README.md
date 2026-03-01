# schema-diff 

**`schema-diff `** is a GitHub Action (and CLI) that detects database schema changes across any migration tool, spins up a local database, and produces a **comprehensive, human-readable diff report**.

> 🔍 Stop guessing what your migration does. See exactly what changed, in every PR.

---

## ✨ Features

- 🔌 **Migration-tool agnostic** — works with any tool (Flyway, Liquibase, db-migrate, Alembic, raw SQL, custom scripts, etc.)
- 🗄️ **Multi-database support** — PostgreSQL, MySQL, SQLite, and more
- 📐 **DBML-powered diffing** — schema is parsed into DBML for clean, structured comparison
- 📊 **Rich diff reports** — added/removed/modified tables, columns, indexes, constraints, and foreign keys
- 🐳 **Ephemeral local DB** — launches a temporary containerized database, runs your migrations, then dumps the schema
- 💬 **PR-ready comments** — automatically posts a formatted diff summary as a GitHub PR comment
- 🗂️ **Schema snapshots** — saves DBML and SQL dumps so you can track schema history over time

---

## 🔄 How It Works

```
Migration Files
      │
      ▼
 Local DB (Docker)   ← spun up automatically
      │
      ▼ (run migrations)
  Schema Dump
      │
      ├──► SQL Dump       (for archiving / version control)
      ├──► DBML Schema    (structured, human-readable)
      │
      ▼
  DBML Diff vs. baseline
      │
      ▼
  Diff Report           → PR Comment / CI Artifact / CLI Output
```

1. **Launch** — schema-diff  starts a temporary local database using Docker
2. **Migrate** — runs your migration command (you provide it)
3. **Dump** — exports the resulting schema as SQL and DBML
4. **Diff** — compares DBML snapshots between the current branch and the baseline (e.g., `main`)
5. **Report** — generates a structured, readable change report

---

## 🚀 Quick Start

### GitHub Action

```yaml
# .github/workflows/schema-check.yml
name: Schema Drift Check

on:
  pull_request:
    paths:
      - 'migrations/**'

jobs:
  schema-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run schema-diff 
        uses: your-org/schema-diff @v1
        with:
          db-engine: postgres
          db-version: "15"
          migrate-command: "npx db-migrate up"
          migrations-path: ./migrations
          baseline-branch: main
          post-pr-comment: true
```

### CLI

```bash
# Install
npm install -g schema-diff 

# Run against your local migration setup
schema-diff  diff \
  --db-engine postgres \
  --migrate-command "flyway migrate" \
  --migrations-path ./db/migrations \
  --baseline ./snapshots/main.dbml
```

---

## ⚙️ Configuration

### GitHub Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `db-engine` | ✅ | — | Database engine: `postgres`, `mysql`, `sqlite` |
| `db-version` | ❌ | `latest` | Version of the DB Docker image |
| `migrate-command` | ✅ | — | Shell command to run your migrations |
| `migrations-path` | ❌ | `./migrations` | Path to your migration files |
| `baseline-branch` | ❌ | `main` | Branch to compare against |
| `post-pr-comment` | ❌ | `true` | Post diff as a PR comment |
| `output-dbml` | ❌ | `true` | Save DBML snapshot as artifact |
| `output-sql-dump` | ❌ | `false` | Save SQL dump as artifact |
| `fail-on-destructive` | ❌ | `false` | Fail CI if destructive changes are detected |

### CLI Options

```
schema-diff  diff [options]

Options:
  --db-engine <engine>         postgres | mysql | sqlite
  --db-version <version>       Docker image version (default: latest)
  --migrate-command <cmd>      Migration command to run
  --migrations-path <path>     Path to migration files
  --baseline <file>            Baseline DBML file to diff against
  --output-dir <path>          Directory to write outputs (default: .schema-diff )
  --format <format>            Report format: text | markdown | json
  --fail-on-destructive        Exit 1 if destructive changes found
```

---

## 📋 Example Report

When schema-diff  detects changes, it posts a report like this to your PR:

---

### 🔍 Schema Drift Detected — `migrations/V3__add_payments.sql`

| | Summary |
|--|---------|
| ✅ Added | 2 tables, 1 index |
| ✏️ Modified | 1 table (3 columns changed) |
| ❌ Removed | 0 |
| ⚠️ Destructive | 1 warning |

#### ✅ New Tables

```dbml
Table payments {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  amount decimal(10,2) [not null]
  status varchar(50) [default: 'pending']
  created_at timestamp [default: `now()`]
}

Table payment_methods {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  provider varchar(100)
  token text
}
```

#### ✏️ Modified: `users`

```diff
  Table users {
    id uuid [pk]
    email varchar(255)
+   stripe_customer_id varchar(255)
+   payment_verified boolean [default: false]
-   legacy_billing_id int
  }
```

> ⚠️ **Destructive change detected:** Column `legacy_billing_id` removed from `users`. Ensure data has been migrated before deploying.

---

## 🗄️ Supported Databases

| Database | Status |
|----------|--------|
| PostgreSQL | ✅ Supported |
| MySQL / MariaDB | ✅ Supported |
| SQLite | ✅ Supported |
| MongoDB | 🗓️ Planned |
| MSSQL | 🗓️ Planned |

---

## 🔌 Migration Tool Compatibility

schema-diff  does **not** depend on any specific migration tool. You provide the command, schema-diff  runs it.

| Tool | Example `migrate-command` |
|------|--------------------------|
| Flyway | `flyway migrate` |
| Liquibase | `liquibase update` |
| Alembic | `alembic upgrade head` |
| db-migrate | `npx db-migrate up` |
| Prisma | `npx prisma migrate deploy` |
| golang-migrate | `migrate -path ./migrations -database $DB_URL up` |
| Raw SQL | `psql $DB_URL -f ./schema.sql` |
| Custom script | `./scripts/run_migrations.sh` |

---

## 📦 Outputs & Artifacts

After each run, schema-diff  produces:

```
.schema-diff /
├── current.dbml          # DBML schema of current branch
├── baseline.dbml         # DBML schema of baseline branch
├── diff.md               # Human-readable diff report (Markdown)
├── diff.json             # Machine-readable diff (for automation)
└── dump.sql              # Full SQL schema dump (optional)
```

These are automatically uploaded as GitHub Actions artifacts and can also be committed to your repo for schema version tracking.

---

## 📅 Roadmap

- ✅ PostgreSQL support
- ✅ MySQL / SQLite support  
- ✅ DBML-based diffing
- ✅ Automatic PR comments
- 🔜 DBML visualization (schema diagram in PR comment)
- 🔜 MongoDB support
- 🔜 Slack / Teams notifications
- 🔜 Schema registry / history dashboard
- 🔜 Custom diff rules (e.g., allow column additions, block column drops)

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/your-org/schema-diff 
cd schema-diff 
npm install
npm test
```

---

## 📄 License

MIT © [Your Name](https://github.com/your-org)
