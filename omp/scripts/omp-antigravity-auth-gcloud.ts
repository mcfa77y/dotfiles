#!/usr/bin/env bun
/**
 * Antigravity OAuth token generator for omp using gcloud.
 */

import { homedir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const HARDCODED_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "empo-health-antigravity";

async function getGcloudToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("/Users/joe/Projects/git-apps/google-cloud-sdk/bin/gcloud", ["auth", "print-access-token"]);
    let out = "";
    let err = "";
    proc.stdout.on("data", d => out += d);
    proc.stderr.on("data", d => err += d);
    proc.on("close", code => {
      if (code !== 0) {
        reject(new Error(`gcloud auth print-access-token failed: ${err}`));
      } else {
        resolve(out.trim());
      }
    });
    proc.on("error", reject);
  });
}

async function main(): Promise<void> {
  try {
    const token = await getGcloudToken();
    const cache = {
      apiEndpoint: "",
      token,
      enterpriseUrl: "",
      projectId: HARDCODED_PROJECT_ID,
      refreshToken: "",
      expiresAt: Date.now() + 3600000,
      email: "joe@empohealth.com",
      accountId: "",
    };
    console.log(JSON.stringify(cache));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
