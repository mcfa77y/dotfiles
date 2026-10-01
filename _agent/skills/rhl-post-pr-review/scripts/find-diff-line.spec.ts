import { describe, expect, it } from "bun:test"
import { parsePatch, searchHunkLines, parsePrTarget } from "./find-diff-line"

describe("find-diff-line", () => {
	describe("parsePrTarget", () => {
		it("parses numeric PR string", () => {
			const res = parsePrTarget("2718")
			expect(res.prNumber).toBe(2718)
			expect(res.repo).toBeNull()
		})

		it("parses full GitHub PR URL", () => {
			const res = parsePrTarget("https://github.com/EmpoHealth/core/pull/2718")
			expect(res.prNumber).toBe(2718)
			expect(res.repo).toBe("EmpoHealth/core")
		})

		it("parses repo#number target", () => {
			const res = parsePrTarget("EmpoHealth/core#2718")
			expect(res.prNumber).toBe(2718)
			expect(res.repo).toBe("EmpoHealth/core")
		})

		it("throws on invalid target", () => {
			expect(() => parsePrTarget("invalid-pr-spec")).toThrow()
		})
	})

	describe("parsePatch", () => {
		it("correctly maps right and left lines across mixed additions and deletions", () => {
			const samplePatch = `@@ -10,4 +15,5 @@
 context before
-old line
+new line 1
+new line 2
 context after`

			const lines = parsePatch(samplePatch)
			expect(lines).toHaveLength(5)

			// Line 0: context before
			expect(lines[0]).toEqual({
				leftLine: 10,
				rightLine: 15,
				type: "context",
				content: "context before",
			})

			// Line 1: deleted old line
			expect(lines[1]).toEqual({
				leftLine: 11,
				rightLine: null,
				type: "deleted",
				content: "old line",
			})

			// Line 2: added new line 1
			expect(lines[2]).toEqual({
				leftLine: null,
				rightLine: 16,
				type: "added",
				content: "new line 1",
			})

			// Line 3: added new line 2
			expect(lines[3]).toEqual({
				leftLine: null,
				rightLine: 17,
				type: "added",
				content: "new line 2",
			})

			// Line 4: context after
			expect(lines[4]).toEqual({
				leftLine: 12,
				rightLine: 18,
				type: "context",
				content: "context after",
			})
		})
	})

	describe("searchHunkLines", () => {
		const samplePatch = `@@ -100,3 +200,4 @@
 common code
-removed code
+added code
+second added code`

		const lines = parsePatch(samplePatch)

		it("finds pattern on RIGHT side", () => {
			const matches = searchHunkLines("test.ts", lines, "second added", "RIGHT")
			expect(matches).toHaveLength(1)
			expect(matches[0].line).toBe(202)
			expect(matches[0].type).toBe("added")
		})

		it("finds pattern on LEFT side for deletions", () => {
			const matches = searchHunkLines("test.ts", lines, "removed code", "LEFT")
			expect(matches).toHaveLength(1)
			expect(matches[0].line).toBe(101)
			expect(matches[0].type).toBe("deleted")
		})

		it("supports regex pattern search", () => {
			const matches = searchHunkLines("test.ts", lines, /added code$/, "RIGHT")
			expect(matches).toHaveLength(2)
			expect(matches.map((m) => m.line)).toEqual([201, 202])
		})
	})
})
