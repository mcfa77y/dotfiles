#!/usr/bin/env bun
/**
 * post-review.ts
 *
 * Posts a unified pull request review with inline comments to GitHub via gh CLI.
 * Supports diff-hunk line validation to prevent GitHub 422 errors, auto-resolves
 * the PR's current head commit SHA, and handles review payloads via CLI flags or JSON stdin/file.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface InlineComment {
  path: string;
  line: number;
  body: string;
  side?: 'RIGHT' | 'LEFT';
}

export interface ReviewPayload {
  commit_id?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
  comments?: InlineComment[];
}

export interface PostReviewOptions {
  repo?: string;
  pr: string | number;
  event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
  bodyFile?: string;
  comments?: InlineComment[];
  commentsFile?: string;
  commitId?: string;
  dryRun?: boolean;
}

export function parsePrTarget(target: string | number): { repo: string | null; prNumber: number } {
  if (typeof target === 'number') {
    return { repo: null, prNumber: target };
  }
  const clean = target.trim();
  const urlMatch = clean.match(/github\.com\/([^/]+(?:\/[^/]+)?)\/pull\/(\d+)/i);
  if (urlMatch) {
    return { repo: urlMatch[1] || null, prNumber: parseInt(urlMatch[2]!, 10) };
  }
  if (clean.includes('#')) {
    const [repoPart, numPart] = clean.split('#', 2);
    const prNum = parseInt(numPart!.trim(), 10);
    if (!Number.isNaN(prNum)) {
      return { repo: repoPart!.trim() || null, prNumber: prNum };
    }
  }
  const num = parseInt(clean.replace(/^#/, ''), 10);
  if (!Number.isNaN(num)) {
    return { repo: null, prNumber: num };
  }
  throw new Error(
    `Could not parse PR number from '${target}'. Expected PR number or GitHub pull URL.`,
  );
}

export async function detectRepo(): Promise<string> {
  try {
    const out = (
      await $`gh repo view --json nameWithOwner -q .nameWithOwner`.quiet().text()
    ).trim();
    if (out && out.includes('/')) return out;
  } catch {
    // fallback
  }
  throw new Error('Could not detect repository. Provide --repo <owner>/<repo> explicitly.');
}

export async function getPrMetadata(
  repo: string,
  pr: number,
): Promise<{ headRefOid: string; url: string }> {
  const out = await $`gh pr view ${pr} --repo ${repo} --json headRefOid,url`.quiet().text();
  const data = JSON.parse(out);
  return { headRefOid: data.headRefOid, url: data.url };
}

export async function getDiffValidLines(
  repo: string,
  pr: number,
): Promise<Record<string, Set<number>>> {
  const out = await $`gh api /repos/${repo}/pulls/${pr}/files --paginate`.quiet().text();
  const files = JSON.parse(out) as Array<{ filename: string; patch?: string }>;

  const validLines: Record<string, Set<number>> = {};
  for (const file of files) {
    const filename = file.filename;
    const patch = file.patch;
    if (!patch) continue;

    validLines[filename] = new Set<number>();
    let currentRightLine = 0;

    for (const rawLine of patch.split('\n')) {
      const line = rawLine.trimEnd();
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        currentRightLine = parseInt(hunkMatch[1]!, 10);
        continue;
      }
      if (line.startsWith('+')) {
        validLines[filename].add(currentRightLine);
        currentRightLine += 1;
      } else if (line.startsWith(' ')) {
        validLines[filename].add(currentRightLine);
        currentRightLine += 1;
      }
    }
  }

  return validLines;
}

export async function postReview(options: PostReviewOptions) {
  const parsed = parsePrTarget(options.pr);
  const repo = options.repo || parsed.repo || (await detectRepo());
  const prNumber = parsed.prNumber;

  const { headRefOid, url } = await getPrMetadata(repo, prNumber);
  const commitId = options.commitId || headRefOid;

  let body = options.body || '';
  if (options.bodyFile) {
    body = await Bun.file(options.bodyFile).text();
  }

  let comments: InlineComment[] = options.comments || [];
  if (options.commentsFile) {
    comments = await Bun.file(options.commentsFile).json();
  }

  const validDiffLines = await getDiffValidLines(repo, prNumber);
  const verifiedComments: InlineComment[] = [];
  const fallbackComments: InlineComment[] = [];

  for (const comment of comments) {
    const filePath = comment.path;
    const lineNum = comment.line;
    const side = comment.side || 'RIGHT';

    if (filePath in validDiffLines && validDiffLines[filePath]!.has(lineNum)) {
      verifiedComments.push({
        path: filePath,
        line: lineNum,
        side,
        body: comment.body,
      });
    } else {
      fallbackComments.push(comment);
    }
  }

  if (fallbackComments.length > 0) {
    const fallbackText = fallbackComments
      .map((c) => `### Comment on \`${c.path}\` (line ${c.line})\n\n${c.body}`)
      .join('\n\n---\n\n');
    body = body
      ? `${body}\n\n## Additional Review Comments (Unchanged or Out-of-Diff Context)\n\n${fallbackText}`
      : `## Additional Review Comments\n\n${fallbackText}`;
  }

  const payload: ReviewPayload = {
    commit_id: commitId,
    event: options.event || 'COMMENT',
    body,
  };

  if (verifiedComments.length > 0) {
    payload.comments = verifiedComments;
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      repo,
      prNumber,
      url,
      payload,
      verifiedCommentsCount: verifiedComments.length,
      fallbackCommentsCount: fallbackComments.length,
    };
  }

  const tempPath = `/tmp/pr_review_${Date.now()}.json`;
  await Bun.write(tempPath, JSON.stringify(payload));

  try {
    const res =
      await $`gh api --method POST /repos/${repo}/pulls/${prNumber}/reviews --input ${tempPath}`
        .quiet()
        .text();
    const result = JSON.parse(res);
    return {
      dryRun: false,
      reviewId: result.id,
      reviewUrl: result.html_url || `${url}#pullrequestreview-${result.id}`,
      commitId,
      verifiedCommentsCount: verifiedComments.length,
      fallbackCommentsCount: fallbackComments.length,
    };
  } finally {
    try {
      await $`rm -f ${tempPath}`.quiet();
    } catch {
      // ignore
    }
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('post-review')
    .description('Post a unified GitHub PR review with inline comments and diff hunk validation.')
    .argument(
      '[pr_target]',
      'Pull request number or GitHub PR URL (e.g. 2864 or https://github.com/...)',
    )
    .option('-r, --repo <owner/repo>', 'Repository (auto-detected if omitted)')
    .option('-p, --pr <target>', 'Pull request number or URL')
    .option('-e, --event <event>', 'Review action: APPROVE, REQUEST_CHANGES, or COMMENT', 'COMMENT')
    .option('-b, --body <text>', 'Markdown summary for the review')
    .option('--body-file <file>', 'Path to file containing markdown summary')
    .option('-c, --comments <json>', 'JSON string representing array of inline comments')
    .option('--comments-file <file>', 'Path to JSON file containing array of inline comments')
    .option('--commit <sha>', 'Target commit SHA (auto-detected from PR head if omitted)')
    .option('-i, --input <file>', 'Path to full JSON payload file (or - for stdin)')
    .option('-d, --dry-run', 'Validate and output payload without posting to GitHub')
    .addHelpText(
      'after',
      `
Examples:
  # Approve a PR with a summary message
  $ bun run post-review.ts 2864 --event APPROVE --body "Approved: looks great!"

  # Request changes with comments from file
  $ bun run post-review.ts 2864 --event REQUEST_CHANGES --body-file summary.md --comments-file comments.json

  # Dry run to test validation
  $ bun run post-review.ts 2864 --event APPROVE --body "Good to go" --dry-run
`,
    );

  program.parse();

  const [argPr] = program.args;
  const opts = program.opts<{
    repo?: string;
    pr?: string;
    event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body?: string;
    bodyFile?: string;
    comments?: string;
    commentsFile?: string;
    commit?: string;
    input?: string;
    dryRun?: boolean;
  }>();

  let inputData: any = null;
  if (opts.input) {
    if (opts.input === '-') {
      inputData = JSON.parse(await Bun.stdin.text());
    } else {
      inputData = await Bun.file(opts.input).json();
    }
  } else if (!process.stdin.isTTY && !argPr && !opts.pr && !opts.body && !opts.bodyFile) {
    const raw = (await Bun.stdin.text()).trim();
    if (raw) {
      try {
        inputData = JSON.parse(raw);
      } catch {
        // not json
      }
    }
  }

  const prTarget = opts.pr || argPr || inputData?.pr;
  if (!prTarget) {
    console.error('Error: PR target is required.');
    program.help();
  }

  let inlineComments: InlineComment[] = [];
  if (opts.commentsFile) {
    inlineComments = await Bun.file(opts.commentsFile).json();
  } else if (opts.comments) {
    inlineComments = JSON.parse(opts.comments);
  } else if (inputData?.comments) {
    inlineComments = inputData.comments;
  }

  const event = (inputData?.event || opts.event || 'COMMENT') as
    | 'APPROVE'
    | 'REQUEST_CHANGES'
    | 'COMMENT';
  const body = opts.body || inputData?.body || '';

  try {
    const result = await postReview({
      pr: prTarget,
      repo: opts.repo || inputData?.repo,
      event,
      body,
      bodyFile: opts.bodyFile,
      comments: inlineComments,
      commitId: opts.commit || inputData?.commit_id,
      dryRun: opts.dryRun,
    });

    if (result.dryRun && result.payload) {
      console.log('✓ Dry Run Succeeded! Target PR:', result.url);
      console.log(`Commit: ${result.payload.commit_id} | Event: ${result.payload.event}`);
      console.log(
        `Inline comments: ${result.verifiedCommentsCount} valid, ${result.fallbackCommentsCount} fallback`,
      );
      console.log('\nPayload:');
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      console.log('✓ Review successfully published!');
      console.log(`Review URL: ${result.reviewUrl}`);
      console.log(`Review ID:  ${result.reviewId}`);
      console.log(`Commit:     ${result.commitId}`);
      console.log(`Inline comments posted: ${result.verifiedCommentsCount}`);
      if (result.fallbackCommentsCount > 0) {
        console.log(`Comments in summary:    ${result.fallbackCommentsCount}`);
      }
    }
  } catch (err: unknown) {
    console.error('Error posting review:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
