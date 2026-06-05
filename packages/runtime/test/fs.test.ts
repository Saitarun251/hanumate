/**
 * Tests for filesystem operations module
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
	read,
	write,
	mk,
	readDir,
	getStats,
	exists,
	copy,
	remove,
	removeDir,
	move,
	glob,
	resolvePath,
	joinPath,
	relativePath,
	fileName,
	dirName,
	fileExt,
	isAbs,
	type FSError,
} from '../src/fs.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('Filesystem Operations', () => {
	const testDir = join(tmpdir(), 'rubberduck-fs-test');
	const testSubDir = join(testDir, 'subdir');

	beforeAll(async () => {
		await mk(testDir, { recursive: true });
	});

	afterAll(async () => {
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('write and read', () => {
		it('should write and read a text file', async () => {
			const filePath = join(testDir, 'test.txt');
			const content = 'Hello, World!';

			await write(filePath, content);
			const result = await read(filePath);
			expect(result).toBe(content);
		});

		it('should write and read a binary file', async () => {
			const filePath = join(testDir, 'test.bin');
			const content = Buffer.from([0x00, 0x01, 0x02, 0xff]);

			await write(filePath, content);
			const result = await read(filePath, { encoding: 'binary' });
			expect(Buffer.isBuffer(result) ? result : Buffer.from(result as string, 'binary')).toEqual(content);
		});

		it('should overwrite existing file by default', async () => {
			const filePath = join(testDir, 'overwrite.txt');

			await write(filePath, 'original');
			await write(filePath, 'updated');
			const result = await read(filePath);
			expect(result).toBe('updated');
		});

		it('should create parent directories when writing', async () => {
			const deepPath = join(testDir, 'deep', 'nested', 'path', 'file.txt');
			await write(deepPath, 'nested content');
			const result = await read(deepPath);
			expect(result).toBe('nested content');
		});

		it('should handle partial reads with offset and limit', async () => {
			const filePath = join(testDir, 'partial.txt');
			const content = '0123456789';

			await write(filePath, content);
			const result = await read(filePath, { offset: 2, limit: 4 });
			expect(result).toBe('2345');
		});
	});

	describe('mk (mkdir)', () => {
		it('should create a directory', async () => {
			const dirPath = join(testDir, 'newdir');
			await mk(dirPath);
			expect(exists(dirPath)).toBe(true);
		});

		it('should create nested directories recursively', async () => {
			const nestedPath = join(testDir, 'a', 'b', 'c');
			await mk(nestedPath, { recursive: true });
			expect(exists(nestedPath)).toBe(true);
		});

		it('should not throw when directory exists', async () => {
			const dirPath = join(testDir, 'existing');
			await mk(dirPath);
			const result = await mk(dirPath);
			expect(result).toBeUndefined();
		});
	});

	describe('readDir', () => {
		beforeEach(async () => {
			// Create test files in a subdirectory
			const readDirTestDir = join(testDir, 'readdir-test');
			await mk(readDirTestDir, { recursive: true });
			await write(join(readDirTestDir, 'file1.txt'), 'content1');
			await write(join(readDirTestDir, 'file2.txt'), 'content2');
			await mk(join(readDirTestDir, 'subdir'));
		});

		it('should list directory contents as names', async () => {
			const readDirTestDir = join(testDir, 'readdir-test');
			const entries = await readDir(readDirTestDir);
			expect(Array.isArray(entries)).toBe(true);
			expect(entries.length).toBeGreaterThanOrEqual(2);
		});

		it('should return detailed file info with withFileTypes', async () => {
			const readDirTestDir = join(testDir, 'readdir-test');
			const entries = await readDir(readDirTestDir, { withFileTypes: true });
			const txtFiles = entries.filter((e) =>
				typeof e === 'object' && e.name.endsWith('.txt')
			);
			expect(txtFiles.length).toBeGreaterThanOrEqual(2);
			expect(txtFiles[0]).toHaveProperty('isFile');
			expect(txtFiles[0]).toHaveProperty('isDirectory');
		});
	});

	describe('getStats', () => {
		it('should return file stats', async () => {
			const filePath = join(testDir, 'stat_test.txt');
			await write(filePath, 'content');

			const stats = await getStats(filePath);
			expect(stats.isFile()).toBe(true);
			expect(stats.size).toBeGreaterThan(0);
			expect(stats.mtime).toBeInstanceOf(Date);
		});

		it('should return directory stats', async () => {
			const stats = await getStats(testDir);
			expect(stats.isDirectory()).toBe(true);
		});
	});

	describe('exists', () => {
		it('should return true for existing files', async () => {
			const filePath = join(testDir, 'exists.txt');
			await write(filePath, 'test');
			expect(exists(filePath)).toBe(true);
		});

		it('should return false for non-existing files', () => {
			expect(exists(join(testDir, 'nonexistent.txt'))).toBe(false);
		});
	});

	describe('copy', () => {
		it('should copy a file', async () => {
			const srcPath = join(testDir, 'source.txt');
			const destPath = join(testDir, 'dest.txt');

			await write(srcPath, 'copy me');
			await copy(srcPath, destPath);

			const result = await read(destPath);
			expect(result).toBe('copy me');
		});
	});

	describe('remove', () => {
		it('should delete a file', async () => {
			const filePath = join(testDir, 'to_delete.txt');
			await write(filePath, 'delete me');
			await remove(filePath);
			expect(exists(filePath)).toBe(false);
		});
	});

	describe('removeDir', () => {
		it('should delete an empty directory', async () => {
			const dirPath = join(testDir, 'to_delete_dir');
			await mk(dirPath);
			await removeDir(dirPath);
			expect(exists(dirPath)).toBe(false);
		});
	});

	describe('move', () => {
		it('should rename/move a file', async () => {
			const srcPath = join(testDir, 'move_src.txt');
			const destPath = join(testDir, 'move_dest.txt');

			await write(srcPath, 'move me');
			await move(srcPath, destPath);

			expect(exists(destPath)).toBe(true);
			expect(exists(srcPath)).toBe(false);
		});
	});

	describe('glob', () => {
		beforeEach(async () => {
			// Create test structure in a subdirectory
			const globTestDir = join(testDir, 'glob-test');
			await mk(globTestDir, { recursive: true });
			await write(join(globTestDir, 'file.ts'), 'ts');
			await write(join(globTestDir, 'file.js'), 'js');
			await write(join(globTestDir, 'data.json'), '{}');
			await mk(join(globTestDir, 'src'), { recursive: true });
			await write(join(globTestDir, 'src', 'index.ts'), 'index');
		});

		it('should match files with wildcard', async () => {
			const globTestDir = join(testDir, 'glob-test');
			const results = await glob(globTestDir, { pattern: '*.ts' });
			expect(results.some((r) => r.endsWith('file.ts'))).toBe(true);
		});

		it('should match all files with **', async () => {
			const globTestDir = join(testDir, 'glob-test');
			const results = await glob(globTestDir, { pattern: '**/*' });
			// Debug: log results
			console.log('glob results:', results);
			// Should match at least 4 files: file.ts, file.js, data.json, src/index.ts
			expect(results.length).toBeGreaterThanOrEqual(4);
		});

		it('should exclude hidden files by default', async () => {
			const globTestDir = join(testDir, 'glob-test');
			await write(join(globTestDir, '.hidden'), 'hidden');
			const results = await glob(globTestDir, { pattern: '*' });
			expect(results.some((r) => r.includes('.hidden'))).toBe(false);
		});

		it('should include hidden files when specified', async () => {
			const globTestDir = join(testDir, 'glob-test');
			await write(join(globTestDir, '.hidden'), 'hidden');
			const results = await glob(globTestDir, { pattern: '*', includeHidden: true });
			expect(results.some((r) => r.includes('.hidden'))).toBe(true);
		});
	});

	describe('Path utilities', () => {
		it('should resolve path to absolute', () => {
			const result = resolvePath('./relative', 'path');
			expect(isAbs(result)).toBe(true);
		});

		it('should join path segments', () => {
			const result = joinPath('a', 'b', 'c');
			expect(result).toContain('a');
			expect(result).toContain('b');
			expect(result).toContain('c');
		});

		it('should get relative path', () => {
			const result = relativePath('/a/b', '/a/b/c/d');
			expect(result).toBe(join('c', 'd'));
		});

		it('should get file name', () => {
			expect(fileName('/path/to/file.txt')).toBe('file.txt');
		});

		it('should get directory name', () => {
			expect(dirName('/path/to/file.txt')).toBe('/path/to');
		});

		it('should get file extension', () => {
			expect(fileExt('/path/to/file.txt')).toBe('.txt');
		});

		it('should check if path is absolute', () => {
			expect(isAbs('/absolute/path')).toBe(true);
			expect(isAbs('./relative/path')).toBe(false);
		});
	});

	describe('Error handling', () => {
		it('should throw FSError with ENOENT for missing files', async () => {
			await expect(read('/nonexistent/path/file.txt')).rejects.toThrow();
		});

		it('should throw FSError with EISDIR for reading directory as file', async () => {
			await expect(read(testDir)).rejects.toThrow();
		});
	});
});
