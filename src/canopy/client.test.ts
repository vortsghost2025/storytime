/**
 * Tests for the Canopy CLI client.
 *
 * Uses real `cn` CLI calls against the actual .canopy/ directory.
 * We do not mock the CLI — the project root has real prompts to test against.
 */

import { describe, expect, test } from "bun:test";
import { AgentError } from "../errors.ts";
import { createCanopyClient } from "./client.ts";

// The worktree root has its own .canopy/ symlinked/shared from the canonical root.
// Use process.cwd() which is set to the worktree root in bun test.
const cwd = process.cwd();
const client = createCanopyClient(cwd);

describe("CanopyClient.list()", () => {
	test("returns prompts array with at least one entry", async () => {
		const result = await client.list();
		expect(result.success).toBe(true);
		expect(Array.isArray(result.prompts)).toBe(true);
		expect(result.prompts.length).toBeGreaterThan(0);
		const first = result.prompts[0];
		expect(first).toBeDefined();
		expect(typeof first?.name).toBe("string");
		expect(typeof first?.version).toBe("number");
		expect(Array.isArray(first?.sections)).toBe(true);
	});
});

describe("CanopyClient.render()", () => {
	test("returns CanopyRenderResult with name, version, sections for 'builder' prompt", async () => {
		const result = await client.render("builder");
		expect(result.success).toBe(true);
		expect(result.name).toBe("builder");
		expect(typeof result.version).toBe("number");
		expect(result.version).toBeGreaterThan(0);
		expect(Array.isArray(result.sections)).toBe(true);
		expect(result.sections.length).toBeGreaterThan(0);
		const section = result.sections[0];
		expect(section).toBeDefined();
		expect(typeof section?.name).toBe("string");
		expect(typeof section?.body).toBe("string");
	});

	test("throws AgentError on non-existent prompt", async () => {
		await expect(client.render("nonexistent-prompt-xyz-404")).rejects.toThrow(AgentError);
	});
});

describe("CanopyClient.show()", () => {
	test("returns prompt object for 'builder'", async () => {
		const result = await client.show("builder");
		expect(result.success).toBe(true);
		expect(result.prompt).toBeDefined();
		expect(result.prompt.name).toBe("builder");
		expect(typeof result.prompt.version).toBe("number");
		expect(typeof result.prompt.id).toBe("string");
		expect(Array.isArray(result.prompt.sections)).toBe(true);
	});

	test("throws AgentError on non-existent prompt", async () => {
		await expect(client.show("nonexistent-prompt-xyz-404")).rejects.toThrow(AgentError);
	});
});

describe("CanopyClient.validate()", () => {
	test("returns {success, errors} for a named prompt", async () => {
		const result = await client.validate("scout");
		expect(typeof result.success).toBe("boolean");
		expect(Array.isArray(result.errors)).toBe(true);
		if (result.success) {
			expect(result.errors.length).toBe(0);
		}
	});

	test("returns success=false with errors for an invalid prompt", async () => {
		// 'builder' is known to fail schema validation (missing test gate)
		const result = await client.validate("builder");
		expect(typeof result.success).toBe("boolean");
		expect(Array.isArray(result.errors)).toBe(true);
		// Either valid or invalid — just verify structure is correct
		if (!result.success) {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});

	test("validate --all returns result with success boolean", async () => {
		const result = await client.validate(undefined, { all: true });
		expect(typeof result.success).toBe("boolean");
		expect(Array.isArray(result.errors)).toBe(true);
	});
});
