# db-migrate-diff

**`db-migrate-diff`** is an extension for [`db-migrate`](https://db-migrate.readthedocs.io/) that allows you to **compare database schema differences**, export them into SQL dumps, and track changes over time using Git or other version control tools.

---

## 🚀 Goals

- Extend **db-migrate** to **compare differences** between database states.
- Support **PostgreSQL** engine.
- Export schema into **SQL dump** for tracking.

---

## 📅 Roadmap

> _(Not in priority order — contributions welcome!)_

- **Auto-comment** the differences for easier review (e.g., in GitHub PRs).
- Support **custom migration tools** (by providing `migration up` command and target DB engine).
- Support more database engines: **MySQL**, **SQLite3**, **MongoDB**, etc.
- Export schemas into **[DBML](https://dbml.org/)** and potentially other formats.
- **Visualize** the differences in a user-friendly way.

---

## 📦 Dependencies

- **`git`** – Used to track schema differences over time.