#!/usr/bin/env bun
import path from 'node:path';
import process from 'node:process';
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  boldGreen: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
};
import { Command } from 'commander';

export interface GraphNode {
  id: string;
  label?: string;
  community?: number;
  community_name?: string;
  source_file?: string;
  source_location?: string;
  file_type?: string;
  [key: string]: unknown;
}

export interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
  source_file?: string;
  source_location?: string;
  [key: string]: unknown;
}

export interface GraphData {
  directed?: boolean;
  multigraph?: boolean;
  graph?: Record<string, unknown>;
  nodes: GraphNode[];
  links?: GraphLink[];
  edges?: GraphLink[];
  hyperedges?: unknown[];
  built_at_commit?: string;
}

export interface GraphStatusSummary {
  exists: boolean;
  nodesCount: number;
  linksCount: number;
  communitiesCount: number;
  path: string;
}

export interface QueryResult {
  node: GraphNode;
  neighbors: Array<{
    target: GraphNode;
    relation: string;
    direction: 'outgoing' | 'incoming' | 'undirected';
  }>;
}

/**
 * Resolves the path to the Python interpreter with graphify installed.
 */
export async function resolvePythonPath(targetDir = '.'): Promise<string> {
  const sidecarPath = path.join(targetDir, 'graphify-out', '.graphify_python');
  const sidecar = Bun.file(sidecarPath);
  if (await sidecar.exists()) {
    const py = (await sidecar.text()).trim();
    if (py) return py;
  }

  // Check uv tool run
  try {
    const proc = Bun.spawn(
      [
        'uv',
        'tool',
        'run',
        '--from',
        'graphifyy',
        'python',
        '-c',
        'import sys; print(sys.executable)',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (out) return out;
  } catch {
    // Continue
  }

  // Fallback to graphify binary shebang
  try {
    const whichProc = Bun.spawn(['which', 'graphify'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const binPath = (await new Response(whichProc.stdout).text()).trim();
    if (binPath) {
      const file = Bun.file(binPath);
      if (await file.exists()) {
        const firstLine = (await file.text()).split('\n')[0] ?? '';
        const shebang = firstLine.replace('#!', '').trim();
        if (shebang) return shebang;
      }
    }
  } catch {
    // Continue
  }

  return 'python3';
}

/**
 * Loads graph data from the specified target output directory.
 */
export async function loadGraphData(
  targetDir = '.',
  outDirName = 'graphify-out',
): Promise<GraphData | null> {
  const graphFile = Bun.file(path.join(targetDir, outDirName, 'graph.json'));
  if (!(await graphFile.exists())) {
    return null;
  }

  try {
    return (await graphFile.json()) as GraphData;
  } catch {
    return null;
  }
}

/**
 * Retrieves high-level graph statistics.
 */
export async function getGraphStatus(
  targetDir = '.',
  outDirName = 'graphify-out',
): Promise<GraphStatusSummary> {
  const filePath = path.join(targetDir, outDirName, 'graph.json');
  const data = await loadGraphData(targetDir, outDirName);

  if (!data) {
    return {
      exists: false,
      nodesCount: 0,
      linksCount: 0,
      communitiesCount: 0,
      path: filePath,
    };
  }

  const links = data.links ?? data.edges ?? [];
  const uniqueCommunities = new Set<number>();
  for (const node of data.nodes) {
    if (typeof node.community === 'number') {
      uniqueCommunities.add(node.community);
    }
  }

  return {
    exists: true,
    nodesCount: data.nodes.length,
    linksCount: links.length,
    communitiesCount: uniqueCommunities.size,
    path: filePath,
  };
}

/**
 * Queries the knowledge graph for nodes matching the query term and returns their neighborhood.
 */
export async function queryGraphNodes(
  query: string,
  targetDir = '.',
  outDirName = 'graphify-out',
): Promise<QueryResult[]> {
  const data = await loadGraphData(targetDir, outDirName);
  if (!data) return [];

  const lowerQuery = query.toLowerCase();
  const links = data.links ?? data.edges ?? [];
  const nodeMap = new Map<string, GraphNode>();

  for (const node of data.nodes) {
    nodeMap.set(node.id, node);
  }

  const matchingNodes = data.nodes.filter((node) => {
    const labelMatch = node.label?.toLowerCase().includes(lowerQuery);
    const idMatch = node.id.toLowerCase().includes(lowerQuery);
    return labelMatch || idMatch;
  });

  const results: QueryResult[] = [];

  for (const node of matchingNodes) {
    const neighbors: QueryResult['neighbors'] = [];

    for (const link of links) {
      if (link.source === node.id) {
        const targetNode = nodeMap.get(link.target);
        if (targetNode) {
          neighbors.push({
            target: targetNode,
            relation: link.relation ?? 'connects',
            direction: 'outgoing',
          });
        }
      } else if (link.target === node.id) {
        const sourceNode = nodeMap.get(link.source);
        if (sourceNode) {
          neighbors.push({
            target: sourceNode,
            relation: link.relation ?? 'connects',
            direction: 'incoming',
          });
        }
      }
    }

    results.push({
      node,
      neighbors,
    });
  }

  return results;
}

/**
 * Executes the full graphify pipeline on a target directory.
 */
export async function runGraphifyPipeline(options: {
  targetPath: string;
  outputDir: string;
  directed?: boolean;
  noViz?: boolean;
  dryRun?: boolean;
}): Promise<boolean> {
  const targetDir = path.resolve(options.targetPath);
  const outDir = path.resolve(targetDir, options.outputDir);

  if (options.dryRun) {
    console.log(c.cyan(`[DRY RUN] Would run graphify pipeline:`));
    console.log(`  Target:    ${targetDir}`);
    console.log(`  Output:    ${outDir}`);
    console.log(`  Directed:  ${Boolean(options.directed)}`);
    console.log(`  No-Viz:    ${Boolean(options.noViz)}`);
    return true;
  }

  const pythonBin = await resolvePythonPath(targetDir);

  const runnerScript = `
import sys, json
from pathlib import Path
from graphify.detect import detect, save_manifest
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from graphify.diagnostics import diagnose_extraction, format_diagnostic_report
from graphify.cli import _stamped_manifest_files

target = Path('${targetDir}')
out = Path('${outDir}')
out.mkdir(parents=True, exist_ok=True)

# 1. Detect
det = detect(target)
if det.get('total_files', 0) == 0:
    print('No supported files found.')
    sys.exit(0)

# 2. Extract AST
code_files = []
for f in det.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

ast_res = extract(code_files, cache_root=target) if code_files else {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}

# 3. Build & Cluster
extraction = {
    'nodes': ast_res.get('nodes', []),
    'edges': ast_res.get('edges', []),
    'hyperedges': [],
    'input_tokens': 0,
    'output_tokens': 0
}
G = build_from_json(extraction, root=str(target), directed=${options.directed ? 'True' : 'False'})
if G.number_of_nodes() == 0:
    print('Graph is empty.')
    sys.exit(1)

comm = cluster(G)
coh = score_all(G, comm)
gods = god_nodes(G)
surprises = surprising_connections(G, comm)
labels = {cid: f'Community {cid}' for cid in comm}
questions = suggest_questions(G, comm, labels)

to_json(G, comm, str(out / 'graph.json'))
rep = generate(G, comm, coh, labels, gods, surprises, det, {'input': 0, 'output': 0}, str(target), suggested_questions=questions)
(out / 'GRAPH_REPORT.md').write_text(rep, encoding='utf-8')

# Diagnostics
diag = diagnose_extraction(extraction, directed=${options.directed ? 'True' : 'False'}, root=str(target))
print(format_diagnostic_report(diag))
`;

  try {
    const proc = Bun.spawn([pythonBin, '-c', runnerScript], {
      cwd: targetDir,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return false;

    if (!options.noViz) {
      try {
        const vizProc = Bun.spawn([pythonBin, '-m', 'graphify.cli', 'export', 'html'], {
          cwd: targetDir,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        await vizProc.exited;
      } catch {
        // Ignore viz failure
      }
    }
    return true;
  } catch (err) {
    console.error(c.red('Failed to run graphify pipeline:'), err);
    return false;
  }
}

export function createGraphifyCli(): Command {
  const program = new Command();

  program
    .name('run_graphify')
    .description('Reusable Graphify knowledge graph CLI tool for agent skills and workspaces')
    .version('1.0.0');

  program
    .command('build [path]')
    .description('Run end-to-end graphify extraction, clustering, and reporting pipeline')
    .option('-o, --output <dir>', 'Output directory name relative to path', 'graphify-out')
    .option('--directed', 'Build directed graph preserving edge direction', false)
    .option('--no-viz', 'Skip HTML visualization export', false)
    .option('--dry-run', 'Preview execution parameters without running extraction', false)
    .action(async (targetPath = '.', options) => {
      console.log(c.blue(`Running graphify build on ${targetPath}...`));
      const success = await runGraphifyPipeline({
        targetPath,
        outputDir: options.output,
        directed: options.directed,
        noViz: options.noViz,
        dryRun: options.dryRun,
      });
      if (!success) {
        process.exitCode = 1;
      }
    });

  program
    .command('status [path]')
    .description('Show status and metrics of the codebase knowledge graph')
    .option('-o, --output <dir>', 'Output directory name relative to path', 'graphify-out')
    .action(async (targetPath = '.', options) => {
      const summary = await getGraphStatus(targetPath, options.output);
      if (!summary.exists) {
        console.log(c.yellow(`No graph found at ${summary.path}. Run build first.`));
        return;
      }

      console.log(c.green('✓ Knowledge Graph Loaded'));
      console.log(`  File:        ${c.cyan(summary.path)}`);
      console.log(`  Nodes:       ${c.bold(summary.nodesCount.toLocaleString())}`);
      console.log(`  Edges/Links: ${c.bold(summary.linksCount.toLocaleString())}`);
      console.log(`  Communities: ${c.bold(summary.communitiesCount.toString())}`);
    });

  program
    .command('query <term> [path]')
    .description('Query nodes and their immediate neighbors in the graph')
    .option('-o, --output <dir>', 'Output directory name relative to path', 'graphify-out')
    .option('--limit <number>', 'Maximum matching nodes to display', '10')
    .action(async (term: string, targetPath = '.', options) => {
      const results = await queryGraphNodes(term, targetPath, options.output);
      const limit = Number.parseInt(options.limit, 10) || 10;

      if (results.length === 0) {
        console.log(c.yellow(`No graph nodes found matching "${term}".`));
        return;
      }

      console.log(c.cyan(`Found ${results.length} matching nodes for "${term}":\n`));

      for (const res of results.slice(0, limit)) {
        const commStr = res.node.community_name ?? `Community ${res.node.community}`;
        console.log(`${c.boldGreen(res.node.label ?? res.node.id)} (${c.gray(res.node.id)})`);
        console.log(`  Community: ${c.blue(commStr)}`);
        if (res.node.source_file) {
          console.log(`  Location:  ${res.node.source_file}:${res.node.source_location ?? '1'}`);
        }
        console.log(`  Neighbors (${res.neighbors.length}):`);
        for (const nb of res.neighbors.slice(0, 8)) {
          const arrow = nb.direction === 'outgoing' ? '→' : '←';
          console.log(
            `    ${arrow} [${c.yellow(nb.relation)}] ${nb.target.label ?? nb.target.id} (${c.gray(nb.target.source_file ?? '')})`,
          );
        }
        if (res.neighbors.length > 8) {
          console.log(c.gray(`    ... and ${res.neighbors.length - 8} more neighbors`));
        }
        console.log('');
      }
    });

  program
    .command('python-path [path]')
    .description('Display resolved Python interpreter for graphify operations')
    .action(async (targetPath = '.') => {
      const py = await resolvePythonPath(targetPath);
      console.log(py);
    });

  return program;
}

if (import.meta.main) {
  const cli = createGraphifyCli();
  cli.parse(process.argv);
}
