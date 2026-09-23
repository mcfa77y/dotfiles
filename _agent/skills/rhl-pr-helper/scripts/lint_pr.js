#!/usr/bin/env node

import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {Object} MarkdownSection
 * @property {string} header - Section heading title
 * @property {string} headerUnderline - Underline string for setext headers
 * @property {number} level - Heading level (1 or 2)
 * @property {'setext' | 'atx'} style - Heading style
 * @property {string} content - Markdown content belonging to the section
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - True if all formatting rules passed
 * @property {string[]} errors - List of error messages for failing rules
 * @property {string} title - The commit/PR title
 * @property {string} body - The commit/PR description body
 * @property {MarkdownSection[]} sections - Parsed top-level markdown sections
 * @property {Record<string, MarkdownSection>} sectionsByHeader - Sections mapped by header text
 */

/**
 * Parses markdown text into top-level sections bounded by level 1 or 2 headers.
 *
 * @param {string} content - Markdown body to parse
 * @returns {MarkdownSection[]} Array of parsed sections
 */
export function parseIntoSections(content) {
  const sections = [];

  // This pattern matches the start of the input, or a newline, but uses a lookbehind
  // so that it can match on a newline that's already been consumed by the regex
  const startOfLineBoundary = `(?<=^|\\n)`;

  // The patterns below will match setext headers like the following, with the
  // header content captured in a group:
  //   "Section A
  //    ========="
  //   "Section B
  //    ---------"
  const setextUnderlinePattern = "===+|---+";
  const setextHeaderPattern = `([^\\n]+)\\n(${setextUnderlinePattern})`;

  // The patterns below will match level 1 or level 2 ATX section headers like
  // the following, with the header content captured in a group. Note the support
  // for closing hash marks, which are in the official CommonMark specification:
  //   "# Section A"
  //   "## Section B"
  //   "# Section C #"
  const atxPrefixPattern = "#{1,2}";
  const atxHeaderPattern = `(${atxPrefixPattern})[ \\t]+([^\\n]+?)(?:[ \\t]+#+)?[ \\t]*`;

  // This pattern matches Markdown headers, either setext or ATX style, using
  // the above patterns:
  const headerPattern = `${startOfLineBoundary}(?:${setextHeaderPattern}|${atxHeaderPattern})`;

  // nextHeaderDelimiterPattern is the same pattern as headerPattern, but it replaces
  // all capturing groups with non-capturing groups
  const nextHeaderDelimiterPattern = headerPattern.replaceAll(/\((?!\?)/g, "(?:");

  // This pattern captures all of the content between two adjacent level 1 or level
  // 2 Markdown headers, either setext or ATX style, or between a level 1 or level
  // 2 Markdown header and the end of the input. The enclosing newlines are not
  // included in the captured group, and any headers following the captured content
  // are not consumed so that they may be consumed by another regex
  const sectionContentPattern = `(?:\\n(.*?)(?=(?:\\n?${nextHeaderDelimiterPattern})|$)|$)`;

  const sectionRegex = new RegExp(`${headerPattern}${sectionContentPattern}`, 'gs');

  for (const match of content.matchAll(sectionRegex)) {
    const style = match[1] !== undefined ? "setext" : "atx";
    const header = style === "setext" ? match[1] : match[4];
    const headerUnderline = style === "setext" ? match[2] : "";
    const level = style === "setext" ? (match[2].startsWith("=") ? 1 : 2) : match[3].length;
    const sectionContent = match[5];

    sections.push({
      header: header || "",
      headerUnderline: headerUnderline || "",
      level,
      style,
      content: sectionContent || ""
    });
  }

  return sections;
}

/**
 * Formats and prints an error message to stderr.
 *
 * @param {string} errorMessage
 */
function logError(errorMessage) {
  logError.count = (logError.count || 0) + 1;

  const lines = errorMessage.split("\n")
  console.error(`✗ ${lines[0] || "Unspecified error"}`)
  lines.slice(1).forEach(line => console.error(`    ${line}`))
  console.error()
}

/**
 * Validates a full commit message / PR text against Empo Health PR format rules.
 *
 * @param {string} commitMessage - The raw commit message (title + blank line + body)
 * @returns {ValidationResult} Result containing validation status, errors, and parsed sections
 */
export function validateCommitMessage(commitMessage) {
  const lines = commitMessage.split(/\r?\n/);

  const title = lines[0] || '';
  const body = lines.slice(1).join('\n');

  const errors = [];
  function recordError(errorMessage) {
    errors.push(errorMessage);
  }

  if (title.length > 72) {
    recordError('Title must not be longer than 72 characters');
  }

  if (body.at(0) !== '\n') {
    recordError('Body must start with a blank line');
  }

  const sections = parseIntoSections(body).filter((x) => x.level <= 2);
  const sectionsByHeader = sections.reduce((acc, x) => ({ ...acc, [x.header]: x }), {});

  const expectedSections = ['Detailed Description', 'Relevant Linear Tickets', 'Reviews and Merging'];
  const actualSections = sections.map((x) => x.header);
  if (JSON.stringify(actualSections) !== JSON.stringify(expectedSections)) {
    const missingSections = Array.from(new Set(expectedSections).difference(new Set(actualSections)));
    const extraSections = Array.from(new Set(actualSections).difference(new Set(expectedSections)));

    const messages = [
      missingSections.length > 0 ? `Missing sections: ${missingSections.join(', ')}` : '',
      extraSections.length > 0 ? `Extra sections: ${extraSections.join(', ')}` : '',
      missingSections.length <= 0 && extraSections.length <= 0 ? 'Sections out of order' : '',
    ].filter((x) => x !== '');

    recordError(`Body must contain only the expected sections\n${messages.join('\n')}`);
  }

  const levelOneHeaders = sections.filter((x) => x.level === 1).map((x) => x.header);
  if (levelOneHeaders.length > 0) {
    recordError(
      `There must be no level 1 headings; all section headings must be level 2+\nFailing sections: ${levelOneHeaders.join(', ')}`,
    );
  }

  const atxHeaders = sections.filter((x) => x.style === 'atx').map((x) => x.header);
  if (atxHeaders.length > 0) {
    recordError(`All section headings must use setext style, not ATX style\nFailing sections: ${atxHeaders.join(', ')}`);
  }

  const headersWithIncorrectUnderlineLength = sections
    .filter((x) => x.style === 'setext' && x.header.length !== x.headerUnderline.length)
    .map((x) => x.header);
  if (headersWithIncorrectUnderlineLength.length > 0) {
    recordError(
      `The underline for every section heading must match the length of the heading\nFailing sections: ${headersWithIncorrectUnderlineLength.join(', ')}`,
    );
  }

  const sectionsNotSurroundedByBlankLines = sections
    .filter((x) => x.header !== 'Reviews and Merging')
    .filter((x) => x.content.slice(0, 1) !== '\n' || x.content.slice(-1) !== '\n')
    .map((x) => x.header);
  if (sectionsNotSurroundedByBlankLines.length > 0) {
    recordError(
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
    recordError(
      'The "Relevant Linear Tickets" section must match the format: "This change contributes to [ticket IDs, separated by commas]."',
    );
  }

  if (sectionsByHeader['Reviews and Merging']?.content != '') {
    recordError('The "Reviews and Merging" section must be left empty, to be filled in automatically upon merge.');
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

async function main() {
  if (process.stdin.isTTY) {
    console.error('Error: No commit message was provided via stdin');
    return 1;
  }

  const commitMessage = await text(process.stdin);
  const result = validateCommitMessage(commitMessage);

  if (!result.valid) {
    console.error();
    for (const err of result.errors) {
      logError(err);
    }
    console.error();
    console.error(`Found ${result.errors.length} errors`);
    return 1;
  }

  console.log('All checks passed');
  return 0;
}

function runTests() {
  const tests = [
    {
      name: "Standard Setext level 2 headers with multi-paragraph content",
      input: `Detailed Description
--------------------

First paragraph of description.

Second paragraph of description.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`,
      expected: [
        {
          header: "Detailed Description",
          headerUnderline: "--------------------",
          level: 2,
          style: "setext",
          content: "\nFirst paragraph of description.\n\nSecond paragraph of description.\n"
        },
        {
          header: "Relevant Linear Tickets",
          headerUnderline: "-----------------------",
          level: 2,
          style: "setext",
          content: "\nThis change contributes to RHL-1234.\n"
        },
        {
          header: "Reviews and Merging",
          headerUnderline: "-------------------",
          level: 2,
          style: "setext",
          content: ""
        }
      ]
    },
    {
      name: "Setext level 1 and level 2 headers with varying underline lengths",
      input: `Level 1 Heading
===============

Content under level 1.

Level 2 Heading
---------------

Content under level 2.`,
      expected: [
        {
          header: "Level 1 Heading",
          headerUnderline: "===============",
          level: 1,
          style: "setext",
          content: "\nContent under level 1.\n"
        },
        {
          header: "Level 2 Heading",
          headerUnderline: "---------------",
          level: 2,
          style: "setext",
          content: "\nContent under level 2."
        }
      ]
    },
    {
      name: "ATX level 1 and level 2 headers",
      input: `# Level 1 ATX

Content under ATX level 1.

## Level 2 ATX

Content under ATX level 2.`,
      expected: [
        {
          header: "Level 1 ATX",
          headerUnderline: "",
          level: 1,
          style: "atx",
          content: "\nContent under ATX level 1.\n"
        },
        {
          header: "Level 2 ATX",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "\nContent under ATX level 2."
        }
      ]
    },
    {
      name: "ATX headers with trailing closing hashes and whitespace/tabs",
      input: `## Section with closing hashes ##

Content for section with closing hashes.

# Section with many closing hashes #######

Content for section with many hashes.

## Section with tabs and hashes \t ###

Content for section with tabs.`,
      expected: [
        {
          header: "Section with closing hashes",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "\nContent for section with closing hashes.\n"
        },
        {
          header: "Section with many closing hashes",
          headerUnderline: "",
          level: 1,
          style: "atx",
          content: "\nContent for section with many hashes.\n"
        },
        {
          header: "Section with tabs and hashes",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "\nContent for section with tabs."
        }
      ]
    },
    {
      name: "Mixed Setext and ATX headers in a single document",
      input: `Detailed Description
--------------------

Setext level 2 content.

# Overview Note

ATX level 1 note.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-5678.

## Merging Instructions ##

ATX level 2 content with hashes.`,
      expected: [
        {
          header: "Detailed Description",
          headerUnderline: "--------------------",
          level: 2,
          style: "setext",
          content: "\nSetext level 2 content.\n"
        },
        {
          header: "Overview Note",
          headerUnderline: "",
          level: 1,
          style: "atx",
          content: "\nATX level 1 note.\n"
        },
        {
          header: "Relevant Linear Tickets",
          headerUnderline: "-----------------------",
          level: 2,
          style: "setext",
          content: "\nThis change contributes to RHL-5678.\n"
        },
        {
          header: "Merging Instructions",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "\nATX level 2 content with hashes."
        }
      ]
    },
    {
      name: "Sections with no content and adjacent headers without blank lines",
      input: `Empty Section 1
---------------
Empty Section 2
---------------
## Empty ATX Section
Content after adjacent headers.`,
      expected: [
        {
          header: "Empty Section 1",
          headerUnderline: "---------------",
          level: 2,
          style: "setext",
          content: ""
        },
        {
          header: "Empty Section 2",
          headerUnderline: "---------------",
          level: 2,
          style: "setext",
          content: ""
        },
        {
          header: "Empty ATX Section",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "Content after adjacent headers."
        }
      ]
    },
    {
      name: "Empty sections with only one blank line between headers",
      input: `Empty Section 1
---------------

Empty Section 2
---------------

## Empty Section 3
`,
      expected: [
        {
          header: "Empty Section 1",
          headerUnderline: "---------------",
          level: 2,
          style: "setext",
          content: ""
        },
        {
          header: "Empty Section 2",
          headerUnderline: "---------------",
          level: 2,
          style: "setext",
          content: ""
        },
        {
          header: "Empty Section 3",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: ""
        }
      ]
    },
    {
      name: "Content containing code blocks, lists, and HTML comments between sections",
      input: `Detailed Description
--------------------

Here is a list:
- Item 1
- Item 2

\`\`\`bash
echo "code block"
\`\`\`

Relevant Linear Tickets
-----------------------

This change contributes to RHL-100, RHL-200.

Reviews and Merging
-------------------

<!-- HTML comment inside section -->`,
      expected: [
        {
          header: "Detailed Description",
          headerUnderline: "--------------------",
          level: 2,
          style: "setext",
          content: "\nHere is a list:\n- Item 1\n- Item 2\n\n```bash\necho \"code block\"\n```\n"
        },
        {
          header: "Relevant Linear Tickets",
          headerUnderline: "-----------------------",
          level: 2,
          style: "setext",
          content: "\nThis change contributes to RHL-100, RHL-200.\n"
        },
        {
          header: "Reviews and Merging",
          headerUnderline: "-------------------",
          level: 2,
          style: "setext",
          content: "\n<!-- HTML comment inside section -->"
        }
      ]
    },
    {
      name: "Content without preceding or following blank lines",
      input: `No Preceding Blank Line
-----------------------
Content immediately following header.

No Following Blank Line
-----------------------

Content without trailing blank line before next header.
## Neither Preceding Nor Following
Content without any surrounding blank lines.
## Final Section`,
      expected: [
        {
          header: "No Preceding Blank Line",
          headerUnderline: "-----------------------",
          level: 2,
          style: "setext",
          content: "Content immediately following header.\n"
        },
        {
          header: "No Following Blank Line",
          headerUnderline: "-----------------------",
          level: 2,
          style: "setext",
          content: "\nContent without trailing blank line before next header."
        },
        {
          header: "Neither Preceding Nor Following",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: "Content without any surrounding blank lines."
        },
        {
          header: "Final Section",
          headerUnderline: "",
          level: 2,
          style: "atx",
          content: ""
        }
      ]
    }
  ];

  let failureCount = 0;

  for (const { name, input, expected } of tests) {
    const actual = parseIntoSections(input);
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);

    if (actualJson !== expectedJson) {
      console.error(`✗ Test failed: ${name}`);
      console.error(`  Expected:\n${JSON.stringify(expected, null, 2)}`);
      console.error(`  Actual:\n${JSON.stringify(actual, null, 2)}`);
      console.error();
      failureCount++;
    } else {
      console.log(`✓ ${name}`);
    }
  }

  if (failureCount > 0) {
    console.error(`\n${failureCount} tests failed`);
    return 1;
  }

  console.log(`\nAll ${tests.length} tests passed`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "test") {
    process.exitCode = runTests();
  } else {
    process.exitCode = (await main()) || 0;
  }
}
