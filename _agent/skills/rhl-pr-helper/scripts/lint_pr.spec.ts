import { describe, expect, it } from 'bun:test';
import { parseIntoSections, validateCommitMessage } from './lint_pr.ts';

describe('lint_pr', () => {
  describe('parseIntoSections', () => {
    it('parses standard Setext level 2 headers with multi-paragraph content', () => {
      const input = `Detailed Description
--------------------

First paragraph description.

Second paragraph description.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------`;

      const sections = parseIntoSections(input);
      expect(sections).toEqual([
        {
          header: 'Detailed Description',
          headerUnderline: '--------------------',
          level: 2,
          style: 'setext',
          content: '\nFirst paragraph description.\n\nSecond paragraph description.\n',
        },
        {
          header: 'Relevant Linear Tickets',
          headerUnderline: '-----------------------',
          level: 2,
          style: 'setext',
          content: '\nThis change contributes to RHL-1234.\n',
        },
        {
          header: 'Reviews and Merging',
          headerUnderline: '-------------------',
          level: 2,
          style: 'setext',
          content: '',
        },
      ]);
    });

    it('parses ATX level 1 and 2 headers', () => {
      const input = `## Section A

Content A.

# Section B

Content B.`;

      const sections = parseIntoSections(input);
      expect(sections).toEqual([
        {
          header: 'Section A',
          headerUnderline: '',
          level: 2,
          style: 'atx',
          content: '\nContent A.\n',
        },
        {
          header: 'Section B',
          headerUnderline: '',
          level: 1,
          style: 'atx',
          content: '\nContent B.',
        },
      ]);
    });
  });

  describe('validateCommitMessage', () => {
    it('passes for a valid commit message', () => {
      const validMsg = `feat: add awesome feature (RHL-4460)

Detailed Description
--------------------

### Problem
Something was broken.

### Solution
Fixed it.

### Verification
Tests pass.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-4460.

Reviews and Merging
-------------------
`;

      const result = validateCommitMessage(validMsg);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when title exceeds 72 characters', () => {
      const longTitle =
        'feat: this title is deliberately made to be way way too long to pass the seventy-two character limit check';
      const msg = `${longTitle}

Detailed Description
--------------------

Description here.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`;

      const result = validateCommitMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('72 characters'))).toBe(true);
    });

    it('fails when body does not start with a blank line', () => {
      const msg = `feat: valid title (RHL-1234)
Detailed Description
--------------------

Description here.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`;

      const result = validateCommitMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('blank line'))).toBe(true);
    });

    it('fails when setext underline does not match header length', () => {
      const msg = `feat: valid title (RHL-1234)

Detailed Description
----------------------

Description here.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`;

      const result = validateCommitMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('underline for every section'))).toBe(true);
    });

    it('fails when Relevant Linear Tickets has invalid syntax', () => {
      const msg = `feat: valid title (RHL-1234)

Detailed Description
--------------------

Description here.

Relevant Linear Tickets
-----------------------

RHL-1234.

Reviews and Merging
-------------------
`;

      const result = validateCommitMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('This change contributes to'))).toBe(true);
    });

    it('fails when Reviews and Merging contains text', () => {
      const msg = `feat: valid title (RHL-1234)

Detailed Description
--------------------

Description here.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------

Some review text that should not be here.
`;

      const result = validateCommitMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Reviews and Merging'))).toBe(true);
    });
  });
});
