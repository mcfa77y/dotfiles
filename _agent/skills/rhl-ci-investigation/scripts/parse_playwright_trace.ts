#!/usr/bin/env bun
import { Command } from 'commander';
import AdmZip from 'adm-zip';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface TraceCall {
  type: string;
  callId?: string;
  stepId?: string;
  startTime?: number;
  endTime?: number;
  class?: string;
  method?: string;
  title?: string;
  params?: Record<string, unknown>;
  stack?: Array<{ file?: string; line?: number; column?: number; function?: string }>;
  error?: { name?: string; message?: string; stack?: string };
  message?: string;
}
export interface NetworkCall {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
}

export interface ParsedTraceResult {
  traceFile: string;
  hasError: boolean;
  error?: string;
  errorStack?: string;
  precedingCalls: Array<{
    callId?: string;
    type: string;
    title?: string;
    method?: string;
    selector?: string;
    time?: number;
    stack?: { file?: string; line?: number; column?: number; function?: string };
  }>;
  networkCalls?: NetworkCall[];
}

export function findTraceZips(targetPath: string): string[] {
  if (!existsSync(targetPath)) {
    return [];
  }

  const traceZips: string[] = [];
  const stat = statSync(targetPath);

  if (stat.isDirectory()) {
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.zip')) {
          traceZips.push(fullPath);
        }
      }
    };
    walk(targetPath);
  } else if (targetPath.endsWith('.zip')) {
    traceZips.push(targetPath);
  }

  return traceZips;
}

export function parseTraceLines(
  lines: string[],
  limit: number = 15,
): Omit<ParsedTraceResult, 'traceFile'> {
  const calls: TraceCall[] = [];
  let failureError: TraceCall | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as TraceCall;
      calls.push(parsed);
      if (parsed.error || parsed.type === 'error') {
        failureError = parsed;
      }
    } catch {
      // ignore non-json line
    }
  }

  const failureIndex = failureError ? calls.indexOf(failureError) : -1;
  const precedingCalls =
    failureIndex > 0 ? calls.slice(Math.max(0, failureIndex - limit), failureIndex) : [];

  return {
    hasError: !!failureError,
    error: failureError?.error?.message || failureError?.message,
    errorStack:
      failureError?.error?.stack ||
      (typeof failureError?.stack === 'string'
        ? failureError?.stack
        : failureError?.stack?.[0]?.file),
    precedingCalls: precedingCalls.map((c) => ({
      callId: c.callId,
      type: c.type,
      title: c.title,
      method: c.method,
      selector: typeof c.params?.selector === 'string' ? c.params.selector : undefined,
      time: c.startTime,
      stack: c.stack?.[0],
    })),
  };
}
export function parseNetworkLines(lines: string[]): NetworkCall[] {
  const calls: NetworkCall[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const snap = obj.snapshot;
      if (snap?.request?.url) {
        calls.push({
          method: snap.request.method || 'GET',
          url: snap.request.url,
          status: snap.response?.status,
          statusText: snap.response?.statusText,
        });
      }
    } catch {
      // ignore non-json line
    }
  }
  return calls;
}

export function parseTraceZip(
  zipPath: string,
  limit: number = 15,
  options?: { includeNetwork?: boolean },
): ParsedTraceResult | null {
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const traceEntries = entries.filter((e) => e.entryName.endsWith('.trace'));
    if (traceEntries.length === 0) {
      return null;
    }

    const lines: string[] = [];
    for (const entry of traceEntries) {
      const content = zip.readAsText(entry);
      lines.push(...content.split('\n'));
    }

    const parsed = parseTraceLines(lines, limit);

    let networkCalls: NetworkCall[] | undefined;
    const networkEntries = entries.filter((e) => e.entryName.endsWith('.network'));
    if (networkEntries.length > 0) {
      const netLines: string[] = [];
      for (const entry of networkEntries) {
        const netContent = zip.readAsText(entry);
        netLines.push(...netContent.split('\n'));
      }
      const parsedNet = parseNetworkLines(netLines);
      if (options?.includeNetwork) {
        networkCalls = parsedNet;
      } else {
        const failed = parsedNet.filter(
          (n) => typeof n.status === 'number' && (n.status >= 400 || n.status < 0),
        );
        if (failed.length > 0) {
          networkCalls = failed;
        }
      }
    }

    return {
      traceFile: zipPath,
      ...parsed,
      networkCalls,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to parse ${zipPath}: ${message}`);
    return null;
  }
}

export function formatTextReport(results: ParsedTraceResult[]): string {
  const out: string[] = [];

  for (const res of results) {
    out.push('======================================================');
    out.push(`Trace: ${res.traceFile}`);
    out.push(`Status: ${res.hasError ? 'FAILED' : 'PASSED'}`);
    if (res.hasError) {
      out.push(`\nFailure Error:\n${res.error?.trim()}`);
      out.push(`\nPreceding ${res.precedingCalls.length} Actions Before Failure:`);
      for (const call of res.precedingCalls) {
        const detail = call.selector ? ` [selector: ${call.selector}]` : '';
        const loc = call.stack?.file ? ` (${call.stack.file}:${call.stack.line})` : '';
        out.push(`  - [${call.type}] ${call.title || call.method || 'call'}${detail}${loc}`);
      }
    }
    if (res.networkCalls && res.networkCalls.length > 0) {
      out.push(`\nNetwork Requests (${res.networkCalls.length}):`);
      for (const net of res.networkCalls.slice(0, 20)) {
        const statusStr = net.status !== undefined ? ` [${net.status}]` : '';
        out.push(`  - ${net.method}${statusStr} ${net.url}`);
      }
      if (res.networkCalls.length > 20) {
        out.push(`  ... and ${res.networkCalls.length - 20} more`);
      }
    }
    out.push('======================================================\n');
  }

  return out.join('\n');
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('parse_playwright_trace')
    .description('Extract and analyze Playwright trace.zip failure steps and timeline')
    .argument('<path>', 'Path to trace.zip file or directory containing trace.zip files')
    .option('-l, --limit <number>', 'Number of preceding actions before failure to display', '15')
    .option('--json', 'Output results in JSON format')
    .option('--network', 'Include all network requests captured in trace')
    .action(
      async (targetPath: string, options: { limit: string; json?: boolean; network?: boolean }) => {
        const limit = parseInt(options.limit, 10) || 15;
        const traceZips = findTraceZips(targetPath);

        if (traceZips.length === 0) {
          console.error(`No trace .zip files found in '${targetPath}'.`);
          process.exit(1);
        }

        const results: ParsedTraceResult[] = [];
        for (const zipPath of traceZips) {
          const parsed = parseTraceZip(zipPath, limit, { includeNetwork: options.network });
          if (parsed) {
            results.push(parsed);
          }
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(formatTextReport(results));
        }
      },
    );

  return program;
}

if (import.meta.main) {
  buildCli().parse(process.argv);
}
