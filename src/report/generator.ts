import type { DiffResult, Schema } from '../types';
import { classify } from './classifier';
import { formatMarkdown } from './formatter-markdown';
import { formatText } from './formatter-text';
import { formatJson } from './formatter-json';

/**
 * Generate a diff report from a DiffResult.
 *
 * Classifies changes by severity, then delegates to the appropriate formatter.
 */
export function generateReport(
  diff: DiffResult,
  schemas: { baseline: Schema; current: Schema },
  format = 'markdown'
): string {
  const classified = classify(diff);

  switch (format) {
    case 'json':
      return formatJson(classified, diff);
    case 'text':
      return formatText(classified);
    default:
      return formatMarkdown(classified, schemas, diff);
  }
}
