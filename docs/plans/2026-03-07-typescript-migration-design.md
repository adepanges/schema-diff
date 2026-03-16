# TypeScript Migration Design

**Date:** 2026-03-07
**Approach:** Big-bang conversion (all files in one pass)

## Goals

- **Type safety:** Catch bugs at compile time, improve IDE autocomplete and refactoring support.
- **Strict from day one:** `strict: true`, `noUncheckedIndexedAccess: true`, no implicit `any`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Timing | Before DBML feature work (tasks 4-11) | Clean baseline; future feature code is written in TS from the start |
| Module system | Stay CommonJS | Minimizes scope; avoids ESM migration complications |
| Strictness | Strict from day one | ~1,400 LOC is small enough to type fully in one pass |
| Build output | Compile to `dist/`, not committed to git | Standard practice; CI builds before publish/deploy |
| Test runner | Jest + ts-jest | Minimal change to existing test setup |
| Conversion style | Big-bang (all 12 src + 6 test files at once) | Codebase is small; avoids mixed .js/.ts transitional state |

## Shared Type Definitions

A new `src/types.ts` file is the single source of truth for all shared interfaces. These are derived from the JSDoc comments and object shapes already used throughout the codebase.

```ts
/** A single column definition */
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  pk: boolean;
}

/** An index on a table */
export interface Index {
  name: string | null;
  columns: string[];
  unique: boolean;
}

/** A foreign key constraint */
export interface ForeignKey {
  name: string | null;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
}

/** A single table definition */
export interface Table {
  name: string;
  columns: Record<string, Column>;
  primaryKey: string[];
  indexes: Index[];
  foreignKeys: ForeignKey[];
}

/** The top-level schema model */
export interface Schema {
  tables: Record<string, Table>;
}

/** Diff result for a single column */
export interface ColumnDiff {
  name: string;
  type?: { old: string; new: string };
  nullable?: { old: boolean; new: boolean };
  default?: { old: string | null; new: string | null };
  pk?: { old: boolean; new: boolean };
}

/** Diff result for a single table */
export interface TableDiff {
  name: string;
  addedColumns: Column[];
  removedColumns: Column[];
  modifiedColumns: ColumnDiff[];
  addedIndexes: Index[];
  removedIndexes: Index[];
  addedForeignKeys: ForeignKey[];
  removedForeignKeys: ForeignKey[];
}

/** Top-level diff result */
export interface DiffResult {
  addedTables: Table[];
  removedTables: Table[];
  modifiedTables: TableDiff[];
  hasDestructive: boolean;
}

/** Supported database engines */
export type DbEngine = 'postgres' | 'mysql' | 'sqlite';

/** Options passed to the run() orchestrator */
export interface RunOptions {
  engine: DbEngine;
  dbVersion: string;
  migrateCommand: string;
  migrationsPath: string;
  baselineFile?: string;
  schemas?: string[];
  outputDbml?: boolean;
  outputSqlDump?: boolean;
}

/** Result returned by run() */
export interface RunResult {
  report: string;
  diff: DiffResult;
  hasDestructive: boolean;
  outputDir: string;
}
```

## Tooling & Configuration

### New devDependencies

- `typescript`
- `ts-jest`
- `@types/node`

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### package.json changes

- `"main"`: `"src/main.js"` -> `"dist/main.js"`
- `"bin"`: `{ "schema-diff": "src/cli.js" }` -> `{ "schema-diff": "dist/cli.js" }`
- Add script `"build": "tsc"`
- Add script `"pretest": "tsc --noEmit"` (type-check before running tests)
- Remove inline `"jest"` config block (replaced by `jest.config.ts`)

### jest.config.ts (new file)

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
};

export default config;
```

### action.yml change

- `main`: `'src/main.js'` -> `'dist/main.js'`

### .gitignore addition

- `dist/`

## File Conversion Plan

Every source and test file is renamed from `.js` to `.ts`. No files are deleted (except the originals being renamed). The directory structure stays identical.

### New files

| File | Purpose |
|------|---------|
| `src/types.ts` | Shared interfaces (Schema, DiffResult, etc.) |
| `jest.config.ts` | Jest configuration (replaces inline config in package.json) |
| `tsconfig.json` | TypeScript compiler configuration |

### Renamed files

| From | To |
|------|-----|
| `src/main.js` | `src/main.ts` |
| `src/cli.js` | `src/cli.ts` |
| `src/core.js` | `src/core.ts` |
| `src/db/manager.js` | `src/db/manager.ts` |
| `src/schema/parser.js` | `src/schema/parser.ts` |
| `src/schema/dbml.js` | `src/schema/dbml.ts` |
| `src/schema/dbml-io.js` | `src/schema/dbml-io.ts` |
| `src/schema/dumper.js` | `src/schema/dumper.ts` |
| `src/diff/engine.js` | `src/diff/engine.ts` |
| `src/report/generator.js` | `src/report/generator.ts` |
| `src/migrate/runner.js` | `src/migrate/runner.ts` |
| `src/github/comment.js` | `src/github/comment.ts` |
| `tests/unit/parser.test.js` | `tests/unit/parser.test.ts` |
| `tests/unit/diff.test.js` | `tests/unit/diff.test.ts` |
| `tests/unit/report.test.js` | `tests/unit/report.test.ts` |
| `tests/unit/dbml.test.js` | `tests/unit/dbml.test.ts` |
| `tests/unit/dbml-io.test.js` | `tests/unit/dbml-io.test.ts` |
| `tests/unit/manager.test.js` | `tests/unit/manager.test.ts` |

### Per-file conversion rules

1. Remove `'use strict';` (TypeScript strict mode handles this).
2. Replace `const x = require('y')` with `import x from 'y'` or `import { x } from 'y'`.
3. Replace `module.exports = { ... }` with named `export` on functions/classes.
4. Add parameter types and return types to all functions.
5. Import shared types from `./types` where needed.
6. Replace JSDoc `@param {Type}` annotations with proper TS types. Remove redundant JSDoc but keep descriptive comments.
7. Private helpers (functions prefixed with `_`) stay as module-private functions (no class conversion).

### Special cases

- **`src/db/manager.ts`**: The `DbManager` class gets typed constructor params and method signatures. The lazy `require('net')` inside `_getFreePort()` becomes a top-level `import net from 'net'`.
- **`src/main.ts`** and **`src/cli.ts`**: Entry points that self-execute. Keep the IIFE/top-level pattern, just typed.
- **`src/github/comment.ts`**: The `octokit` parameter needs typing. Use `InstanceType<typeof GitHub>` from `@actions/github` or a more specific type from the package's exports.
- **Test files**: Factory helpers (`makeSchema`, `makeTable`, `makeCol`) get return types matching the shared interfaces from `src/types.ts`.

## Verification

After conversion, the following must pass:

1. `npx tsc --noEmit` — zero type errors
2. `pnpm test` — all existing tests pass via ts-jest
3. `pnpm build` — compiles cleanly to `dist/`
