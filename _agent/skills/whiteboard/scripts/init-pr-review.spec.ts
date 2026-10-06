import { describe, expect, it } from 'bun:test';
import {
  categorizeFilesIntoLenses,
  parseCliArgs,
  parsePrDetails,
  parsePrIdentifier,
  runWhiteboardReview,
} from './init-pr-review';

describe('categorizeFilesIntoLenses', () => {
  it('categorizes monorepo files into appropriate review lenses', () => {
    const changedFiles = [
      'apps/web/src/components/Header.tsx',
      'apps/web/src/styles/main.css',
      'apps/api/src/routes/users.ts',
      'apps/backend/services/billing.py',
      'migrations/20261006_users.sql',
      '.github/workflows/deploy.yml',
      'terraform/modules/rds/main.tf',
      'Dockerfile',
      'wrangler.jsonc',
      'apps/web/src/components/Header.spec.tsx',
      'apps/api/src/routes/users.test.ts',
      'tests/e2e/login.spec.ts',
      'README.md',
      'package.json',
      'tsconfig.json',
      'data/unknown.bin',
    ];

    const lenses = categorizeFilesIntoLenses(changedFiles);

    expect(lenses.Frontend).toEqual([
      'apps/web/src/components/Header.tsx',
      'apps/web/src/styles/main.css',
    ]);
    expect(lenses['Backend API']).toEqual([
      'apps/api/src/routes/users.ts',
      'apps/backend/services/billing.py',
      'migrations/20261006_users.sql',
    ]);
    expect(lenses['Workflows & CI']).toEqual(['.github/workflows/deploy.yml']);
    expect(lenses['Terraform & Infrastructure']).toEqual([
      'terraform/modules/rds/main.tf',
      'Dockerfile',
      'wrangler.jsonc',
    ]);
    expect(lenses['Tests & QA']).toEqual([
      'apps/web/src/components/Header.spec.tsx',
      'apps/api/src/routes/users.test.ts',
      'tests/e2e/login.spec.ts',
    ]);
    expect(lenses['Documentation & Config']).toEqual([
      'README.md',
      'package.json',
      'tsconfig.json',
    ]);
    expect(lenses.Other).toEqual(['data/unknown.bin']);
  });

  it('prioritizes test categorization over component extension', () => {
    const files = [
      'src/components/Modal.tsx',
      'src/components/Modal.spec.tsx',
      'src/api/handler.py',
      'src/api/handler_test.py',
      'service_test.go',
    ];

    const lenses = categorizeFilesIntoLenses(files);

    expect(lenses.Frontend).toEqual(['src/components/Modal.tsx']);
    expect(lenses['Backend API']).toEqual(['src/api/handler.py']);
    expect(lenses['Tests & QA']).toEqual([
      'src/components/Modal.spec.tsx',
      'src/api/handler_test.py',
      'service_test.go',
    ]);
  });

  it('omits categories that have no matching files', () => {
    const files = ['apps/web/src/Button.tsx', 'apps/web/src/Button.module.css'];
    const lenses = categorizeFilesIntoLenses(files);

    expect(Object.keys(lenses)).toEqual(['Frontend']);
    expect(lenses.Frontend).toHaveLength(2);
    expect(lenses['Backend API']).toBeUndefined();
    expect(lenses['Tests & QA']).toBeUndefined();
  });

  it('handles empty input and whitespace safely', () => {
    expect(categorizeFilesIntoLenses([])).toEqual({});
    expect(categorizeFilesIntoLenses(['', '   ', '\n'])).toEqual({});
  });

  it('normalizes Windows backslashes in paths', () => {
    const files = ['apps\\web\\src\\App.tsx', '.github\\workflows\\ci.yml'];
    const lenses = categorizeFilesIntoLenses(files);

    expect(lenses.Frontend).toEqual(['apps/web/src/App.tsx']);
    expect(lenses['Workflows & CI']).toEqual(['.github/workflows/ci.yml']);
  });
});

describe('PR URL & number parsing', () => {
  it('parses plain numeric PR IDs', () => {
    const parsed = parsePrIdentifier('2725');
    expect(parsed.number).toBe(2725);
    expect(parsed.url).toBeUndefined();
  });

  it('parses hash-prefixed PR IDs', () => {
    const parsed = parsePrIdentifier('#4324');
    expect(parsed.number).toBe(4324);
  });

  it('parses full GitHub PR URLs', () => {
    const parsed = parsePrIdentifier('https://github.com/EmpoHealth/core/pull/2725');
    expect(parsed.number).toBe(2725);
    expect(parsed.owner).toBe('EmpoHealth');
    expect(parsed.repo).toBe('core');
    expect(parsed.url).toBe('https://github.com/EmpoHealth/core/pull/2725');
  });

  it('parses GitHub PR URLs with trailing subpaths', () => {
    const parsed = parsePrIdentifier('https://github.com/EmpoHealth/core/pull/2725/commits');
    expect(parsed.number).toBe(2725);
    expect(parsed.url).toBe('https://github.com/EmpoHealth/core/pull/2725');
  });

  it('throws for invalid PR identifiers', () => {
    expect(() => parsePrIdentifier('')).toThrow('PR input cannot be empty');
    expect(() => parsePrIdentifier('not-a-number')).toThrow('Invalid PR number or URL');
    expect(() => parsePrIdentifier('https://github.com/EmpoHealth/core/issues/100')).toThrow(
      'Invalid GitHub pull request URL',
    );
  });

  it('resolves PR details using runner output', async () => {
    const mockRunner = async () =>
      JSON.stringify({
        number: 2725,
        title: 'feat: Optimize PR frontend deploy job duration',
        url: 'https://github.com/EmpoHealth/core/pull/2725',
        baseRefName: 'main',
        headRefName: 'rhl-4324-optimize-frontend',
      });

    const details = await parsePrDetails('2725', { runner: mockRunner });
    expect(details.number).toBe(2725);
    expect(details.title).toBe('feat: Optimize PR frontend deploy job duration');
    expect(details.url).toBe('https://github.com/EmpoHealth/core/pull/2725');
    expect(details.baseRefName).toBe('main');
    expect(details.headRefName).toBe('rhl-4324-optimize-frontend');
  });

  it('accepts raw JSON details string directly', async () => {
    const rawJson = JSON.stringify({
      number: 99,
      title: 'Fix issue',
      url: 'https://github.com/test/repo/pull/99',
      baseRefName: 'main',
      headRefName: 'fix-bug',
    });

    const details = await parsePrDetails(rawJson);
    expect(details.number).toBe(99);
    expect(details.title).toBe('Fix issue');
  });

  it('throws descriptive error if runner produces invalid JSON', async () => {
    const mockRunner = async () => 'Not a valid json response';
    await expect(parsePrDetails('123', { runner: mockRunner })).rejects.toThrow(
      'Failed to parse PR JSON output',
    );
  });
});

describe('parseCliArgs', () => {
  it('parses short flags', () => {
    const args = parseCliArgs([
      'node',
      'init-pr-review.ts',
      '-p',
      '2725',
      '-b',
      'main',
      '-h',
      'feature-1',
      '-t',
      'Custom Title',
      '-r',
      '/custom/repo',
    ]);

    expect(args.pr).toBe('2725');
    expect(args.base).toBe('main');
    expect(args.head).toBe('feature-1');
    expect(args.title).toBe('Custom Title');
    expect(args.repo).toBe('/custom/repo');
    expect(args.open).toBe(true);
    expect(args.dryRun).toBeUndefined();
  });

  it('parses long flags and dry-run mode', () => {
    const args = parseCliArgs([
      'node',
      'init-pr-review.ts',
      '--pr',
      'https://github.com/EmpoHealth/core/pull/2725',
      '--base',
      'origin/main',
      '--head',
      'HEAD',
      '--no-open',
      '--dry-run',
    ]);

    expect(args.pr).toBe('https://github.com/EmpoHealth/core/pull/2725');
    expect(args.base).toBe('origin/main');
    expect(args.head).toBe('HEAD');
    expect(args.open).toBe(false);
    expect(args.dryRun).toBe(true);
  });
});

describe('dry-run output mode', () => {
  it('produces a full execution plan without calling live whiteboard API', async () => {
    let apiCalled = false;
    const mockApiExecutor = async () => {
      apiCalled = true;
      return {};
    };

    const mockRunner = async (cmd: string[]) => {
      if (cmd.includes('pr')) {
        return JSON.stringify({
          number: 2725,
          title: 'feat: Optimize duration',
          url: 'https://github.com/EmpoHealth/core/pull/2725',
          baseRefName: 'main',
          headRefName: 'rhl-4324-branch',
        });
      }
      return 'commit message';
    };

    const mockFiles = [
      'apps/web/src/App.tsx',
      'apps/api/src/server.ts',
      '.github/workflows/ci.yml',
    ];

    const result = await runWhiteboardReview(
      {
        pr: '2725',
        dryRun: true,
      },
      {
        apiExecutor: mockApiExecutor,
        cmdRunner: mockRunner,
        mockFiles,
      },
    );

    expect(apiCalled).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.plan).toBeDefined();

    const plan = result.plan!;
    expect(plan.base).toBe('main');
    expect(plan.head).toBe('rhl-4324-branch');
    expect(plan.title).toBe('feat: Optimize duration');
    expect(plan.pullRequestUrl).toBe('https://github.com/EmpoHealth/core/pull/2725');
    expect(plan.open).toBe(true);

    expect(plan.lenses.Frontend).toEqual(['apps/web/src/App.tsx']);
    expect(plan.lenses['Backend API']).toEqual(['apps/api/src/server.ts']);
    expect(plan.lenses['Workflows & CI']).toEqual(['.github/workflows/ci.yml']);

    const toolsPlanned = plan.apiCalls.map((c) => c.tool);
    expect(toolsPlanned).toContain('session_capabilities');
    expect(toolsPlanned).toContain('session_register_repository');
    expect(toolsPlanned).toContain('session_resolve_pins');
    expect(toolsPlanned).toContain('session_create');
    expect(toolsPlanned).toContain('session_repin');
    expect(toolsPlanned).toContain('session_lens_edit');
    expect(toolsPlanned).toContain('session_open');
  });

  it('omits session_open when open is false (--no-open)', async () => {
    const result = await runWhiteboardReview(
      {
        base: 'origin/main',
        head: 'HEAD',
        title: 'No Open Test',
        open: false,
        dryRun: true,
      },
      {
        mockFiles: ['src/index.ts'],
      },
    );

    expect(result.dryRun).toBe(true);
    const toolsPlanned = result.plan!.apiCalls.map((c) => c.tool);
    expect(toolsPlanned).not.toContain('session_open');
  });
});

describe('live review execution flow with mock API', () => {
  it('calls all whiteboard API endpoints in the correct sequence', async () => {
    const executedTools: string[] = [];
    const payloads: Record<string, unknown>[] = [];

    const mockApiExecutor = async (tool: string, payload: Record<string, unknown>) => {
      executedTools.push(tool);
      payloads.push(payload);

      if (tool === 'session_capabilities') {
        return { desktopAvailable: true };
      }
      if (tool === 'session_register_repository') {
        return { id: 'repo-abc-123' };
      }
      if (tool === 'session_resolve_pins') {
        return {
          repositoryId: 'repo-abc-123',
          base: 'sha-base-111',
          head: 'sha-head-222',
        };
      }
      if (tool === 'session_create') {
        return { sessionId: 'session-xyz-789' };
      }
      if (tool === 'session_repin') {
        return { ok: true };
      }
      if (tool === 'session_lens_edit') {
        return { lensId: 'lens-1' };
      }
      if (tool === 'session_open') {
        return { ok: true };
      }
      return {};
    };

    const mockFiles = [
      'apps/web/src/Button.tsx',
      'apps/api/src/routes.ts',
      '.github/workflows/ci.yml',
    ];

    const result = await runWhiteboardReview(
      {
        base: 'main',
        head: 'my-feature',
        title: 'Review Title',
        open: true,
        dryRun: false,
      },
      {
        apiExecutor: mockApiExecutor,
        mockFiles,
      },
    );

    expect(result.dryRun).toBe(false);
    expect(result.sessionId).toBe('session-xyz-789');
    expect(result.repositoryId).toBe('repo-abc-123');
    expect(result.baseSha).toBe('sha-base-111');
    expect(result.headSha).toBe('sha-head-222');
    expect(result.lensesCreated).toBe(3);
    expect(result.opened).toBe(true);

    expect(executedTools).toEqual([
      'session_capabilities',
      'session_register_repository',
      'session_resolve_pins',
      'session_create',
      'session_repin',
      'session_lens_edit',
      'session_lens_edit',
      'session_lens_edit',
      'session_open',
    ]);
  });
});
