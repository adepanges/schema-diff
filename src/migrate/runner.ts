import { spawnSync } from 'child_process';

/**
 * Run a user-provided migration command.
 *
 * @returns {{ stdout: string, stderr: string }}
 * @throws {Error} if the command exits with a non-zero status
 */
export function runMigration(
  command: string,
  cwd = process.cwd(),
  env: Record<string, string> = {}
): { stdout: string; stderr: string } {
  const result = spawnSync('sh', ['-c', command], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 5 * 60 * 1000, // 5 minutes
  });

  if (result.error) {
    throw new Error(`Migration command failed to execute: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(
      `Migration command exited with code ${result.status}.\n` +
      `Command: ${command}\n` +
      (detail ? `Output:\n${detail}` : '(no output)')
    );
  }

  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}
