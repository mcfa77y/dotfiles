#!/usr/bin/env bun
/**
 * lint_pr.ts
 *
 * Validates a commit message or PR description against Empo Health PR formatting rules.
 * Enforces title character limits (<= 72), setext level-2 header underlines,
 * required section ordering, Linear ticket formatting, and empty Reviews & Merging section.
 */

import { Command } from 'commander';
import { printLintErrors } from './utils.ts';

export interface MarkdownSection {
  header: string;
  headerUnderline: string;
  level: number;
  style: 'setext' | 'atx';
  content: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  title: string;
  body: string;
  sections: MarkdownSection[];
  sectionsByHeader: Record<string, MarkdownSection>;
}

/**
 * Parses markdown text into top-level sections bounded by level 1 or 2 headers.
 */
export function parseIntoSections(content: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];

  const startOfLineBoundary = `(?<=^|\\n)`;
  const setextUnderlinePattern = '===+|---+';
  const setextHeaderPattern = `([^\\n]+)\\n(${setextUnderlinePattern})`;
  const atxPrefixPattern = '#{1,2}';
  const atxHeaderPattern = `(${atxPrefixPattern})[ \\t]+([^\\n]+?)(?:[ \\t]+#+)?[ \\t]*`;
  const headerPattern = `${startOfLineBoundary}(?:${setextHeaderPattern}|${atxHeaderPattern})`;
  const nextHeaderDelimiterPattern = headerPattern.replaceAll(/\((?!\?)/g, '(?:');
  const sectionContentPattern = `(?:\\n(.*?)(?=(?:\\n?${nextHeaderDelimiterPattern})|$)|$)`;

  const sectionRegex = new RegExp(`${headerPattern}${sectionContentPattern}`, 'gs');

  for (const match of content.matchAll(sectionRegex)) {
    const style = match[1] !== undefined ? 'setext' : 'atx';
    const header = style === 'setext' ? match[1] : match[4];
    const headerUnderline = style === 'setext' ? match[2] : '';
    const level =
      style === 'setext' ? (match[2]?.startsWith('=') ? 1 : 2) : (match[3]?.length ?? 2);
    const sectionContent = match[5];

    sections.push({
      header: header || '',
      headerUnderline: headerUnderline || '',
      level,
      style,
      content: sectionContent || '',
    });
  }

  return sections;
}

/**
 * Validates a full commit message / PR text against Empo Health PR format rules.
 */
export function validateCommitMessage(commitMessage: string): ValidationResult {
  const lines = commitMessage.split(/\r?\n/);

  const title = lines[0] || '';
  const body = lines.slice(1).join('\n');

  const errors: string[] = [];

  if (title.length > 72) {
    errors.push(`Title must not be longer than 72 characters (current: ${title.length})`);
  }

  if (body.at(0) !== '\n') {
    errors.push('Body must start with a blank line after the title');
  }

  const sections = parseIntoSections(body).filter((x) => x.level <= 2);
  const sectionsByHeader = sections.reduce<Record<string, MarkdownSection>>(
    (acc, x) => ({ ...acc, [x.header]: x }),
    {},
  );

  const expectedSections = [
    'Detailed Description',
    'Relevant Linear Tickets',
    'Reviews and Merging',
  ];
  const actualSections = sections.map((x) => x.header);
  if (JSON.stringify(actualSections) !== JSON.stringify(expectedSections)) {
    const missingSections = Array.from(
      new Set(expectedSections).difference(new Set(actualSections)),
    );
    const extraSections = Array.from(new Set(actualSections).difference(new Set(expectedSections)));

    const messages = [
      missingSections.length > 0 ? `Missing sections: ${missingSections.join(', ')}` : '',
      extraSections.length > 0 ? `Extra sections: ${extraSections.join(', ')}` : '',
      missingSections.length <= 0 && extraSections.length <= 0 ? 'Sections out of order' : '',
    ].filter((x) => x !== '');

    errors.push(`Body must contain only the expected sections in order\n${messages.join('\n')}`);
  }

  const levelOneHeaders = sections.filter((x) => x.level === 1).map((x) => x.header);
  if (levelOneHeaders.length > 0) {
    errors.push(
      `There must be no level 1 headings; all section headings must be level 2+\nFailing sections: ${levelOneHeaders.join(', ')}`,
    );
  }

  const atxHeaders = sections.filter((x) => x.style === 'atx').map((x) => x.header);
  if (atxHeaders.length > 0) {
    errors.push(
      `All section headings must use setext style, not ATX style\nFailing sections: ${atxHeaders.join(', ')}`,
    );
  }

  const headersWithIncorrectUnderlineLength = sections
    .filter((x) => x.style === 'setext' && x.header.length !== x.headerUnderline.length)
    .map((x) => x.header);
  if (headersWithIncorrectUnderlineLength.length > 0) {
    errors.push(
      `The underline for every section heading must match the length of the heading\nFailing sections: ${headersWithIncorrectUnderlineLength.join(', ')}`,
    );
  }

  const sectionsNotSurroundedByBlankLines = sections
    .filter((x) => x.header !== 'Reviews and Merging')
    .filter((x) => x.content.slice(0, 1) !== '\n' || x.content.slice(-1) !== '\n')
    .map((x) => x.header);
  if (sectionsNotSurroundedByBlankLines.length > 0) {
    errors.push(
      `Every section except for the "Reviews and Merging" section must start and end with a blank line\nNot met by sections: ${sectionsNotSurroundedByBlankLines.join(', ')}`,
    );
  }

  const relevantLinearTicketsContent =
    sectionsByHeader['Relevant Linear Tickets']?.content.replaceAll(/^\n|\n$/g, '') || '';
  if (
    !/^This change contributes to [A-Z][A-Z0-9]*-[0-9]+(?:, [A-Z][A-Z0-9]*-[0-9]+)*\.$/.test(
      relevantLinearTicketsContent,
    )
  ) {
    errors.push(
      'The "Relevant Linear Tickets" section must match the format: "This change contributes to [ticket IDs, separated by commas]."',
    );
  }

  if (sectionsByHeader['Reviews and Merging']?.content !== '') {
    errors.push(
      'The "Reviews and Merging" section must be left empty, to be filled in automatically upon merge.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    title,
    body,
    sections,
    sectionsByHeader,
  };
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('lint_pr')
    .description(
      'Validate a commit message or PR markdown against Empo Health formatting standards.',
    )
    .argument('[file]', 'Path to commit message / markdown file (reads stdin if omitted)')
    .option('-s, --string <text>', 'Validate a raw string passed directly via CLI')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run lint_pr.ts message.txt
  $ git log -1 --pretty=%B | bun run lint_pr.ts
  $ bun run lint_pr.ts --string "feat: add user auth (RHL-1234)\n\nDetailed Description\n--------------------\n\nDescription\n\nRelevant Linear Tickets\n-----------------------\n\nThis change contributes to RHL-1234.\n\nReviews and Merging\n-------------------\n"
`,
    );

  program.parse();

  const [fileArg] = program.args;
  const opts = program.opts<{ string?: string }>();

  let content = '';

  if (opts.string) {
    content = opts.string;
  } else if (fileArg) {
    try {
      content = await Bun.file(fileArg).text();
    } catch (err: unknown) {
      console.error(
        `Error: Cannot read file '${fileArg}': ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  } else if (!process.stdin.isTTY) {
    content = await Bun.stdin.text();
  } else {
    program.help();
  }

  const result = validateCommitMessage(content);

  if (!result.valid) {
    printLintErrors(result.errors);
    process.exit(1);
  }

  console.log('✓ All PR formatting checks passed.');
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
