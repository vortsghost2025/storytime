/**
 * Parser for Claude Code transcript JSONL files.
 *
 * This is a Claude Code-specific JSONL parser that extracts token usage data
 * from assistant-type entries in transcript files at
 * the runtime-specific transcript directory (e.g. ~/.claude/projects/ for Claude Code).
 *
 * Runtime-agnostic pricing logic lives in ./pricing.ts. Other runtimes
 * implement their own transcript parsing via AgentRuntime.parseTranscript().
 *
 * Each assistant entry contains per-turn usage:
 * {
 *   "type": "assistant",
 *   "message": {
 *     "model": "claude-opus-4-6",
 *     "usage": {
 *       "input_tokens": 3,
 *       "output_tokens": 9,
 *       "cache_read_input_tokens": 19401,
 *       "cache_creation_input_tokens": 9918
 *     }
 *   }
 * }
 */

import type { TokenUsage } from "./pricing.ts";

export type TranscriptUsage = TokenUsage;

/**
 * Narrow an unknown value to determine if it looks like a transcript assistant entry.
 * Returns the usage fields if valid, or null otherwise.
 */
function extractUsageFromEntry(entry: unknown): {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	model: string | undefined;
} | null {
	if (typeof entry !== "object" || entry === null) return null;

	const obj = entry as Record<string, unknown>;
	if (obj.type !== "assistant") return null;

	const message = obj.message;
	if (typeof message !== "object" || message === null) return null;

	const msg = message as Record<string, unknown>;
	const usage = msg.usage;
	if (typeof usage !== "object" || usage === null) return null;

	const u = usage as Record<string, unknown>;

	return {
		inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
		outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
		cacheReadTokens: typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : 0,
		cacheCreationTokens:
			typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : 0,
		model: typeof msg.model === "string" ? msg.model : undefined,
	};
}

/**
 * Parse a Claude Code transcript JSONL file and aggregate token usage.
 *
 * Reads the file line by line, extracting usage data from each assistant
 * entry. Returns aggregated totals and the model from the first assistant turn.
 *
 * @param transcriptPath - Absolute path to the transcript JSONL file
 * @returns Aggregated usage data across all assistant turns
 */
export async function parseTranscriptUsage(transcriptPath: string): Promise<TranscriptUsage> {
	const file = Bun.file(transcriptPath);
	const text = await file.text();
	const lines = text.split("\n");

	const result: TranscriptUsage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		modelUsed: null,
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			// Skip malformed lines
			continue;
		}

		const usage = extractUsageFromEntry(parsed);
		if (usage === null) continue;

		result.inputTokens += usage.inputTokens;
		result.outputTokens += usage.outputTokens;
		result.cacheReadTokens += usage.cacheReadTokens;
		result.cacheCreationTokens += usage.cacheCreationTokens;

		// Capture model from first assistant turn
		if (result.modelUsed === null && usage.model !== undefined) {
			result.modelUsed = usage.model;
		}
	}

	return result;
}
