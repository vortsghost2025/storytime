/**
 * GPU metrics collection for overstory.
 *
 * Uses nvidia-smi to query GPU utilization, memory, and temperature.
 * Provides real-time metrics for dashboard and status commands.
 */

import { spawn } from "bun";

export interface GpuMetrics {
	device: string;
	utilization: number; // 0-100%
	memoryUsed: number; // MB
	memoryFree: number; // MB
	memoryTotal: number; // MB
	temperature: number; // Celsius
	powerDraw: number; // Watts
	powerLimit: number; // Watts
	computeCapability: string;
	cudaVersion: string;
}

export interface GpuProcess {
	pid: number;
	name: string;
	memoryUsed: number; // MB
	type: "G" | "C"; // Graphics or Compute
}

/**
 * Check if nvidia-smi is available.
 */
export async function isGpuAvailable(): Promise<boolean> {
	try {
		const proc = spawn({
			cmd: ["nvidia-smi", "--version"],
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Get GPU device metrics.
 */
export async function getGpuMetrics(): Promise<GpuMetrics | null> {
	if (!(await isGpuAvailable())) {
		return null;
	}

	try {
		const proc = spawn({
			cmd: [
				"nvidia-smi",
				"--query-gpu=name,utilization.gpu,memory.used,memory.free,memory.total,temperature.gpu,power.draw,power.limit,compute_cap",
				"--format=csv,noheader,nounits",
			],
			stdout: "pipe",
			stderr: "pipe",
		});

		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0 || !stdout.trim()) {
			return null;
		}

		const parts = stdout
			.trim()
			.split(",")
			.map((s) => s.trim());
		if (parts.length < 9) {
			return null;
		}

		const cudaVersion = await getCudaVersion();

		return {
			device: parts[0] || "Unknown",
			utilization: Number.parseInt(parts[1] || "0", 10),
			memoryUsed: Number.parseInt(parts[2] || "0", 10),
			memoryFree: Number.parseInt(parts[3] || "0", 10),
			memoryTotal: Number.parseInt(parts[4] || "0", 10),
			temperature: Number.parseInt(parts[5] || "0", 10),
			powerDraw: Number.parseFloat(parts[6] || "0"),
			powerLimit: Number.parseFloat(parts[7] || "0"),
			computeCapability: parts[8] || "Unknown",
			cudaVersion,
		};
	} catch {
		return null;
	}
}

/**
 * Get processes using GPU.
 */
export async function getGpuProcesses(): Promise<GpuProcess[]> {
	if (!(await isGpuAvailable())) {
		return [];
	}

	try {
		const proc = spawn({
			cmd: [
				"nvidia-smi",
				"--query-compute-apps=pid,process_name,used_memory",
				"--format=csv,noheader,nounits",
			],
			stdout: "pipe",
			stderr: "pipe",
		});

		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0 || !stdout.trim()) {
			return [];
		}

		const lines = stdout.trim().split("\n");
		return lines.map((line) => {
			const parts = line.split(",").map((s) => s.trim());
			return {
				pid: Number.parseInt(parts[0] || "0", 10),
				name: parts[1] || "Unknown",
				memoryUsed: Number.parseInt(parts[2] || "0", 10),
				type: "C" as const, // Compute type
			};
		});
	} catch {
		return [];
	}
}

/**
 * Get CUDA version from nvcc.
 */
async function getCudaVersion(): Promise<string> {
	try {
		const proc = spawn({
			cmd: ["nvcc", "--version"],
			stdout: "pipe",
			stderr: "pipe",
		});

		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			return "Unknown";
		}

		const match = stdout.match(/release (\d+\.\d+)/);
		return match?.[1] || "Unknown";
	} catch {
		return "Unknown";
	}
}

/**
 * Format GPU metrics for display.
 */
export function formatGpuMetrics(metrics: GpuMetrics): string {
	const utilColor =
		metrics.utilization > 80 ? "\x1b[31m" : metrics.utilization > 50 ? "\x1b[33m" : "\x1b[32m";
	const memUsedPercent = (metrics.memoryUsed / metrics.memoryTotal) * 100;
	const memColor = memUsedPercent > 80 ? "\x1b[31m" : memUsedPercent > 50 ? "\x1b[33m" : "\x1b[32m";

	return [
		`${"\x1b[1m"}GPU: ${metrics.device}${"\x1b[0m"}`,
		`  Utilization: ${utilColor}${metrics.utilization}%${"\x1b[0m"}`,
		`  Memory: ${memColor}${metrics.memoryUsed}/${metrics.memoryTotal} MB (${memUsedPercent.toFixed(1)}%)${"\x1b[0m"}`,
		`  Temperature: ${metrics.temperature}°C`,
		`  Power: ${metrics.powerDraw.toFixed(0)}/${metrics.powerLimit.toFixed(0)} W`,
		`  Compute: ${metrics.computeCapability} (CUDA ${metrics.cudaVersion})`,
	].join("\n");
}

/**
 * Check if CUDA benchmark executables exist.
 */
export async function findCudaBenchmarks(): Promise<string[]> {
	const benchmarks: string[] = [];
	const searchPaths = [
		"S:/snac-v2/kimi-shared/benchmarks",
		"S:/snac-v2/kimi-shared/kernels",
		"S:/snac-v2/we/src",
	];

	for (const searchPath of searchPaths) {
		try {
			const fs = await import("node:fs/promises");
			const files = await fs.readdir(searchPath);

			for (const file of files) {
				if (
					file.endsWith(".exe") &&
					(file.includes("benchmark") || file.includes("kernel") || file.includes("device"))
				) {
					benchmarks.push(`${searchPath}/${file}`);
				}
			}
		} catch {
			// Path doesn't exist, continue
		}
	}

	return benchmarks;
}

/**
 * Run a CUDA benchmark and return results.
 */
export async function runCudaBenchmark(
	benchmarkPath: string,
): Promise<{ path: string; output: string; success: boolean }> {
	try {
		const proc = spawn({
			cmd: [benchmarkPath],
			stdout: "pipe",
			stderr: "pipe",
			timeout: 60000,
		});

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		return {
			path: benchmarkPath,
			output: stdout + stderr,
			success: exitCode === 0,
		};
	} catch (error) {
		return {
			path: benchmarkPath,
			output: error instanceof Error ? error.message : "Unknown error",
			success: false,
		};
	}
}
