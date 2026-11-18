#!/usr/bin/env bun
import process from 'node:process'
import { Command } from 'commander'

export interface QueryOptions {
  logGroup?: string
  query?: string
  start?: string
  end?: string
  profile?: string
  region?: string
  timeout?: number
  dryRun?: boolean
}

export function parseTimestamp(input?: string, defaultOffsetMinutes?: number): number {
  if (!input) {
    const nowSec = Math.floor(Date.now() / 1000)
    if (defaultOffsetMinutes) {
      return nowSec - defaultOffsetMinutes * 60
    }
    return nowSec
  }

  const numeric = Number(input)
  if (!Number.isNaN(numeric) && numeric > 1000000000) {
    return Math.floor(numeric)
  }

  const parsed = Date.parse(input)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp format: "${input}". Expected ISO-8601 string or epoch seconds.`)
  }

  return Math.floor(parsed / 1000)
}

export function buildStartQueryArgs(options: {
  logGroup: string
  query: string
  startSec: number
  endSec: number
  profile: string
  region: string
}): string {
  const escapedQuery = options.query.replace(/"/g, '\\"')
  return `aws logs start-query --profile "${options.profile}" --region "${options.region}" --log-group-name "${options.logGroup}" --start-time "${options.startSec}" --end-time "${options.endSec}" --query-string "${escapedQuery}" --query queryId --output text`
}

export function buildGetResultsArgs(queryId: string, profile: string, region: string): string {
  return `aws logs get-query-results --profile "${profile}" --region "${region}" --query-id "${queryId}" --output json`
}

export async function runQuery(
  options: QueryOptions,
  runner: (cmd: string) => Promise<string> = async (cmd) => (await Bun.$`sh -c ${cmd}`.text()).trim(),
  sleeper: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<unknown> {
  const logGroup = options.logGroup ?? '/ecs/backend/'
  const query = options.query ?? 'fields @timestamp, @message | sort @timestamp desc | limit 20'
  const profile = options.profile ?? 'empo-staging-read-only'
  const region = options.region ?? 'us-east-1'
  const startSec = parseTimestamp(options.start, 30)
  const endSec = parseTimestamp(options.end)
  const timeoutSec = options.timeout ?? 60

  const startCmd = buildStartQueryArgs({
    logGroup,
    query,
    startSec,
    endSec,
    profile,
    region,
  })

  if (options.dryRun) {
    return {
      dryRun: true,
      logGroup,
      query,
      startSec,
      endSec,
      profile,
      region,
      startCommand: startCmd,
    }
  }

  process.stderr.write('Starting CloudWatch Insights query...\n')
  process.stderr.write(`Log Group: ${logGroup}\n`)
  process.stderr.write(`Window: ${startSec} to ${endSec}\n`)

  const queryId = (await runner(startCmd)).trim()
  if (!queryId) {
    throw new Error('Failed to retrieve queryId from AWS CloudWatch.')
  }

  process.stderr.write(`Query ID: ${queryId}\n`)

  const startTime = Date.now()
  const statusCmd = `aws logs get-query-results --profile "${profile}" --region "${region}" --query-id "${queryId}" --query status --output text`

  while (true) {
    const status = (await runner(statusCmd)).trim()

    if (status === 'Complete') {
      break
    }
    if (status === 'Failed' || status === 'Cancelled') {
      throw new Error(`CloudWatch query ended with status: ${status}`)
    }

    if (Date.now() - startTime > timeoutSec * 1000) {
      throw new Error(`Query timed out after ${timeoutSec} seconds.`)
    }

    await sleeper(1000)
  }

  const resultsCmd = buildGetResultsArgs(queryId, profile, region)
  const rawResults = await runner(resultsCmd)
  return JSON.parse(rawResults)
}

export async function main() {
  const program = new Command()

  program
    .name('query_cw')
    .description('Execute a CloudWatch Logs Insights query and await formatted results')
    .option('-l, --log-group <name>', 'CloudWatch log group name', '/ecs/backend/')
    .option('-q, --query <string>', 'Insights query string', 'fields @timestamp, @message | sort @timestamp desc | limit 20')
    .option('-s, --start <iso_or_seconds>', 'Start time (ISO-8601 or epoch seconds; default: 30 minutes ago)')
    .option('-e, --end <iso_or_seconds>', 'End time (ISO-8601 or epoch seconds; default: now)')
    .option('-p, --profile <profile>', 'AWS CLI profile', 'empo-staging-read-only')
    .option('-r, --region <region>', 'AWS region', 'us-east-1')
    .option('-t, --timeout <seconds>', 'Polling timeout in seconds', (val) => Number.parseInt(val, 10), 60)
    .option('--dry-run', 'Preview start query command without executing')

  program.parse(process.argv)
  const opts = program.opts<QueryOptions>()

  try {
    const result = await runQuery(opts)
    console.log(JSON.stringify(result, null, 2))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Error: ${message}\n`)
    process.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
