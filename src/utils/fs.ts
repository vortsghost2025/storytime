/**
 * Filesystem utility functions for cleanup and state management.
 */
import { readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Delete a SQLite database file and its WAL/SHM companions.
 * Returns true if the main database file is gone after the operation (either deleted or already absent).
 * Returns false if the main database file did not exist at the start of the operation.
 */
export async function wipeSqliteDb(dbPath: string): Promise<boolean> {
	const file = Bun.file(dbPath);
	if (!(await file.exists())) {
		return false;
	}

	const extensions = ["", "-wal", "-shm"];
	const maxAttempts = 5;
	const baseDelayMs = 100; // Start with 100ms delay

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		// Try to delete each file (ignore errors - file may not exist or be locked)
		for (const ext of extensions) {
			try {
				await unlink(`${dbPath}${ext}`);
			} catch {
				// Ignore errors
			}
		}

		// Check if the main database file is gone
		if (!(await Bun.file(dbPath).exists())) {
			return true;
		}

		// If not the last attempt, wait before trying again with exponential backoff
		if (attempt < maxAttempts - 1) {
			const delayMs = baseDelayMs * (2 ** attempt); // Exponential backoff: 100ms, 200ms, 400ms, 800ms
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}

	// Final check
	return !(await Bun.file(dbPath).exists());
}

/**
 * Reset a JSON file to an empty array.
 */
export async function resetJsonFile(path: string): Promise<boolean> {
	const file = Bun.file(path);
	if (await file.exists()) {
		await Bun.write(path, "[]\n");
		return true;
	}
	return false;
}

/**
 * Clear all entries inside a directory but keep the directory itself.
 */
export async function clearDirectory(dirPath: string): Promise<boolean> {
	try {
		const entries = await readdir(dirPath);
		for (const entry of entries) {
			await rm(join(dirPath, entry), { recursive: true, force: true });
		}
		return entries.length > 0;
	} catch {
		// Directory may not exist
		return false;
	}
}

/**
 * Delete a single file if it exists.
 */
export async function deleteFile(path: string): Promise<boolean> {
	try {
		await unlink(path);
		return true;
	} catch {
		return false;
	}
}
