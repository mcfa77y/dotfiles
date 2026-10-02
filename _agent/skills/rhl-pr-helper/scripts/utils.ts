import { $ } from 'bun';

export interface ParsedPrTarget {
  repo: string | null;
  prNumber: number;
}

export interface BasePrData {
  number: number;
  title: string;
  body: string;
  url: string;
  state?: string;
  isDraft?: boolean;
  baseRefName?: string;
  headRefName?: string;
}

function formatStderr(stderr: unknown): string {
  if (typeof stderr === 'string') return stderr.trim();
  if (stderr instanceof Uint8Array) return new TextDecoder().decode(stderr).trim();
  if (stderr instanceof Error) return stderr.message.trim();
  return JSON.stringify(stderr).trim();
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('stderr' in err && err.stderr != null) {
      return formatStderr(err.stderr);
    }
    if ('message' in err && typeof err.message === 'string') {
      return err.message;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parses a PR number or GitHub PR URL into a structured repo + PR number object.
 *
 * Supports:
 *   - 2864
 *   - "#2864"
 *   - "EmpoHealth/core#2864"
 *   - "https://github.com/EmpoHealth/core/pull/2864"
 */
export function parsePrTarget(input: string | number): ParsedPrTarget {
  if (typeof input === 'number') {
    return { repo: null, prNumber: input };
  }

  const clean = String(input).trim();
  if (!clean) {
    throw new Error('Missing PR number or URL.');
  }

  const urlMatch = /github\.com\/([^/]+(?:\/[^/]+)?)\/pull\/(\d+)/i.exec(clean);
  if (urlMatch) {
    return {
      repo: urlMatch[1] || null,
      prNumber: Number.parseInt(urlMatch[2]!, 10),
    };
  }

  if (clean.includes('#')) {
    const [repoPart, numPart] = clean.split('#', 2);
    const prNum = Number.parseInt(numPart!.trim(), 10);
    if (!Number.isNaN(prNum)) {
      return {
        repo: repoPart!.trim() || null,
        prNumber: prNum,
      };
    }
  }

  const num = Number.parseInt(clean.replace(/^#/, ''), 10);
  if (!Number.isNaN(num)) {
    return { repo: null, prNumber: num };
  }

  throw new Error(`Invalid PR target "${input}". Expected a PR number (e.g. 2864) or GitHub URL.`);
}

/**
 * Resolves the "owner/repo" string from git or gh cli context.
 */
export async function resolveCurrentRepo(): Promise<string | null> {
  try {
    const output = (
      await $`gh repo view --json nameWithOwner -q .nameWithOwner`.quiet().text()
    ).trim();
    if (output?.includes('/')) return output;
  } catch {
    // fallback to git remote
  }

  try {
    const remoteUrl = (await $`git remote get-url origin`.quiet().text()).trim();
    const match = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(remoteUrl);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  } catch {
    // no git context
  }

  return null;
}

/**
 * Fetches PR details from GitHub using gh CLI via Bun.$.
 */
export async function fetchRemotePr<T = BasePrData>(
  prTarget: string | number,
  fields: string[] = ['number', 'title', 'body', 'url', 'baseRefName', 'headRefName', 'state'],
): Promise<T> {
  const parsed = parsePrTarget(prTarget);
  const fieldsArg = fields.join(',');

  try {
    let output: string;
    if (parsed.repo) {
      output = await $`gh pr view ${parsed.prNumber} --repo ${parsed.repo} --json ${fieldsArg}`
        .quiet()
        .text();
    } else {
      output = await $`gh pr view ${parsed.prNumber} --json ${fieldsArg}`.quiet().text();
    }
    return JSON.parse(output) as T;
  } catch (err: unknown) {
    throw new Error(`Failed to fetch PR #${prTarget}: ${getErrorMessage(err)}`);
  }
}

/**
 * Applies title and/or body updates to a PR via gh CLI.
 */
export async function applyRemotePr(
  prTarget: string | number,
  updates: { title?: string; body?: string },
): Promise<void> {
  const parsed = parsePrTarget(prTarget);

  try {
    const args = ['gh', 'pr', 'edit', String(parsed.prNumber)];
    if (parsed.repo) {
      args.push('--repo', parsed.repo);
    }
    if (updates.title !== undefined) {
      args.push('--title', updates.title);
    }
    if (updates.body !== undefined) {
      args.push('--body', updates.body);
    }
    await $`${args}`;
  } catch (err: unknown) {
    throw new Error(`Failed to update PR #${prTarget}: ${getErrorMessage(err)}`);
  }
}

/**
 * Pretty-prints validation errors to stderr.
 */
export function printLintErrors(errors: string[]): void {
  console.error();
  for (const error of errors) {
    const lines = error.split('\n');
    console.error(`✗ ${lines[0]}`);
    for (const line of lines.slice(1)) {
      console.error(`    ${line}`);
    }
    console.error();
  }
  console.error(`Found ${errors.length} error${errors.length === 1 ? '' : 's'}`);
}
