import { describe, expect, it } from 'bun:test';
import {
  createGraphifyCli,
  getGraphStatus,
  loadGraphData,
  queryGraphNodes,
  resolvePythonPath,
  runGraphifyPipeline,
} from './run_graphify';

describe('skills/graphify/scripts/run_graphify.ts', () => {
  it('creates commander CLI with expected subcommands', () => {
    const cli = createGraphifyCli();
    expect(cli.name()).toBe('run_graphify');
    const commandNames = cli.commands.map((c) => c.name());
    expect(commandNames).toContain('build');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('query');
    expect(commandNames).toContain('python-path');
  });

  it('handles status for nonexistent target gracefully', async () => {
    const status = await getGraphStatus('nonexistent-target-directory-xyz');
    expect(status.exists).toBe(false);
    expect(status.nodesCount).toBe(0);
    expect(status.linksCount).toBe(0);
    expect(status.communitiesCount).toBe(0);
  });

  it('handles loadGraphData for nonexistent target gracefully', async () => {
    const data = await loadGraphData('nonexistent-target-directory-xyz');
    expect(data).toBeNull();
  });

  it('returns empty array when querying nonexistent directory', async () => {
    const results = await queryGraphNodes('test', 'nonexistent-target-directory-xyz');
    expect(results).toEqual([]);
  });

  it('resolves python interpreter path without throwing', async () => {
    const py = await resolvePythonPath('.');
    expect(typeof py).toBe('string');
    expect(py.length).toBeGreaterThan(0);
  });

  it('supports dry-run mode for pipeline execution', async () => {
    const result = await runGraphifyPipeline({
      targetPath: '.',
      outputDir: 'graphify-out',
      dryRun: true,
      directed: false,
      noViz: true,
    });
    expect(result).toBe(true);
  });
});
