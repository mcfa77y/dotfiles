import { describe, expect, it } from 'bun:test';
import {
  formatMarkdownReport,
  matchDestroyedBackendSignature,
  matchFilePattern,
  matchTerraformWorkspaceSignature,
  parsePullRequestsJson,
  type ScannedPRResult,
} from './scan_prs';

describe('scan_prs', () => {
  describe('matchDestroyedBackendSignature', () => {
    it('matches getaddrinfo ENOTFOUND errors', () => {
      const log = 'Error: getaddrinfo ENOTFOUND backend-pr-2725-rhl-4324-optimize-pr-fro';
      expect(matchDestroyedBackendSignature(log)).toBe('getaddrinfo ENOTFOUND');
    });

    it('matches net::ERR_NAME_NOT_RESOLVED', () => {
      const log = 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://pr-2418.preview.empohealth.com';
      expect(matchDestroyedBackendSignature(log)).toBe('net::ERR_NAME_NOT_RESOLVED');
    });

    it('matches 503 ALB unavailable errors', () => {
      const log = 'HTTP 503 Service Temporarily Unavailable';
      expect(matchDestroyedBackendSignature(log)).toBe('503 Service Temporarily Unavailable');
    });

    it('returns null for unrelated errors', () => {
      const log = 'AssertionError: expected true to be false';
      expect(matchDestroyedBackendSignature(log)).toBeNull();
    });
  });

  describe('matchTerraformWorkspaceSignature', () => {
    it('matches Failed to select workspace EOF', () => {
      const log = 'Error: Failed to select workspace: EOF';
      expect(matchTerraformWorkspaceSignature(log)).toBe('Failed to select workspace: EOF');
    });

    it('matches Currently selected workspace does not exist', () => {
      const log = 'Error: Currently selected workspace "pr-2418" does not exist';
      expect(matchTerraformWorkspaceSignature(log)).toBe(
        'Currently selected workspace does not exist',
      );
    });

    it('matches interactive select workspace prompt', () => {
      const log = 'Workspace does not exist. Please enter a number to select a workspace';
      expect(matchTerraformWorkspaceSignature(log)).toBe(
        'Workspace does not exist (interactive prompt)',
      );
    });

    it('returns null for clean logs', () => {
      const log = 'Apply complete! Resources: 1 added, 0 changed, 0 destroyed.';
      expect(matchTerraformWorkspaceSignature(log)).toBeNull();
    });
  });
  describe('matchFilePattern', () => {
    it('matches exact and substring filenames case-insensitively', () => {
      expect(
        matchFilePattern('workspaces/qa/sources/tests/regression/all-visits.test.ts', 'all-visits'),
      ).toBe(true);
      expect(matchFilePattern('workspaces/qa/sources/utils/PageUtils.ts', 'pageutils.ts')).toBe(
        true,
      );
    });

    it('matches regex patterns', () => {
      expect(
        matchFilePattern(
          'workspaces/qa/sources/tests/regression/all-visits.test.ts',
          'all-visits.*\\.ts$',
        ),
      ).toBe(true);
    });

    it('returns false when no match or empty pattern', () => {
      expect(matchFilePattern('workspaces/qa/sources/utils/PageUtils.ts', 'nonexistent')).toBe(
        false,
      );
      expect(matchFilePattern('workspaces/qa/sources/utils/PageUtils.ts', '')).toBe(false);
    });
  });

  describe('parsePullRequestsJson', () => {
    it('parses valid gh pr list output', () => {
      const raw = JSON.stringify([
        {
          number: 2418,
          title: 'feat: add dynamic linear webhooks',
          headRefName: 'rhl-3873-webhook',
          url: 'https://github.com/EmpoHealth/core/pull/2418',
          author: { login: 'mcfa77y' },
        },
      ]);
      const parsed = parsePullRequestsJson(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].number).toBe(2418);
      expect(parsed[0].headRefName).toBe('rhl-3873-webhook');
    });

    it('handles invalid json gracefully', () => {
      expect(parsePullRequestsJson('not valid json')).toEqual([]);
    });
  });

  describe('formatMarkdownReport', () => {
    it('returns clean message when no affected PRs', () => {
      const report = formatMarkdownReport([]);
      expect(report).toContain('No affected pull requests detected');
    });

    it('formats markdown table and sections for affected PRs', () => {
      const mockResult: ScannedPRResult = {
        prNumber: 2418,
        prTitle: 'feat: add dynamic linear webhooks',
        prUrl: 'https://github.com/EmpoHealth/core/pull/2418',
        author: 'mcfa77y',
        branch: 'rhl-3873-webhook',
        destroyedBackendQAFailures: [
          {
            runId: 12345,
            jobName: 'QA Tests',
            runUrl: 'https://github.com/EmpoHealth/core/actions/runs/12345',
            category: 'destroyed-backend',
            matchedText: 'getaddrinfo ENOTFOUND',
          },
        ],
        terraformInitWorkspaceFailures: [
          {
            runId: 67890,
            jobName: 'Deploy Frontend',
            runUrl: 'https://github.com/EmpoHealth/core/actions/runs/67890',
            category: 'terraform-workspace',
            matchedText: 'Currently selected workspace does not exist',
          },
        ],
      };

      const report = formatMarkdownReport([mockResult]);
      expect(report).toContain('[#2418](https://github.com/EmpoHealth/core/pull/2418)');
      expect(report).toContain('`rhl-3873-webhook`');
      expect(report).toContain('getaddrinfo ENOTFOUND');
      expect(report).toContain('Currently selected workspace does not exist');
    });
    it('formats matched files when filtering by file pattern', () => {
      const mockResult: ScannedPRResult = {
        prNumber: 3154,
        prTitle: 'fix: optimize visit query',
        prUrl: 'https://github.com/EmpoHealth/core/pull/3154',
        author: 'developer',
        branch: 'fix-visits',
        destroyedBackendQAFailures: [],
        terraformInitWorkspaceFailures: [],
        matchedFiles: ['workspaces/qa/sources/tests/regression/all-visits.test.ts'],
      };

      const report = formatMarkdownReport([mockResult]);
      expect(report).toContain('Found **1** matching pull requests.');
      expect(report).toContain('| PR | Author | Branch | Matched Files |');
      expect(report).toContain('[#3154](https://github.com/EmpoHealth/core/pull/3154)');
      expect(report).toContain('`workspaces/qa/sources/tests/regression/all-visits.test.ts`');
    });
  });
});
