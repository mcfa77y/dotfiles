#!/usr/bin/env bun
/**
 * fetch_pr_checks.ts
 *
 * Fetches all GitHub CI check runs and commit status contexts for a given PR
 * using the GitHub GraphQL API via `gh api graphql` with Bun.$.
 */

import { $ } from 'bun';
import { Command } from 'commander';
import { parsePrTarget, resolveCurrentRepo } from './utils.ts';

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  workflow?: string;
  runId?: string;
  url?: string;
}

export interface StatusContext {
  context: string;
  state: string;
  description?: string;
  targetUrl?: string;
}

export interface PrChecksResult {
  prNumber: number;
  repo: string;
  title: string;
  headOid: string;
  state: string;
  isDraft: boolean;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  pendingChecks: number;
  checkRuns: CheckRun[];
  statusContexts: StatusContext[];
}

const PR_DETAILS_QUERY = `
query GetPRDetails($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      number
      title
      state
      isDraft
      headRefOid
      commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    status
                    conclusion
                    url
                    checkSuite {
                      workflowRun {
                        workflow {
                          name
                        }
                        databaseId
                      }
                    }
                  }
                  ... on StatusContext {
                    context
                    state
                    description
                    targetUrl
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

export async function fetchPrChecks(
  prTarget: string | number,
  explicitRepo?: string,
): Promise<PrChecksResult> {
  const parsed = parsePrTarget(prTarget);
  const repoString = parsed.repo || explicitRepo || (await resolveCurrentRepo());

  if (!repoString || !repoString.includes('/')) {
    throw new Error(
      'Unable to determine repository (owner/repo). Specify with --repo or pass full PR URL.',
    );
  }

  const [owner, repo] = repoString.split('/', 2);
  const prNumber = parsed.prNumber;

  let rawOutput = '';
  try {
    rawOutput = (
      await $`gh api graphql -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber} -f query=${PR_DETAILS_QUERY}`
        .quiet()
        .text()
    ).trim();
  } catch (err: unknown) {
    throw new Error(
      `GraphQL request failed: ${err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : String(err)}`,
    );
  }

  const data = JSON.parse(rawOutput);
  const pr = data?.data?.repository?.pullRequest;

  if (!pr) {
    throw new Error(`PR #${prNumber} not found in repository ${owner}/${repo}.`);
  }

  const commitNode = pr.commits?.nodes?.[0]?.commit;
  const rollupNodes = commitNode?.statusCheckRollup?.contexts?.nodes || [];

  const checkRuns: CheckRun[] = [];
  const statusContexts: StatusContext[] = [];

  for (const node of rollupNodes) {
    if (node.__typename === 'CheckRun') {
      checkRuns.push({
        name: node.name,
        status: node.status,
        conclusion: node.conclusion,
        workflow: node.checkSuite?.workflowRun?.workflow?.name,
        runId: node.checkSuite?.workflowRun?.databaseId
          ? String(node.checkSuite.workflowRun.databaseId)
          : undefined,
        url: node.url,
      });
    } else if (node.__typename === 'StatusContext') {
      statusContexts.push({
        context: node.context,
        state: node.state,
        description: node.description,
        targetUrl: node.targetUrl,
      });
    }
  }

  let successfulChecks = 0;
  let failedChecks = 0;
  let pendingChecks = 0;

  for (const run of checkRuns) {
    if (run.conclusion === 'SUCCESS') successfulChecks++;
    else if (
      run.conclusion === 'FAILURE' ||
      run.conclusion === 'TIMED_OUT' ||
      run.conclusion === 'CANCELLED'
    )
      failedChecks++;
    else pendingChecks++;
  }

  for (const ctx of statusContexts) {
    if (ctx.state === 'SUCCESS') successfulChecks++;
    else if (ctx.state === 'FAILURE' || ctx.state === 'ERROR') failedChecks++;
    else pendingChecks++;
  }

  return {
    prNumber,
    repo: `${owner}/${repo}`,
    title: pr.title,
    headOid: pr.headRefOid,
    state: pr.state,
    isDraft: Boolean(pr.isDraft),
    totalChecks: checkRuns.length + statusContexts.length,
    successfulChecks,
    failedChecks,
    pendingChecks,
    checkRuns,
    statusContexts,
  };
}

export function printChecksReport(result: PrChecksResult): void {
  console.log(`\n=== PR #${result.prNumber}: ${result.title} ===`);
  console.log(`Repository: ${result.repo}`);
  console.log(`Commit:     ${result.headOid}`);
  console.log(`State:      ${result.state}${result.isDraft ? ' (Draft)' : ''}`);
  console.log(
    `Summary:    ${result.successfulChecks} passed, ${result.failedChecks} failed, ${result.pendingChecks} pending (Total: ${result.totalChecks})\n`,
  );

  if (result.checkRuns.length > 0) {
    console.log(`Check Runs (${result.checkRuns.length}):`);
    for (const run of result.checkRuns) {
      const statusLabel = run.conclusion ? `[${run.conclusion}]` : `[${run.status}]`;
      const wfLabel = run.workflow ? ` (${run.workflow})` : '';
      const idLabel = run.runId ? ` [run:${run.runId}]` : '';
      console.log(`  * ${statusLabel.padEnd(14)} ${run.name}${wfLabel}${idLabel}`);
    }
  }

  if (result.statusContexts.length > 0) {
    console.log(`\nStatus Contexts (${result.statusContexts.length}):`);
    for (const ctx of result.statusContexts) {
      console.log(`  * [${ctx.state}]`.padEnd(14) + ` ${ctx.context}: ${ctx.description || ''}`);
    }
  }
  console.log();
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('fetch_pr_checks')
    .description('Fetch and display all GitHub CI check runs and commit status contexts for a PR.')
    .argument('<pr_target>', 'PR number (e.g. 2864), repo#number, or full PR URL')
    .option('-r, --repo <owner/repo>', 'Explicit repository name')
    .option('-f, --format <format>', "Output format: 'pretty' or 'json'", 'pretty')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run fetch_pr_checks.ts 2864
  $ bun run fetch_pr_checks.ts EmpoHealth/core#2864
  $ bun run fetch_pr_checks.ts 2864 --format json
`,
    );

  program.parse();

  const [prTarget] = program.args;
  const opts = program.opts<{ repo?: string; format?: string }>();

  if (!prTarget) {
    program.help();
  }

  try {
    const result = await fetchPrChecks(prTarget!, opts.repo);

    if (opts.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printChecksReport(result);
    }

    process.exit(result.failedChecks > 0 ? 1 : 0);
  } catch (err: unknown) {
    console.error('Execution error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
