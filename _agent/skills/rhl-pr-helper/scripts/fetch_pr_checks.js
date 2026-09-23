#!/usr/bin/env node
/**
 * fetch_pr_checks.js
 *
 * Inspects PR details, GitHub Action workflow runs, and status check rollups via GitHub's GraphQL API.
 * Zero external npm dependencies (uses native fetch with fallback to gh CLI).
 *
 * Usage:
 *   node fetch_pr_checks.js <pr_number>
 *   node fetch_pr_checks.js <repo> <pr_number>
 *   node fetch_pr_checks.js https://github.com/<owner>/<repo>/pull/<number>
 *   node fetch_pr_checks.js --repo owner/repo --pr 123 --format json
 */

import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const PR_DETAILS_QUERY = `
  query getPRDetails($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        title
        url
        state
        isDraft
        mergeable
        mergeStateStatus
        baseRefName
        baseRefOid
        headRefName
        headRefOid
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) {
                  nodes {
                    __typename
                    ... on CheckRun {
                      name
                      status
                      conclusion
                      detailsUrl
                      startedAt
                      completedAt
                      checkSuite {
                        workflowRun {
                          databaseId
                          workflow {
                            name
                          }
                        }
                      }
                    }
                    ... on StatusContext {
                      context
                      state
                      targetUrl
                      description
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

/**
 * Resolves the "owner/repo" string from git or gh cli context.
 *
 * @returns {string | null}
 */
function resolveCurrentRepo() {
  try {
    const res = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      encoding: 'utf8',
    });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {
    // ignore
  }

  try {
    const res = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(res.stdout.trim());
      if (match?.[1]) return match[1];
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Resolves a GitHub auth token from the environment or gh auth token.
 *
 * @returns {string | null}
 */
function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const res = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * @typedef {Object} TargetResult
 * @property {string} repo - Repository in "owner/repo" format
 * @property {number} prNumber - Pull request number
 */

/**
 * Parses user input arguments into repository and PR number.
 *
 * @param {string} [arg1] - URL, repo, or PR number
 * @param {string} [arg2] - PR number (if arg1 was repo)
 * @returns {TargetResult}
 */
function parseTarget(arg1, arg2) {
  if (arg1) {
    const urlMatch = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/i.exec(arg1);
    if (urlMatch) {
      return { repo: urlMatch[1], prNumber: Number.parseInt(urlMatch[2], 10) };
    }
  }

  if (arg1 && arg2 && !Number.isNaN(Number(arg2))) {
    return { repo: arg1, prNumber: Number.parseInt(arg2, 10) };
  }

  if (arg1 && !Number.isNaN(Number(arg1))) {
    const detected = resolveCurrentRepo();
    if (detected) {
      return { repo: detected, prNumber: Number.parseInt(arg1, 10) };
    }
  }

  throw new Error(
    'Please provide a PR number or URL:\n' +
      '  node fetch_pr_checks.js <pr_number> (inside git repo)\n' +
      '  node fetch_pr_checks.js <owner/repo> <pr_number>\n' +
      '  node fetch_pr_checks.js https://github.com/<owner>/<repo>/pull/<number>',
  );
}

/**
 * Executes a GraphQL query against the GitHub API using fetch with gh cli fallback.
 *
 * @param {string} query - GraphQL query string
 * @param {Record<string, unknown>} variables - Query variables
 * @param {string | null} token - GitHub auth token
 * @returns {Promise<any>}
 */
async function queryGraphQL(query, variables, token) {
  if (token) {
    try {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'rhl-pr-helper',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.ok) {
        const body = await res.json();
        if (body.errors && body.errors.length > 0) {
          throw new Error(body.errors.map((e) => e.message).join('; '));
        }
        return body.data;
      }
    } catch (err) {
      // Fallback to gh cli if fetch fails
    }
  }

  // Fallback via gh cli
  const ghArgs = [
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${variables.owner}`,
    '-F',
    `repo=${variables.repo}`,
    '-F',
    `number=${variables.number}`,
  ];

  const ghRes = spawnSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (ghRes.status !== 0) {
    throw new Error(ghRes.stderr || 'Failed to query GitHub GraphQL API');
  }

  const json = JSON.parse(ghRes.stdout);
  return json.data;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      repo: { type: 'string', short: 'r' },
      pr: { type: 'string', short: 'p' },
      format: { type: 'string', short: 'f', default: 'pretty' },
      token: { type: 'string', short: 't' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage:
  node fetch_pr_checks.js <pr_number> [options]
  node fetch_pr_checks.js <repo> <pr_number> [options]
  node fetch_pr_checks.js <pr_url> [options]

Options:
  -r, --repo <owner/repo>   Repository name (e.g. owner/repo)
  -p, --pr <number>         PR number
  -f, --format <format>     Output format: 'pretty' (default) or 'json'
  -t, --token <token>       GitHub token (defaults to GITHUB_TOKEN or 'gh auth token')
  -h, --help                Show help
`);
    process.exit(0);
  }

  const targetRepo = values.repo ?? positionals[0];
  const targetPr = values.pr ?? positionals[1];
  const { repo, prNumber } = parseTarget(targetRepo, targetPr);

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    console.error(`Invalid repo format "${repo}". Expected "owner/repo".`);
    process.exit(1);
  }

  const token = values.token || resolveToken();
  const data = await queryGraphQL(PR_DETAILS_QUERY, { owner, repo: repoName, number: prNumber }, token);

  const pr = data?.repository?.pullRequest;
  if (!pr) {
    console.error(`PR #${prNumber} not found in ${repo}`);
    process.exit(1);
  }

  const contexts = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const checkRuns = [];
  const statusContexts = [];

  for (const item of contexts) {
    if (item.__typename === 'CheckRun') {
      const runId =
        item.checkSuite?.workflowRun?.databaseId ??
        /actions\/runs\/(\d+)/.exec(item.detailsUrl || '')?.[1] ??
        null;

      checkRuns.push({
        name: item.name,
        workflow: item.checkSuite?.workflowRun?.workflow?.name ?? null,
        runId: runId ? String(runId) : null,
        status: item.status?.toLowerCase(),
        conclusion: item.conclusion?.toLowerCase() ?? null,
        detailsUrl: item.detailsUrl,
      });
    } else if (item.__typename === 'StatusContext') {
      statusContexts.push({
        context: item.context,
        state: item.state?.toLowerCase(),
        targetUrl: item.targetUrl,
        description: item.description,
      });
    }
  }

  const result = {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
    baseBranch: pr.baseRefName,
    baseSha: pr.baseRefOid,
    headBranch: pr.headRefName,
    headSha: pr.headRefOid,
    checkRuns,
    statusContexts,
  };

  if (values.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n=== PR #${result.number}: ${result.title} ===`);
  console.log(`Repository:   ${repo}`);
  console.log(`Base Branch:  ${result.baseBranch}${result.baseSha ? ` (${result.baseSha.slice(0, 7)})` : ''}`);
  console.log(`Head Branch:  ${result.headBranch}${result.headSha ? ` (${result.headSha.slice(0, 7)})` : ''}`);
  console.log(`Status:       ${result.state} ${result.isDraft ? '(Draft)' : ''}`);
  console.log(`Mergeable:    ${result.mergeable || 'UNKNOWN'} (${result.mergeStateStatus || 'UNKNOWN'})`);
  console.log(`URL:          ${result.url}\n`);

  if (result.mergeable === 'CONFLICTING' || result.mergeStateStatus === 'DIRTY') {
    console.log(`⚠️  WARNING: PR has merge conflicts with base branch '${result.baseBranch}'!\n`);
  }

  console.log(`Check Runs (${checkRuns.length}):`);
  for (const run of checkRuns) {
    const statusStr = run.conclusion ? `[${run.conclusion}]` : `[${run.status}]`;
    const wfStr = run.workflow ? ` (${run.workflow})` : '';
    const idStr = run.runId ? ` [run:${run.runId}]` : '';
    console.log(`  • ${statusStr.padEnd(14)} ${run.name}${wfStr}${idStr}`);
  }

  if (statusContexts.length > 0) {
    console.log(`\nStatus Contexts (${statusContexts.length}):`);
    for (const ctx of statusContexts) {
      console.log(`  • [${ctx.state}]`.padEnd(14) + ` ${ctx.context}: ${ctx.description || ''}`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('Execution error:', err.message);
  process.exit(1);
});
