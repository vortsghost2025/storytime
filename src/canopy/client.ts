/**
 * Canopy CLI client.
 *
 * Wraps the `cn` command-line tool for prompt management operations.
 * All methods use Bun.spawn to invoke the CLI directly.
 */

import { AgentError } from "../errors.ts";
import type {
	CanopyListResult,
	CanopyRenderResult,
	CanopyShowResult,
	CanopyValidateResult,
} from "../types.ts";

export interface CanopyClient {
	/** Render a prompt, resolving inheritance. */
	render(name: string, options?: { format?: "md" | "json" }): Promise<CanopyRenderResult>;

	/** Validate a prompt (or all prompts) against its schema. */
	validate(name?: string, options?: { all?: boolean }): Promise<CanopyValidateResult>;

	/** List all prompts. */
	list(options?: {
		tag?: string;
		status?: string;
		extends?: string;
		mixin?: string;
	}): Promise<CanopyListResult>;

	/** Show a prompt record. */
	show(name: string): Promise<CanopyShowResult>;
}

/**
 * Run a shell command and capture its output.
 */
async function runCommand(
	cmd: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

/**
 * Create a CanopyClient bound to the given working directory.
 *
 * @param cwd - Working directory where cn commands should run
 * @returns A CanopyClient instance wrapping the cn CLI
 */
export function createCanopyClient(cwd: string): CanopyClient {
	async function runCanopy(
		args: string[],
		context: string,
	): Promise<{ stdout: string; stderr: string }> {
		const { stdout, stderr, exitCode } = await runCommand(["cn", ...args], cwd);
		if (exitCode !== 0) {
			throw new AgentError(`canopy ${context} failed (exit ${exitCode}): ${stderr.trim()}`);
		}
		return { stdout, stderr };
	}

	return {
		async render(name, _options) {
			// Always use --json for structured output; format param reserved for future use
			const { stdout } = await runCanopy(["render", name, "--json"], `render ${name}`);
			const trimmed = stdout.trim();
			try {
				const raw = JSON.parse(trimmed) as {
					success: boolean;
					name: string;
					version: number;
					sections: Array<{ name: string; body: string }>;
				};
				return {
					success: raw.success,
					name: raw.name,
					version: raw.version,
					sections: raw.sections,
				};
			} catch {
				throw new AgentError(
					`Failed to parse JSON from cn render ${name}: ${trimmed.slice(0, 200)}`,
				);
			}
		},

		async validate(name, options) {
			const args = ["validate"];
			if (options?.all) {
				args.push("--all");
			} else if (name) {
				args.push(name);
			}
			// cn validate does not support --json; parse exit code and stdout/stderr
			const { stdout, stderr, exitCode } = await runCommand(["cn", ...args], cwd);
			const output = (stdout + stderr).trim();
			const errors: string[] = [];
			if (exitCode !== 0) {
				// Extract error lines from output (lines containing "error:")
				for (const line of output.split("\n")) {
					const trimmedLine = line.trim();
					if (trimmedLine.includes("error:")) {
						errors.push(trimmedLine);
					}
				}
				if (errors.length === 0 && output) {
					errors.push(output);
				}
			}
			return { success: exitCode === 0, errors };
		},

		async list(options) {
			const args = ["list", "--json"];
			if (options?.tag) {
				args.push("--tag", options.tag);
			}
			if (options?.status) {
				args.push("--status", options.status);
			}
			if (options?.extends) {
				args.push("--extends", options.extends);
			}
			if (options?.mixin) {
				args.push("--mixin", options.mixin);
			}
			const { stdout } = await runCanopy(args, "list");
			const trimmed = stdout.trim();
			try {
				const raw = JSON.parse(trimmed) as {
					success: boolean;
					prompts: Array<{
						id: string;
						name: string;
						version: number;
						sections: Array<{ name: string; body: string }>;
					}>;
				};
				return {
					success: raw.success,
					prompts: raw.prompts,
				};
			} catch {
				throw new AgentError(`Failed to parse JSON from cn list: ${trimmed.slice(0, 200)}`);
			}
		},

		async show(name) {
			const { stdout } = await runCanopy(["show", name, "--json"], `show ${name}`);
			const trimmed = stdout.trim();
			try {
				const raw = JSON.parse(trimmed) as {
					success: boolean;
					prompt: {
						id: string;
						name: string;
						version: number;
						sections: Array<{ name: string; body: string }>;
					};
				};
				return {
					success: raw.success,
					prompt: raw.prompt,
				};
			} catch {
				throw new AgentError(`Failed to parse JSON from cn show ${name}: ${trimmed.slice(0, 200)}`);
			}
		},
	};
}
