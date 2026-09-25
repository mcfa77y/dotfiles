#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");

function getArg(flag, defaultValue) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

function resolveApiKey(workspaceRoot) {
  if (process.env.EMPO_API_KEY) return process.env.EMPO_API_KEY;
  const envTestPath = path.join(workspaceRoot, "workspaces/qa/.env.test");
  if (fs.existsSync(envTestPath)) {
    const content = fs.readFileSync(envTestPath, "utf-8");
    const match = content.match(/^EMPO_API_KEY=(.*)$/m);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, "");
  }
  return "a39305c0-4e82-4083-9e2c-01f00fe25a8f";
}

function findRepoRoot() {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  let curr = process.cwd();
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, "workspaces"))) return curr;
    if (fs.existsSync(path.join(curr, ".git"))) return curr;
    curr = path.dirname(curr);
  }
  return process.cwd();
}

const workspaceRoot = findRepoRoot();
const from = getArg("--from", process.env.FROM_NUMBER || "+14155295117");
const to = getArg("--to", process.env.TO_NUMBER || "+18884613835");
const body = getArg("--body", process.env.MESSAGE_BODY || `Test SMS ${Date.now()}`);
const mockPort = parseInt(getArg("--mock-port", process.env.MOCK_PORT || "3001"), 10);
const backendPort = parseInt(getArg("--backend-port", process.env.BACKEND_PORT || "3000"), 10);
const apiKey = getArg("--api-key", resolveApiKey(workspaceRoot));

async function postJson(options, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        ...options,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`Triggering inbound SMS via mock-services on port ${mockPort}...`);
  console.log(`From: ${from}, To: ${to}, Body: ${body}`);

  const triggerRes = await postJson(
    {
      hostname: "localhost",
      port: mockPort,
      path: "/mock-admin/triggers/sqs/inbound-sms",
    },
    { from, to, body }
  );

  console.log("Mock trigger response status:", triggerRes.status);
  console.log("Mock trigger response data:", JSON.stringify(triggerRes.data, null, 2));

  if (triggerRes.status !== 200 && triggerRes.status !== 201) {
    console.error("Mock trigger failed.");
    process.exit(1);
  }

  console.log(`Notifying backend-api on port ${backendPort} with empo-api-key...`);
  const backendRes = await postJson(
    {
      hostname: "localhost",
      port: backendPort,
      path: "/api/v2/admin/communications/sms",
      headers: {
        "empo-api-key": apiKey,
      },
    },
    {}
  );

  console.log("Backend response status:", backendRes.status);
  console.log("Backend response data:", JSON.stringify(backendRes.data, null, 2));
}

main().catch((err) => {
  console.error("Error executing trigger:", err);
  process.exit(1);
});
