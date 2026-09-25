#!/usr/bin/env node
/**
 * reopen_pr.js
 *
 * Bounces a GitHub Pull Request (close followed immediately by reopen)
 * to re-trigger GitHub Actions CI workflows on the current head commit.
 *
 * Usage:
 *   node reopen_pr.js <PR_NUMBER_OR_URL>
 *   node reopen_pr.js --help
 */

import { execFileSync } from "node:child_process";

/**
 * Parses a PR number or GitHub PR URL into an integer PR number.
 *
 * @param {string} input - PR number or GitHub pull URL
 * @returns {number}
 */
function parsePrNumber(input) {
  if (!input) {
    throw new Error("Missing PR number or URL.");
  }
  const clean = input.trim();
  const urlMatch = clean.match(/\/pull\/(\d+)/);
  if (urlMatch) {
    return parseInt(urlMatch[1], 10);
  }
  const num = parseInt(clean.replace(/^#/, ""), 10);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid PR number or URL: "${input}"`);
  }
  return num;
}

/**
 * Runs a command synchronously and returns stdout.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] }).trim();
}

/**
 * Main execution function.
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`
Usage:
  node reopen_pr.js <PR_NUMBER_OR_URL>

Description:
  Closes and immediately reopens a GitHub PR using the 'gh' CLI.
  This forces GitHub Actions to re-evaluate and kick off workflow runs
  for the current PR state without needing empty git commits.

Examples:
  node reopen_pr.js 2782
  node reopen_pr.js https://github.com/EmpoHealth/core/pull/2782
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const targetArg = args.find((a) => !a.startsWith("-"));
  const prNumber = parsePrNumber(targetArg);

  console.log(` Fetching PR #${prNumber} state...`);
  try {
    const rawStatus = run("gh", ["pr", "view", String(prNumber), "--json", "title,state,url"]);
    const prData = JSON.parse(rawStatus);
    console.log(`Target: ${prData.title} (${prData.url})`);
    console.log(`Current state: ${prData.state}`);

    if (prData.state === "MERGED") {
      console.error(`Cannot bounce PR #${prNumber}: PR is already MERGED.`);
      process.exit(1);
    }

    if (prData.state === "OPEN") {
      console.log(` Closing PR #${prNumber}...`);
      run("gh", ["pr", "close", String(prNumber)]);
    }

    console.log(` Reopening PR #${prNumber}...`);
    run("gh", ["pr", "reopen", String(prNumber)]);

    console.log(` Successfully bounced PR #${prNumber}. CI workflows triggered.`);
  } catch (err) {
    console.error(`Error bouncing PR #${prNumber}:`, err.stderr || err.message);
    process.exit(1);
  }
}

main();
