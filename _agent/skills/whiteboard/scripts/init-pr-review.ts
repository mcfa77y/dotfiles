#!/usr/bin/env bun
/**
 * init-pr-review.ts
 *
 * Initializes a dev.fast Whiteboard code review session for a pull request or branch diff.
 * Inspects Git/GitHub PR state, buckets changed files into review lenses, and coordinates
 * Whiteboard API commands.
 */

import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';

export interface PrDetails {
  number: number;
  title: string;
  url: string;
  baseRefName: string;
  headRefName: string;
}

export interface WhiteboardReviewOptions {
  pr?: string | number;
  repo?: string;
  base?: string;
  head?: string;
  title?: string;
  open?: boolean;
  dryRun?: boolean;
}

export interface WhiteboardApiCall {
  tool: string;
  payload: Record<string, unknown>;
}

export interface WhiteboardPlan {
  repoPath: string;
  pr?: PrDetails;
  base: string;
  head: string;
  title: string;
  pullRequestUrl?: string;
  changedFiles: string[];
  lenses: Record<string, string[]>;
  apiCalls: WhiteboardApiCall[];
  open: boolean;
}

export interface WhiteboardReviewResult {
  dryRun: boolean;
  plan?: WhiteboardPlan;
  sessionId?: string;
  repositoryId?: string;
  baseSha?: string;
  headSha?: string;
  lensesCreated?: number;
  opened?: boolean;
}

export type CommandRunner = (cmd: string[], cwd?: string) => Promise<string>;
export type WhiteboardApiExecutor = (
  tool: string,
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface WhiteboardExecutionContext {
  cmdRunner?: CommandRunner;
  apiExecutor?: WhiteboardApiExecutor;
  mockFiles?: string[];
}

export function parsePrIdentifier(prInput: string): {
  number: number;
  owner?: string;
  repo?: string;
  url?: string;
} {
  const trimmed = prInput.trim();
  if (!trimmed) {
    throw new Error('PR input cannot be empty');
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const urlMatch = trimmed.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i);
    if (urlMatch) {
      return {
        number: parseInt(urlMatch[3], 10),
        owner: urlMatch[1],
        repo: urlMatch[2],
        url: `https://github.com/${urlMatch[1]}/${urlMatch[2]}/pull/${urlMatch[3]}`,
      };
    }
    throw new Error(`Invalid GitHub pull request URL: ${trimmed}`);
  }

  const numCleaned = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^\d+$/.test(numCleaned)) {
    const num = parseInt(numCleaned, 10);
    if (num > 0) {
      return { number: num };
    }
  }

  throw new Error(`Invalid PR number or URL: ${trimmed}`);
}

export async function parsePrDetails(
  prInput: string,
  options?: { repoPath?: string; runner?: CommandRunner },
): Promise<PrDetails> {
  const trimmed = prInput.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.number === 'number' && typeof parsed.title === 'string') {
        return {
          number: Number(parsed.number),
          title: String(parsed.title || ''),
          url: String(parsed.url || ''),
          baseRefName: String(parsed.baseRefName || ''),
          headRefName: String(parsed.headRefName || ''),
        };
      }
    } catch {
      // Fall through to standard validation and execution
    }
  }

  parsePrIdentifier(trimmed);

  const runner = options?.runner;
  const repoCwd = options?.repoPath || process.cwd();

  let rawOutput = '';
  if (runner) {
    rawOutput = await runner(
      ['gh', 'pr', 'view', trimmed, '--json', 'number,title,url,baseRefName,headRefName'],
      repoCwd,
    );
  } else {
    try {
      rawOutput = await $`gh pr view ${trimmed} --json number,title,url,baseRefName,headRefName`
        .cwd(repoCwd)
        .text();
    } catch (err) {
      throw new Error(
        `Failed to query GitHub PR "${trimmed}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  try {
    const data = JSON.parse(rawOutput.trim());
    return {
      number: Number(data.number),
      title: String(data.title || ''),
      url: String(data.url || ''),
      baseRefName: String(data.baseRefName || ''),
      headRefName: String(data.headRefName || ''),
    };
  } catch (err) {
    throw new Error(
      `Failed to parse PR JSON output from gh CLI: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function categorizeFilesIntoLenses(changedFiles: string[]): Record<string, string[]> {
  const buckets: Record<string, string[]> = {
    'Workflows & CI': [],
    'Terraform & Infrastructure': [],
    'Tests & QA': [],
    Frontend: [],
    'Backend API': [],
    'Documentation & Config': [],
    Other: [],
  };

  for (const file of changedFiles) {
    if (!file || typeof file !== 'string') continue;
    const normalized = file.trim().replace(/\\/g, '/');
    if (!normalized) continue;

    if (
      normalized.startsWith('.github/') ||
      normalized.startsWith('.circleci/') ||
      normalized.startsWith('.gitlab/') ||
      normalized === '.gitlab-ci.yml' ||
      normalized === 'Jenkinsfile' ||
      normalized.startsWith('ci/') ||
      normalized.includes('/.github/') ||
      /(^|\/)\.?(buildkite|drone|travis)\.ya?ml$/.test(normalized)
    ) {
      buckets['Workflows & CI'].push(normalized);
    } else if (
      /\.(tf|tfvars|hcl)$/.test(normalized) ||
      /(^|\/)(terraform|infra|infrastructure|k8s|kubernetes|helm|docker)\//.test(normalized) ||
      /(^|\/)Dockerfile(\..+)?$/.test(normalized) ||
      /(^|\/)docker-compose(\..+)?\.ya?ml$/.test(normalized) ||
      /(^|\/)wrangler\.(jsonc?|toml)$/.test(normalized)
    ) {
      buckets['Terraform & Infrastructure'].push(normalized);
    } else if (
      /\.(spec|test)\.[jt]sx?$/.test(normalized) ||
      /\.(spec|test)\.py$/.test(normalized) ||
      /(^|\/)(test_[^/]+\.py|[^/]+_test\.py)$/.test(normalized) ||
      normalized.endsWith('_test.go') ||
      /(^|\/)(__tests__|tests?|e2e|cypress|playwright)\//.test(normalized) ||
      /(^|\/)(vitest|jest|playwright|cypress)\.config\.[jt]s$/.test(normalized)
    ) {
      buckets['Tests & QA'].push(normalized);
    } else if (
      /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/.test(normalized) ||
      /(^|\/)(frontend|web|client|ui|components|views|pages|hooks|styles)\//.test(normalized) ||
      normalized.startsWith('apps/frontend/') ||
      normalized.startsWith('apps/web/') ||
      normalized.startsWith('packages/ui/')
    ) {
      buckets.Frontend.push(normalized);
    } else if (
      /(^|\/)(backend|api|server|services|controllers|routes|models|handlers|resolvers|schema)\//.test(
        normalized,
      ) ||
      normalized.startsWith('apps/backend/') ||
      normalized.startsWith('apps/api/') ||
      normalized.startsWith('apps/server/') ||
      /\.(py|go|rs|java|sql)$/.test(normalized) ||
      /(^|\/)(prisma|migrations|db|database)\//.test(normalized)
    ) {
      buckets['Backend API'].push(normalized);
    } else if (
      /\.(md|markdown|mdx|txt|rst)$/.test(normalized) ||
      /(^|\/)docs?\//.test(normalized) ||
      /(^|\/)(LICENSE|README(\..+)?)$/i.test(normalized) ||
      /(^|\/)(package\.json|tsconfig(\..+)?\.json|biome\.json|\.eslintrc.*|\.prettierrc.*|sonar-project\.properties|linear\.config\.json|\.editorconfig|\.gitignore)$/.test(
        normalized,
      )
    ) {
      buckets['Documentation & Config'].push(normalized);
    } else {
      buckets.Other.push(normalized);
    }
  }

  const result: Record<string, string[]> = {};
  for (const [category, files] of Object.entries(buckets)) {
    if (files.length > 0) {
      result[category] = files;
    }
  }

  return result;
}

export async function defaultCommandRunner(cmd: string[], cwd?: string): Promise<string> {
  const [exe, ...args] = cmd;
  const proc = Bun.spawn([exe, ...args], {
    cwd: cwd || process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with code ${exitCode}: ${cmd.join(' ')}\n${stderr}`);
  }
  return stdout;
}

export async function defaultWhiteboardApiExecutor(
  tool: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const jsonStr = JSON.stringify(payload);
  const result = await $`whiteboard api ${tool} ${jsonStr}`.text();
  try {
    return JSON.parse(result.trim());
  } catch {
    return { raw: result.trim() };
  }
}

async function resolveChangedFiles(
  base: string,
  head: string,
  repoPath: string,
  runner?: CommandRunner,
): Promise<string[]> {
  try {
    let output = '';
    if (runner) {
      output = await runner(['git', 'diff', '--name-only', `${base}...${head}`], repoPath);
    } else {
      try {
        output = await $`git diff --name-only ${base}...${head}`.cwd(repoPath).text();
      } catch {
        output = await $`git diff --name-only ${base} ${head}`.cwd(repoPath).text();
      }
    }
    return output
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

async function resolveDefaultTitle(
  head: string,
  repoPath: string,
  runner?: CommandRunner,
): Promise<string> {
  try {
    if (runner) {
      const msg = await runner(['git', 'log', '-1', '--pretty=%s', head], repoPath);
      return msg.trim() || `Review: ${head}`;
    }
    const msg = await $`git log -1 --pretty=%s ${head}`.cwd(repoPath).text();
    return msg.trim() || `Review: ${head}`;
  } catch {
    return `Review: ${head}`;
  }
}

export async function runWhiteboardReview(
  options: WhiteboardReviewOptions,
  context?: WhiteboardExecutionContext,
): Promise<WhiteboardReviewResult> {
  const repoPath = path.resolve(options.repo || process.cwd());
  const openSession = options.open !== false;
  const isDryRun = Boolean(options.dryRun);

  const runner = context?.cmdRunner;
  const apiExecutor = context?.apiExecutor || defaultWhiteboardApiExecutor;

  let prDetails: PrDetails | undefined;
  if (options.pr !== undefined && options.pr !== null && String(options.pr).trim() !== '') {
    prDetails = await parsePrDetails(String(options.pr), { repoPath, runner });
  }

  const base = options.base || prDetails?.baseRefName || 'origin/main';
  const head = options.head || prDetails?.headRefName || 'HEAD';
  const pullRequestUrl = prDetails?.url;

  let title = options.title;
  if (!title) {
    if (prDetails?.title) {
      title = prDetails.title;
    } else {
      title = await resolveDefaultTitle(head, repoPath, runner);
    }
  }

  const changedFiles =
    context?.mockFiles !== undefined
      ? context.mockFiles
      : await resolveChangedFiles(base, head, repoPath, runner);

  const lenses = categorizeFilesIntoLenses(changedFiles);

  const apiCalls: WhiteboardApiCall[] = [];

  apiCalls.push({
    tool: 'session_capabilities',
    payload: {},
  });

  apiCalls.push({
    tool: 'session_register_repository',
    payload: { path: repoPath },
  });

  const dummyRepoId = 'repo-dry-run-id';
  const dummyBaseSha = '0000000000000000000000000000000000000001';
  const dummyHeadSha = '0000000000000000000000000000000000000002';
  const dummySessionId = 'session-dry-run-id';

  apiCalls.push({
    tool: 'session_resolve_pins',
    payload: {
      repositoryId: dummyRepoId,
      base,
      head,
    },
  });

  const createPayload: Record<string, unknown> = {
    title,
    pins: {
      repositoryId: dummyRepoId,
      base: dummyBaseSha,
      head: dummyHeadSha,
    },
    target: {
      kind: 'commits',
      repositoryId: dummyRepoId,
      base: dummyBaseSha,
      head: dummyHeadSha,
    },
    open: false,
  };
  if (pullRequestUrl) {
    createPayload.pullRequestUrl = pullRequestUrl;
  }
  apiCalls.push({
    tool: 'session_create',
    payload: createPayload,
  });

  const repinPayload: Record<string, unknown> = {
    sessionId: dummySessionId,
    pins: {
      repositoryId: dummyRepoId,
      base: dummyBaseSha,
      head: dummyHeadSha,
    },
  };
  if (pullRequestUrl) {
    repinPayload.pullRequestUrl = pullRequestUrl;
  }
  apiCalls.push({
    tool: 'session_repin',
    payload: repinPayload,
  });

  for (const [lensTitle, files] of Object.entries(lenses)) {
    apiCalls.push({
      tool: 'session_lens_edit',
      payload: {
        sessionId: dummySessionId,
        edit: {
          type: 'insert',
          title: lensTitle,
          targets: [
            {
              kind: 'files',
              patterns: files,
            },
          ],
        },
      },
    });
  }

  if (openSession) {
    apiCalls.push({
      tool: 'session_open',
      payload: { sessionId: dummySessionId },
    });
  }

  const plan: WhiteboardPlan = {
    repoPath,
    pr: prDetails,
    base,
    head,
    title,
    pullRequestUrl,
    changedFiles,
    lenses,
    apiCalls,
    open: openSession,
  };

  if (isDryRun) {
    return {
      dryRun: true,
      plan,
      lensesCreated: Object.keys(lenses).length,
      opened: openSession,
    };
  }

  await apiExecutor('session_capabilities', {});

  const regRes = await apiExecutor('session_register_repository', { path: repoPath });
  const repositoryId = String(regRes?.id || regRes?.repositoryId || '');
  if (!repositoryId) {
    throw new Error(
      `Failed to register repository: missing id in response (${JSON.stringify(regRes)})`,
    );
  }

  const pinsRes = await apiExecutor('session_resolve_pins', {
    repositoryId,
    base,
    head,
  });
  const baseSha = String(pinsRes?.base || base);
  const headSha = String(pinsRes?.head || head);

  const realCreatePayload: Record<string, unknown> = {
    title,
    pins: {
      repositoryId,
      base: baseSha,
      head: headSha,
    },
    target: {
      kind: 'commits',
      repositoryId,
      base: baseSha,
      head: headSha,
    },
    open: false,
  };
  if (pullRequestUrl) {
    realCreatePayload.pullRequestUrl = pullRequestUrl;
  }

  const createRes = await apiExecutor('session_create', realCreatePayload);
  const sessionId = String(
    createRes?.sessionId ||
      createRes?.reviewId ||
      createRes?.id ||
      (createRes?.review as Record<string, unknown> | undefined)?.reviewId ||
      (createRes?.review as Record<string, unknown> | undefined)?.id ||
      '',
  );
  if (!sessionId) {
    throw new Error(
      `Failed to create review session: missing sessionId in response (${JSON.stringify(createRes)})`,
    );
  }

  const realRepinPayload: Record<string, unknown> = {
    sessionId,
    pins: {
      repositoryId,
      base: baseSha,
      head: headSha,
    },
  };
  if (pullRequestUrl) {
    realRepinPayload.pullRequestUrl = pullRequestUrl;
  }
  await apiExecutor('session_repin', realRepinPayload);

  for (const [lensTitle, files] of Object.entries(lenses)) {
    await apiExecutor('session_lens_edit', {
      sessionId,
      edit: {
        type: 'insert',
        title: lensTitle,
        targets: [
          {
            kind: 'files',
            patterns: files,
          },
        ],
      },
    });
  }

  if (openSession) {
    await apiExecutor('session_open', { sessionId });
  }

  return {
    dryRun: false,
    sessionId,
    repositoryId,
    baseSha,
    headSha,
    lensesCreated: Object.keys(lenses).length,
    opened: openSession,
  };
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('init-pr-review')
    .description(
      'Initialize a dev.fast Whiteboard review session with lens grouping for PRs or git diffs',
    )
    .helpOption('-H, --help', 'Display help for command')
    .option('-p, --pr <number|url>', 'Pull request number or GitHub PR URL')
    .option('-r, --repo <path>', 'Local repository path (defaults to current working directory)')
    .option('-b, --base <ref>', 'Base git ref (defaults to origin/main or PR baseRefName)')
    .option('-h, --head <ref>', 'Head git ref (defaults to HEAD or PR headRefName)')
    .option(
      '-t, --title <title>',
      'Whiteboard session title (defaults to PR title or git commit message)',
    )
    .option('--no-open', 'Skip calling session_open')
    .option('--dry-run', 'Output JSON plan of commands and API calls without executing');

  return program;
}

export function parseCliArgs(argv: string[]): WhiteboardReviewOptions {
  const program = buildProgram();
  program.exitOverride();
  program.parse(argv);
  return program.opts<WhiteboardReviewOptions>();
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  program.parse(argv);
  const opts = program.opts<WhiteboardReviewOptions>();

  try {
    const result = await runWhiteboardReview(opts);
    if (opts.dryRun) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Whiteboard review session initialized successfully.');
      if (result.sessionId) {
        console.log(`Session ID: ${result.sessionId}`);
      }
      console.log(`Repository ID: ${result.repositoryId}`);
      console.log(`Lenses created: ${result.lensesCreated}`);
      if (result.opened) {
        console.log('Session opened in Whiteboard Desktop.');
      }
    }
  } catch (err) {
    console.error(
      'Error initializing Whiteboard review:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await runCli();
}
