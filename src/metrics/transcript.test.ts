/**
 * Tests for Claude Code transcript JSONL parser and pricing.ts module.
 *
 * Uses temp files with real-format JSONL data. No mocks.
 * Philosophy: "never mock what you can use for real" (mx-252b16).
 *
 * Coverage:
 *   - parseTranscriptUsage (transcript.ts)
 *   - estimateCost (pricing.ts, imported directly)
 *   - getPricingForModel (pricing.ts)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempDir } from "../test-helpers.ts";
import { getPricingForModel, estimateCost } from "./pricing.ts";
import { parseTranscriptUsage } from "./transcript.ts";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "overstory-transcript-test-"));
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

/** Write a JSONL file with the given lines. */
async function writeJsonl(filename: string, lines: unknown[]): Promise<string> {
	const path = join(tempDir, filename);
	const content = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
	await Bun.write(path, content);
	return path;
}

// === parseTranscriptUsage ===

describe("parseTranscriptUsage", () => {
	test("parses a single assistant entry with all usage fields", async () => {
		const path = await writeJsonl("single.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 1000,
						cache_creation_input_tokens: 500,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(1000);
		expect(usage.cacheCreationTokens).toBe(500);
		expect(usage.modelUsed).toBe("claude-opus-4-6");
	});

	test("aggregates usage across multiple assistant turns", async () => {
		const path = await writeJsonl("multi.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 1000,
						cache_creation_input_tokens: 500,
					},
				},
			},
			{
				type: "human",
				message: { content: "follow-up question" },
			},
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 200,
						output_tokens: 75,
						cache_read_input_tokens: 2000,
						cache_creation_input_tokens: 0,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(300);
		expect(usage.outputTokens).toBe(125);
		expect(usage.cacheReadTokens).toBe(3000);
		expect(usage.cacheCreationTokens).toBe(500);
		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
	});

	test("skips non-assistant entries (human, system, tool_use, etc.)", async () => {
		const path = await writeJsonl("mixed.jsonl", [
			{ type: "system", content: "system prompt" },
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
			{ type: "human", message: { content: "hello" } },
			{ type: "tool_result", content: "result" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
	});

	test("returns zeros for empty file", async () => {
		const path = join(tempDir, "empty.jsonl");
		await Bun.write(path, "");

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.cacheReadTokens).toBe(0);
		expect(usage.cacheCreationTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("returns zeros for file with no assistant entries", async () => {
		const path = await writeJsonl("no-assistant.jsonl", [
			{ type: "human", message: { content: "hello" } },
			{ type: "system", content: "system prompt" },
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("gracefully handles malformed JSON lines", async () => {
		const path = join(tempDir, "malformed.jsonl");
		const content = [
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}',
			"this is not valid json",
			"",
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":200,"output_tokens":75,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}',
		].join("\n");
		await Bun.write(path, content);

		const usage = await parseTranscriptUsage(path);

		// Should parse the two valid assistant entries, skip the malformed line
		expect(usage.inputTokens).toBe(300);
		expect(usage.outputTokens).toBe(125);
	});

	test("handles assistant entries with missing usage fields (defaults to 0)", async () => {
		const path = await writeJsonl("partial.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-haiku-3-5-20241022",
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						// No cache fields
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(50);
		expect(usage.cacheReadTokens).toBe(0);
		expect(usage.cacheCreationTokens).toBe(0);
	});

	test("handles assistant entries with no usage object", async () => {
		const path = await writeJsonl("no-usage.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					content: "response without usage",
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(0);
		expect(usage.outputTokens).toBe(0);
		expect(usage.modelUsed).toBeNull();
	});

	test("captures model from first assistant turn only", async () => {
		const path = await writeJsonl("model-change.jsonl", [
			{
				type: "assistant",
				message: {
					model: "claude-sonnet-4-20250514",
					usage: {
						input_tokens: 10,
						output_tokens: 5,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
			{
				type: "assistant",
				message: {
					model: "claude-opus-4-6",
					usage: {
						input_tokens: 20,
						output_tokens: 10,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			},
		]);

		const usage = await parseTranscriptUsage(path);

		expect(usage.modelUsed).toBe("claude-sonnet-4-20250514");
		expect(usage.inputTokens).toBe(30);
	});

	test("handles real-world transcript format with trailing newlines", async () => {
		const path = join(tempDir, "trailing.jsonl");
		const content =
			'{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":3,"output_tokens":9,"cache_read_input_tokens":19401,"cache_creation_input_tokens":9918}}}\n\n\n';
		await Bun.write(path, content);

		const usage = await parseTranscriptUsage(path);

		expect(usage.inputTokens).toBe(3);
		expect(usage.outputTokens).toBe(9);
		expect(usage.cacheReadTokens).toBe(19401);
		expect(usage.cacheCreationTokens).toBe(9918);
	});
});

// === estimateCost ===

describe("estimateCost", () => {
	test("calculates cost for opus model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-opus-4-6",
		});

		// opus: input=$15, output=$75, cacheRead=$1.50, cacheCreation=$3.75
		expect(cost).toBeCloseTo(95.25, 2);
	});

	test("calculates cost for sonnet model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-sonnet-4-20250514",
		});

		// sonnet: input=$3, output=$15, cacheRead=$0.30, cacheCreation=$0.75
		expect(cost).toBeCloseTo(19.05, 2);
	});

	test("calculates cost for haiku model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "claude-haiku-3-5-20241022",
		});

		// haiku: input=$0.80, output=$4, cacheRead=$0.08, cacheCreation=$0.20
		expect(cost).toBeCloseTo(5.08, 2);
	});

	test("returns null for unknown model", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: "unknown-model-xyz",
		});

		expect(cost).toBeNull();
	});

	test("calculates cost for gpt-4o", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "gpt-4o",
		});

		// gpt-4o: input=2.5, output=10, cacheRead=1.25, cacheCreation=2.5 => total=16.25
		expect(cost).toBeCloseTo(16.25, 2);
	});

	test("calculates cost for gemini flash", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 1_000_000,
			cacheCreationTokens: 1_000_000,
			modelUsed: "gemini-2.5-flash",
		});

		// gemini-flash: input=0.1, output=0.4, cacheRead=0.025, cacheCreation=0.1 => total=0.625
		expect(cost).toBeCloseTo(0.625, 3);
	});

	test("returns null when modelUsed is null", () => {
		const cost = estimateCost({
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: null,
		});

		expect(cost).toBeNull();
	});

	test("zero tokens yields zero cost", () => {
		const cost = estimateCost({
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			modelUsed: "claude-opus-4-6",
		});

		expect(cost).toBe(0);
	});

	test("realistic session cost calculation", () => {
		// A typical agent session: ~20K input, ~5K output, heavy cache reads
		const cost = estimateCost({
			inputTokens: 20_000,
			outputTokens: 5_000,
			cacheReadTokens: 100_000,
			cacheCreationTokens: 15_000,
			modelUsed: "claude-sonnet-4-20250514",
		});

		// sonnet: (20K/1M)*3 + (5K/1M)*15 + (100K/1M)*0.30 + (15K/1M)*0.75
		// = 0.06 + 0.075 + 0.03 + 0.01125 = $0.17625
		expect(cost).not.toBeNull();
		if (cost !== null) {
			expect(cost).toBeGreaterThan(0.1);
			expect(cost).toBeLessThan(1.0);
		}
	});
});

// === getPricingForModel (pricing.ts) ===

describe("getPricingForModel", () => {
	test("matches opus substring", () => {
		const pricing = getPricingForModel("claude-opus-4-6");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(15);
			expect(pricing.outputPerMTok).toBe(75);
		}
	});

	test("matches sonnet substring", () => {
		const pricing = getPricingForModel("claude-sonnet-4-20250514");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(3);
			expect(pricing.outputPerMTok).toBe(15);
		}
	});

	test("matches haiku substring", () => {
		const pricing = getPricingForModel("claude-haiku-3-5-20241022");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(0.8);
			expect(pricing.outputPerMTok).toBe(4);
		}
	});

	test("returns null for unknown model", () => {
		const pricing = getPricingForModel("unknown-model-xyz");
		expect(pricing).toBeNull();
	});

	test("matches gpt-4o", () => {
		const pricing = getPricingForModel("gpt-4o");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(2.5);
		}
	});

	test("matches gpt-4o-mini", () => {
		const pricing = getPricingForModel("gpt-4o-mini");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(0.15);
		}
	});

	test("matches gpt-5", () => {
		const pricing = getPricingForModel("gpt-5");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(10);
		}
	});

	test("matches o1", () => {
		const pricing = getPricingForModel("o1");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(15);
		}
	});

	test("matches o3", () => {
		const pricing = getPricingForModel("o3");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(10);
		}
	});

	test("matches gemini flash", () => {
		const pricing = getPricingForModel("gemini-2.5-flash");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(0.1);
		}
	});

	test("matches gemini pro", () => {
		const pricing = getPricingForModel("gemini-2.5-pro");
		expect(pricing).not.toBeNull();
		if (pricing !== null) {
			expect(pricing.inputPerMTok).toBe(1.25);
		}
	});
});

// estimateCost re-export removed from transcript.ts (overstory-aa00).
// estimateCost is now imported directly from pricing.ts everywhere.
