#!/usr/bin/env bun
/**
 * manage_pr_comments.ts
 *
 * CLI tool to fetch, inspect, group, and reply to GitHub PR review comments.
 * Supports auto-resolving PRs from URLs or branch context, filtering resolved/answered
 * threads, posting single or batched replies, and dry-run verification.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface RawComment {
  id: number;
  user: { login: string };
  path: string;
  line: number | null;
  original_line: number | null;
  side: 'LEFT' | 'RIGHT' | null;
  body: string;
  in_reply_to_id?: number | null;
  diff_hunk?: string;
  created_at: string;
  html_url?: string;
}

export interface ReviewCommentThread {
  id: number;
  rootComment: RawComment;
  replies: RawComment[];
  path: string;
  line: number;
  authorLogin: string;
  isAnsweredByAuthor: boolean;
  totalComments: number;
}

export interface PrReview {
  id: number;
  user: { login: string };
  state: string;
  body: string;
  submitted_at?: string;
}

export interface PrTarget {
  repo: string | null;
  prNumber: number;
}

export interface CommentReplyRequest {
  commentId: number;
  body: string;
}

export interface ReplyResult {
  commentId: number;
  success: boolean;
  replyId?: number;
  url?: string;
  error?: string;
  dryRun?: boolean;
}

/**
 * Parses a PR target from a URL, #PR, or raw number.
 */
export function parsePrTarget(target: string | number): PrTarget {
  if (typeof target === 'number') {
    return { repo: null, prNumber: target };
  }
  const clean = target.trim();
  const urlMatch = /github\.com\/([^/]+(?:\/[^/]+)?)\/pull\/(\d+)/i.exec(clean);
  if (urlMatch) {
    return { repo: urlMatch[1] || null, prNumber: Number.parseInt(urlMatch[2]!, 10) };
  }
  if (clean.includes('#')) {
    const [repoPart, numPart] = clean.split('#', 2);
    const prNum = Number.parseInt(numPart!.trim(), 10);
    if (!Number.isNaN(prNum)) {
      return { repo: repoPart!.trim() || null, prNumber: prNum };
    }
  }
  const num = Number.parseInt(clean.replace(/^#/, ''), 10);
  if (!Number.isNaN(num) && num > 0) {
    return { repo: null, prNumber: num };
  }
  throw new Error(`Unable to parse pull request target: "${target}"`);
}

/**
 * Resolves repository name if not explicitly provided.
 */
export async function resolveRepo(explicitRepo?: string | null): Promise<string> {
  if (explicitRepo && explicitRepo.trim().length > 0) {
    return explicitRepo.trim();
  }
  try {
    const res = await $`gh repo view --json nameWithOwner -q .nameWithOwner`.text();
    const resolved = res.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // Ignore and try git remote fallback
  }

  try {
    const remoteUrl = await $`git config --get remote.origin.url`.text();
    const match = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remoteUrl.trim());
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Ignore
  }

  throw new Error('Unable to determine repository. Please specify --repo <owner/repo>.');
}

/**
 * Resolves active PR number from current git branch if omitted.
 */
export async function resolveCurrentPr(): Promise<{ repo: string; prNumber: number }> {
  try {
    const prJson =
      await $`gh pr view --json number,headRepositoryOwner,headRepository -q '{number: .number, owner: .headRepositoryOwner.login, repo: .headRepository.name}'`.text();
    const parsed = JSON.parse(prJson.trim()) as { number: number; owner?: string; repo?: string };
    if (parsed.number) {
      const repo =
        parsed.owner && parsed.repo ? `${parsed.owner}/${parsed.repo}` : await resolveRepo();
      return { repo, prNumber: parsed.number };
    }
  } catch (err: unknown) {
    throw new Error(
      `Failed to resolve active PR on current branch: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  throw new Error('No active pull request found on current branch.');
}

/**
 * Fetches PR details including the author login.
 */
export async function fetchPrAuthor(repo: string, prNumber: number): Promise<string> {
  try {
    const res = await $`gh api /repos/${repo}/pulls/${prNumber} -q .user.login`.text();
    return res.trim();
  } catch {
    return '';
  }
}

/**
 * Fetches all inline review comments for a PR.
 */
export async function fetchRawComments(repo: string, prNumber: number): Promise<RawComment[]> {
  const jsonStr = await $`gh api /repos/${repo}/pulls/${prNumber}/comments --paginate`.text();
  const raw = JSON.parse(jsonStr) as RawComment[];
  return raw;
}

/**
 * Fetches top-level PR reviews.
 */
export async function fetchReviews(repo: string, prNumber: number): Promise<PrReview[]> {
  const jsonStr = await $`gh api /repos/${repo}/pulls/${prNumber}/reviews --paginate`.text();
  const reviews = JSON.parse(jsonStr) as PrReview[];
  return reviews.filter((r) => r.body && r.body.trim().length > 0);
}

/**
 * Groups inline comments into conversation threads.
 */
export function groupCommentThreads(
  comments: RawComment[],
  prAuthor: string,
): ReviewCommentThread[] {
  const roots: RawComment[] = [];
  const replyMap = new Map<number, RawComment[]>();

  for (const c of comments) {
    if (c.in_reply_to_id) {
      const existing = replyMap.get(c.in_reply_to_id) ?? [];
      existing.push(c);
      replyMap.set(c.in_reply_to_id, existing);
    } else {
      roots.push(c);
    }
  }

  return roots.map((root) => {
    const replies = replyMap.get(root.id) ?? [];
    // Sort replies chronologically
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const isAnsweredByAuthor =
      prAuthor.length > 0 &&
      (root.user.login === prAuthor || replies.some((rep) => rep.user.login === prAuthor));

    return {
      id: root.id,
      rootComment: root,
      replies,
      path: root.path,
      line: root.line ?? root.original_line ?? 0,
      authorLogin: root.user.login,
      isAnsweredByAuthor,
      totalComments: 1 + replies.length,
    };
  });
}

/**
 * Posts a single threaded reply to a review comment.
 */
export async function postCommentReply(
  repo: string,
  prNumber: number,
  commentId: number,
  body: string,
  dryRun = false,
): Promise<ReplyResult> {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error(`Reply body cannot be empty for comment ${commentId}`);
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would reply to PR #${prNumber} comment ${commentId} in ${repo}:`);
    console.log(trimmedBody);
    return { commentId, success: true, dryRun: true };
  }

  try {
    const res =
      await $`gh api --method POST /repos/${repo}/pulls/${prNumber}/comments/${commentId}/replies -f body=${trimmedBody}`.text();
    const data = JSON.parse(res) as { id: number; html_url?: string };
    return {
      commentId,
      success: true,
      replyId: data.id,
      url: data.html_url,
      dryRun: false,
    };
  } catch (err: unknown) {
    return {
      commentId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      dryRun: false,
    };
  }
}

/**
 * Posts a batch of replies.
 */
export async function postBatchReplies(
  repo: string,
  prNumber: number,
  replies: CommentReplyRequest[],
  dryRun = false,
): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];
  for (const r of replies) {
    const res = await postCommentReply(repo, prNumber, r.commentId, r.body, dryRun);
    results.push(res);
  }
  return results;
}

/**
 * Formats threads into a human-readable markdown summary.
 */
export function formatThreadsAsMarkdown(
  threads: ReviewCommentThread[],
  reviews: PrReview[],
  unresolvedOnly = false,
): string {
  const filteredThreads = unresolvedOnly ? threads.filter((t) => !t.isAnsweredByAuthor) : threads;

  let out = `# PR Review Comments Summary\n\n`;
  out += `Total Threads: ${threads.length} (${filteredThreads.length} active/unresolved)\n\n`;

  if (reviews.length > 0) {
    out += `## Top-Level Reviews\n\n`;
    for (const r of reviews) {
      out += `### @${r.user.login} (${r.state})\n`;
      out += `${r.body}\n\n`;
    }
  }

  out += `## Inline Comment Threads\n\n`;
  if (filteredThreads.length === 0) {
    out += `No active or unresolved review comments found.\n`;
    return out;
  }

  for (const t of filteredThreads) {
    const answeredBadge = t.isAnsweredByAuthor ? '✅ Answered' : '⏳ Pending Response';
    out += `### Thread #${t.id}: \`${t.path}\` (line ${t.line}) - ${answeredBadge}\n`;
    out += `**@${t.rootComment.user.login}**: ${t.rootComment.body}\n\n`;

    if (t.replies.length > 0) {
      out += `**Replies (${t.replies.length}):**\n`;
      for (const rep of t.replies) {
        out += `- **@${rep.user.login}**: ${rep.body}\n`;
      }
      out += `\n`;
    }
    out += `---\n\n`;
  }

  return out;
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('manage_pr_comments')
    .description('Manage, inspect, and reply to GitHub PR review comments.');

  // Fetch command
  program
    .command('fetch')
    .description('Fetch and display PR review comments and discussion threads.')
    .argument('[pr]', 'Pull request number or full URL')
    .option('--repo <owner/repo>', 'Repository owner/name')
    .option('--unresolved-only', 'Filter out threads answered by the PR author', false)
    .option('--json', 'Output raw JSON format', false)
    .option('--markdown', 'Output markdown format', false)
    .action(async (target, options) => {
      let repo: string;
      let prNumber: number;

      if (target) {
        const parsed = parsePrTarget(target);
        prNumber = parsed.prNumber;
        repo = await resolveRepo(options.repo || parsed.repo);
      } else {
        const resolved = await resolveCurrentPr();
        repo = options.repo || resolved.repo;
        prNumber = resolved.prNumber;
      }

      const author = await fetchPrAuthor(repo, prNumber);
      const rawComments = await fetchRawComments(repo, prNumber);
      const reviews = await fetchReviews(repo, prNumber);
      const threads = groupCommentThreads(rawComments, author);

      const filteredThreads = options.unresolvedOnly
        ? threads.filter((t) => !t.isAnsweredByAuthor)
        : threads;

      if (options.json) {
        console.log(
          JSON.stringify({ repo, prNumber, author, reviews, threads: filteredThreads }, null, 2),
        );
      } else if (options.markdown) {
        console.log(formatThreadsAsMarkdown(threads, reviews, options.unresolvedOnly));
      } else {
        console.log(`\nPull Request #${prNumber} in ${repo} (Author: @${author})\n`);
        console.log(
          `Found ${threads.length} thread(s) (${filteredThreads.length} active/unresolved):\n`,
        );

        for (const t of filteredThreads) {
          const status = t.isAnsweredByAuthor ? '[ANSWERED]' : '[PENDING]';
          console.log(`• ${status} ID: ${t.id} | ${t.path}:${t.line} | by @${t.authorLogin}`);
          console.log(`  "${t.rootComment.body.replace(/\n/g, ' ').slice(0, 100)}..."`);
          if (t.replies.length > 0) {
            console.log(`  └─ ${t.replies.length} replies`);
          }
          console.log();
        }
      }
    });

  // Reply command
  program
    .command('reply')
    .description('Post a threaded reply to a review comment.')
    .argument('[pr]', 'Pull request number or full URL')
    .option('--repo <owner/repo>', 'Repository owner/name')
    .option('-c, --comment-id <id>', 'Target root comment ID')
    .option('-b, --body <text>', 'Reply comment text')
    .option('-f, --body-file <path>', 'Path to file containing reply text')
    .option('-r, --replies-file <path>', 'JSON file containing array of {commentId, body}')
    .option('--dry-run', 'Preview replies without posting to GitHub', false)
    .action(async (target, options) => {
      let repo: string;
      let prNumber: number;

      if (target) {
        const parsed = parsePrTarget(target);
        prNumber = parsed.prNumber;
        repo = await resolveRepo(options.repo || parsed.repo);
      } else {
        const resolved = await resolveCurrentPr();
        repo = options.repo || resolved.repo;
        prNumber = resolved.prNumber;
      }

      const replyRequests: CommentReplyRequest[] = [];

      if (options.repliesFile) {
        const fileContent = await Bun.file(options.repliesFile).text();
        const parsedRequests = JSON.parse(fileContent) as CommentReplyRequest[];
        replyRequests.push(...parsedRequests);
      } else if (options.commentId) {
        const commentId = Number.parseInt(options.commentId, 10);
        let bodyText = options.body || '';
        if (options.bodyFile) {
          bodyText = await Bun.file(options.bodyFile).text();
        }
        if (!bodyText.trim()) {
          console.error('Error: Reply body must be provided via --body or --body-file.');
          process.exit(1);
        }
        replyRequests.push({ commentId, body: bodyText.trim() });
      } else {
        console.error('Error: Either --comment-id or --replies-file is required.');
        process.exit(1);
      }

      console.log(`Posting ${replyRequests.length} reply(ies) to PR #${prNumber} in ${repo}...`);
      const results = await postBatchReplies(repo, prNumber, replyRequests, options.dryRun);

      let failureCount = 0;
      for (const res of results) {
        if (res.success) {
          if (res.dryRun) {
            console.log(`✓ [DRY RUN] Comment #${res.commentId}: Prepared reply.`);
          } else {
            console.log(
              `✓ Comment #${res.commentId}: Reply posted successfully -> ${res.url ?? res.replyId}`,
            );
          }
        } else {
          console.error(`✗ Comment #${res.commentId}: Failed to post reply: ${res.error}`);
          failureCount++;
        }
      }

      if (failureCount > 0) {
        process.exit(1);
      }
    });

  await program.parseAsync();
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
