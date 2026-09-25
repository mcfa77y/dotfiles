#!/usr/bin/env node
/**
 * parse_vitest_results.js
 *
 * Decompresses and parses Vitest HTML report metadata (html.meta.json.gz).
 * Extracts failing test files, suite titles, test names, and error traces.
 *
 * Usage:
 *   node parse_vitest_results.js [path_to_html.meta.json.gz]
 *   node parse_vitest_results.js --json
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function printHelp() {
  console.log(`
Usage:
  node parse_vitest_results.js [path/to/html.meta.json.gz] [options]

Options:
  --json          Output results formatted as JSON
  -h, --help      Show this help message

Auto-discovery locations:
  - workspaces/frontend-app/.tests-results/html/html.meta.json.gz
  - workspaces/backend-api/.tests-results/html/html.meta.json.gz
  - .tests-results/html/html.meta.json.gz
`);
}

function findMetaFile(targetPath) {
  if (targetPath && !targetPath.startsWith("--")) {
    const resolved = path.resolve(targetPath);
    if (fs.existsSync(resolved)) return resolved;
  }

  const searchCandidates = [
    "workspaces/frontend-app/.tests-results/html/html.meta.json.gz",
    "workspaces/backend-api/.tests-results/html/html.meta.json.gz",
    ".tests-results/html/html.meta.json.gz",
  ];

  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    for (const rel of searchCandidates) {
      const p = path.join(curr, rel);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  return null;
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

const jsonOutput = args.includes("--json");
const explicitPath = args.find((a) => !a.startsWith("-"));
const filePath = findMetaFile(explicitPath);

if (!filePath) {
  console.error("Error: Could not locate html.meta.json.gz. Specify the path explicitly.");
  process.exit(1);
}

try {
  const buffer = fs.readFileSync(filePath);
  const raw = JSON.parse(zlib.gunzipSync(buffer).toString("utf-8"));

  function getVal(idx) {
    if (typeof idx === "string" && /^\d+$/.test(idx)) {
      return raw[Number(idx)];
    }
    return idx;
  }

  const root = raw[0];
  const filesArr = getVal(root.files) || [];
  const failedList = [];

  for (const fIdx of filesArr) {
    const fileObj = getVal(fIdx);
    if (!fileObj) continue;

    const fileName = getVal(fileObj.name) || getVal(fileObj.filepath) || "unknown";
    const shortName = typeof fileName === "string"
      ? fileName.split("/workspaces/")[1] ? `workspaces/${fileName.split("/workspaces/")[1]}` : path.basename(fileName)
      : String(fileName);

    const tasksIdx = fileObj.tasks;
    const tasksArr = tasksIdx ? getVal(tasksIdx) : [];

    let hasFailure = false;
    const failedTasks = [];

    function checkTask(tRef, suitePath = []) {
      const taskObj = getVal(tRef);
      if (!taskObj) return;

      const taskName = getVal(taskObj.name) || "unnamed";
      const currentPath = [...suitePath, taskName];

      const tResult = taskObj.result ? getVal(taskObj.result) : null;
      const tState = tResult ? getVal(tResult.state) : getVal(taskObj.state);

      if (tState === "fail") {
        hasFailure = true;
        const errors = tResult && tResult.errors ? getVal(tResult.errors) : [];
        const errorMsgs = [];
        if (Array.isArray(errors)) {
          for (const eRef of errors) {
            const eObj = getVal(eRef);
            if (typeof eObj === "string") {
              errorMsgs.push(eObj);
            } else if (eObj && typeof eObj === "object") {
              const msg = getVal(eObj.message) || getVal(eObj.stack) || JSON.stringify(eObj);
              errorMsgs.push(msg);
            }
          }
        }
        failedTasks.push({
          suite: suitePath.join(" › "),
          name: taskName,
          errors: errorMsgs,
        });
      }

      if (taskObj.tasks) {
        const subTasks = getVal(taskObj.tasks);
        if (Array.isArray(subTasks)) {
          subTasks.forEach((t) => checkTask(t, currentPath));
        }
      }
    }

    if (Array.isArray(tasksArr)) {
      tasksArr.forEach((t) => checkTask(t));
    }

    const fResult = fileObj.result ? getVal(fileObj.result) : null;
    const fState = fResult ? getVal(fResult.state) : getVal(fileObj.state);
    if (fState === "fail" || hasFailure) {
      failedList.push({
        file: shortName,
        failedTasks,
      });
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      metaFile: filePath,
      totalTestFiles: filesArr.length,
      failedCount: failedList.length,
      failedTests: failedList,
    }, null, 2));
    process.exit(failedList.length > 0 ? 1 : 0);
  }

  console.log(`Source Report:    ${filePath}`);
  console.log(`Total Test Files: ${filesArr.length}`);
  console.log(`Failed Files:     ${failedList.length}`);

  if (failedList.length === 0) {
    console.log("\n All test suites passed.");
    process.exit(0);
  }

  console.log("\n" + "=".repeat(80));
  console.log("FAILED VITEST SUITES");
  console.log("=".repeat(80));

  failedList.forEach((f, idx) => {
    console.log(`\n${idx + 1}. ${f.file}`);
    f.failedTasks.forEach((t) => {
      const suitePrefix = t.suite ? `${t.suite} › ` : "";
      console.log(`   ✕ ${suitePrefix}${t.name}`);
      t.errors.forEach((e) => {
        const lines = (e || "").split("\n").slice(0, 4).join("\n        ");
        console.log(`        ${lines}`);
      });
    });
  });

  process.exit(1);
} catch (err) {
  console.error("Failed to parse Vitest report:", err.message);
  process.exit(1);
}
