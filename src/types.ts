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

/** A parameter to a stored function or procedure */
export interface FunctionParam {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC';
}

/** A stored function or procedure */
export interface DbFunction {
  name: string;
  params: FunctionParam[];
  returnType: string;
  language: string;
  body: string;
  kind: 'function' | 'procedure';
}

/** The top-level schema model */
export interface Schema {
  tables: Record<string, Table>;
  functions: Record<string, DbFunction>;
}

/** Diff result for a single column — uses from/to keys */
export interface ColumnDiff {
  type?: { from: string; to: string };
  nullable?: { from: boolean; to: boolean };
  default?: { from: string | null; to: string | null };
  pk?: { from: boolean; to: boolean };
}

/** Diff result for a single table */
export interface TableDiff {
  name: string;
  addedColumns: string[];
  removedColumns: string[];
  modifiedColumns: Record<string, ColumnDiff>;
  addedIndexes: Index[];
  removedIndexes: Index[];
  addedForeignKeys: ForeignKey[];
  removedForeignKeys: ForeignKey[];
}

/** Diff result for a single function or procedure */
export interface FunctionDiff {
  name: string;
  kind: 'function' | 'procedure';
  params?: { from: FunctionParam[]; to: FunctionParam[] };
  returnType?: { from: string; to: string };
  bodyChanged: boolean;
}

/** Top-level diff result */
export interface DiffResult {
  addedTables: string[];
  removedTables: string[];
  modifiedTables: Record<string, TableDiff>;
  addedFunctions: string[];
  removedFunctions: string[];
  modifiedFunctions: Record<string, FunctionDiff>;
  hasDestructive: boolean;
}

/** Supported database engines */
export type DbEngine = 'postgres' | 'mysql' | 'sqlite';

/** Options passed to the run() orchestrator */
export interface RunOptions {
  dbEngine: string;
  dbVersion?: string;
  migrateCommand: string;
  migrationsPath?: string;
  baselineFile?: string | null;
  outputDir?: string;
  format?: string;
  failOnDestructive?: boolean;
  log?: (msg: string) => void;
}

/** Result returned by run() */
export interface RunResult {
  report: string;
  diff: DiffResult;
  currentDbml: string;
  currentSql: string;
  outputDir: string;
}
