/**
 * GPU command - Display GPU metrics and run CUDA benchmarks.
 */

import { Command } from "commander";
import { jsonOutput } from "../json.ts";
import {
	getGpuMetrics,
	getGpuProcesses,
	findCudaBenchmarks,
	runCudaBenchmark,
	isGpuAvailable,
	formatGpuMetrics,
} from "../gpu/metrics.ts";

export function registerGpuCommand(program: Command) {
	program
		.command("gpu")
		.description("Display GPU metrics and run CUDA benchmarks")
		.option("--benchmarks", "Run all available CUDA benchmarks")
		.option("--processes", "Show GPU processes")
		.option("--json", "JSON output")
		.action(async (options) => {
			const gpuAvailable = await isGpuAvailable();

			if (!gpuAvailable) {
				if (options.json) {
					console.log(jsonOutput({ available: false }));
				} else {
					console.log("\x1b[33mNo GPU detected or nvidia-smi not available\x1b[0m");
				}
				return;
			}

			const metrics = await getGpuMetrics();
			const processes = options.processes ? await getGpuProcesses() : [];

			if (options.json) {
				const output: Record<string, unknown> = {
					available: true,
					metrics,
				};
				if (options.processes) {
					output.processes = processes;
				}
				if (options.benchmarks) {
					const benchmarks = await findCudaBenchmarks();
					output.benchmarks = benchmarks;
				}
				console.log(jsonOutput(output));
				return;
			}

			// Human-readable output
			console.log("");
			console.log("\x1b[36m╔════════════════════════════════════════════════════════╗\x1b[0m");
			console.log(
				"\x1b[36m║\x1b[0m           \x1b[1mGPU METRICS - OVERSTORY\x1b[0m                    \x1b[36m║\x1b[0m",
			);
			console.log("\x1b[36m╚════════════════════════════════════════════════════════╝\x1b[0m");
			console.log("");

			if (metrics) {
				console.log(formatGpuMetrics(metrics));
			}

			if (options.processes && processes.length > 0) {
				console.log("");
				console.log("\x1b[1mGPU Processes:\x1b[0m");
				for (const proc of processes) {
					console.log(`  PID ${proc.pid}: ${proc.name} (${proc.memoryUsed} MB)`);
				}
			}

			if (options.benchmarks) {
				console.log("");
				console.log("\x1b[1mCUDA Benchmarks:\x1b[0m");
				const benchmarks = await findCudaBenchmarks();
				if (benchmarks.length === 0) {
					console.log("  \x1b[33mNo benchmarks found\x1b[0m");
				} else {
					for (const benchmark of benchmarks) {
						console.log(`  Running: ${benchmark}`);
						const result = await runCudaBenchmark(benchmark);
						if (result.success) {
							console.log("\x1b[32m  ✓ SUCCESS\x1b[0m");
							// Extract key metrics from output
							const lines = result.output.split("\n").slice(0, 20);
							for (const line of lines) {
								if (
									line.includes("B ops/sec") ||
									line.includes("BILLION") ||
									line.includes("Throughput")
								) {
									console.log(`    ${line.trim()}`);
								}
							}
						} else {
							console.log("\x1b[31m  ✗ FAILED\x1b[0m");
						}
						console.log("");
					}
				}
			}

			console.log("");
			console.log("\x1b[90mUse --benchmarks to run CUDA tests\x1b[0m");
			console.log("\x1b[90mUse --processes to show GPU processes\x1b[0m");
		});

	// Also add gpu subcommands
	program
		.command("gpu-benchmark")
		.description("Run CUDA benchmarks and show results")
		.option("--json", "JSON output")
		.action(async (options) => {
			const gpuAvailable = await isGpuAvailable();
			if (!gpuAvailable) {
				console.log(
					options.json ? jsonOutput({ available: false }) : "\x1b[33mNo GPU available\x1b[0m",
				);
				return;
			}

			const benchmarks = await findCudaBenchmarks();
			const results = [];

			console.log("\x1b[36m╔════════════════════════════════════════════════════════╗\x1b[0m");
			console.log(
				"\x1b[36m║\x1b[0m         \x1b[1mCUDA BENCHMARK SUITE - RTX 5060\x1b[0m              \x1b[36m║\x1b[0m",
			);
			console.log("\x1b[36m╚════════════════════════════════════════════════════════╝\x1b[0m");
			console.log("");

			for (const benchmark of benchmarks) {
				const name = benchmark.split("\\").pop() || benchmark;
				console.log(`\x1b[1m${name}\x1b[0m`);
				console.log("-".repeat(40));

				const result = await runCudaBenchmark(benchmark);
				results.push({ name, path: benchmark, success: result.success });

				if (result.success) {
					// Parse and display key metrics
					const lines = result.output.split("\n");
					let inResults = false;
					for (const line of lines) {
						if (line.includes("BENCHMARK COMPLETE") || line.includes("SUCCESS")) {
							inResults = false;
						}
						if (line.includes("ops/sec") || line.includes("ms")) {
							console.log(`  ${line.trim()}`);
							inResults = true;
						}
					}
					console.log("\x1b[32m  ✓ PASSED\x1b[0m");
				} else {
					console.log("\x1b[31m  ✗ FAILED\x1b[0m");
					console.log(`  ${result.output.slice(0, 200)}`);
				}
				console.log("");
			}

			const passed = results.filter((r) => r.success).length;
			console.log(`\x1b[1mSummary:\x1b[0m ${passed}/${results.length} benchmarks passed`);

			if (options.json) {
				console.log(jsonOutput({ benchmarks: results, passed, total: results.length }));
			}
		});
}
