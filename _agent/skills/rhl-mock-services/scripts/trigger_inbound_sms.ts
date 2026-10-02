#!/usr/bin/env bun
/**
 * trigger_inbound_sms.ts
 *
 * Simulates inbound SMS flow by posting to mock-services admin trigger
 * or directly dispatching Twilio-compatible webhooks to the backend API.
 */

import { Command } from 'commander';

export interface TriggerOptions {
  from: string;
  to: string;
  body: string;
  mockPort: number;
  backendPort: number;
  apiKey: string;
  direct?: boolean;
}

export async function resolveApiKey(): Promise<string> {
  if (process.env.EMPO_API_KEY) return process.env.EMPO_API_KEY;
  const envTestPath = 'workspaces/qa/.env.test';
  const file = Bun.file(envTestPath);
  if (await file.exists()) {
    const content = await file.text();
    const match = /^EMPO_API_KEY=(.*)$/m.exec(content);
    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return 'a39305c0-4e82-4083-9e2c-01f00fe25a8f';
}

export async function triggerInboundSms(
  opts: TriggerOptions,
): Promise<{ status: number; body: unknown }> {
  if (opts.direct) {
    // Post directly to backend webhook handler
    const url = `http://localhost:${opts.backendPort}/api/v1/communication/inbound-sms`;
    const formParams = new URLSearchParams({
      From: opts.from,
      To: opts.to,
      Body: opts.body,
      MessageSid: `SM${Date.now()}`,
      AccountSid: 'ACmock00000000000000000000000000',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': opts.apiKey,
      },
      body: formParams.toString(),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Return plain text
    }

    return { status: res.status, body: parsed };
  }

  // Post to mock-services admin trigger endpoint
  const url = `http://localhost:${opts.mockPort}/mock-admin/triggers/sqs/inbound-sms`;
  const payload = {
    from: opts.from,
    to: opts.to,
    body: opts.body,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Return plain text
  }

  return { status: res.status, body: parsed };
}

export async function runCli(): Promise<void> {
  const defaultApiKey = await resolveApiKey();

  const program = new Command()
    .name('trigger_inbound_sms')
    .description('Trigger inbound SMS through mock-services SQS queue or direct backend webhook.')
    .option('--from <phone>', 'Sender phone number', process.env.FROM_NUMBER || '+14155295117')
    .option('--to <phone>', 'Recipient phone number', process.env.TO_NUMBER || '+18884613835')
    .option(
      '--body <message>',
      'SMS body text',
      process.env.MESSAGE_BODY || `Test SMS ${Date.now()}`,
    )
    .option('--mock-port <port>', 'mock-services port', (val) => Number.parseInt(val, 10), 3001)
    .option('--backend-port <port>', 'backend-api port', (val) => Number.parseInt(val, 10), 3000)
    .option('--api-key <key>', 'Empo API key for backend', defaultApiKey)
    .option(
      '--direct',
      'Post directly to backend webhook instead of mock-services SQS trigger',
      false,
    )
    .addHelpText(
      'after',
      `
Examples:
  $ bun run trigger_inbound_sms.ts --body "Hello from patient"
  $ bun run trigger_inbound_sms.ts --from "+14155551234" --to "+18885559876" --body "STOP"
  $ bun run trigger_inbound_sms.ts --direct --body "Direct webhook test"
`,
    );

  program.parse();
  const opts = program.opts<TriggerOptions>();

  console.log(`Triggering inbound SMS:`);
  console.log(`  From: ${opts.from}`);
  console.log(`  To:   ${opts.to}`);
  console.log(`  Body: "${opts.body}"`);
  const mode = opts.direct
    ? `Direct Webhook -> port ${opts.backendPort}`
    : `Mock SQS Trigger -> port ${opts.mockPort}`;
  console.log(`  Mode: ${mode}\n`);

  try {
    const result = await triggerInboundSms(opts);
    console.log(`Response HTTP ${result.status}:`, JSON.stringify(result.body, null, 2));
    if (result.status >= 400) {
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error('Trigger failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
