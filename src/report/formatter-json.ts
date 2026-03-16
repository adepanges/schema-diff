import type { ClassifiedReport } from './classifier';
import type { DiffResult } from '../types';

/**
 * Render a classified report as JSON, including both classification and raw diff.
 */
export function formatJson(report: ClassifiedReport, diff: DiffResult): string {
  return JSON.stringify({ classified: report, diff }, null, 2);
}
