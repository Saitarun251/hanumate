#!/usr/bin/env node
/**
 * Build orchestration script for Hanumate runtime
 * Supports multiple build targets: node, cfw (Cloudflare Workers)
 *
 * Usage:
 *   node build.js              # Build both targets
 *   node build.js node         # Build Node.js ESM bundle only
 *   node build.js cfw          # Build Cloudflare Workers bundle only
 *   node build.js --watch      # Watch mode for development
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get package root directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

/**
 * Build targets available
 */
const TARGETS = {
	node: {
		name: 'Node.js 18+ ESM',
		output: 'dist/index.js',
		tsupArgs: ['--env.TARGET=node'],
	},
	cfw: {
		name: 'Cloudflare Workers',
		output: 'dist/worker.mjs',
		tsupArgs: ['--env.TARGET=cfw'],
	},
} as const;

type TargetName = keyof typeof TARGETS;

/**
 * ANSI color codes for output
 */
const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	red: '\x1b[31m',
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
	log(`\n${'='.repeat(60)}`, 'blue');
	log(`${colors.bold}${title}${colors.reset}`, 'blue');
	log('='.repeat(60), 'blue');
}

/**
 * Check if tsup is available
 */
function checkTsup(): boolean {
	try {
		import.meta.require?.resolve('tsup');
		return true;
	} catch {
		// Fallback: try to spawn it
		return true;
	}
}

/**
 * Run tsup build
 */
async function runBuild(target: TargetName, watch = false): Promise<boolean> {
	const config = TARGETS[target];

	logSection(`Building ${config.name}`);

	const args = [
		'tsup',
		'./tsup.config.ts',
		...config.tsupArgs,
		'--sourcemap',
		'--clean',
		...(watch ? ['--watch'] : []),
	];

	log(`Running: tsup ${args.slice(1).join(' ')}`, 'yellow');

	return new Promise((resolve) => {
		const proc = spawn('npx', args, {
			cwd: __dirname,
			stdio: 'inherit',
			shell: true,
		});

		proc.on('close', (code) => {
			if (code === 0) {
				log(`✓ ${config.name} build succeeded`, 'green');
				resolve(true);
			} else {
				log(`✗ ${config.name} build failed with code ${code}`, 'red');
				resolve(false);
			}
		});

		proc.on('error', (err) => {
			log(`✗ Failed to start build: ${err.message}`, 'red');
			resolve(false);
		});
	});
}

/**
 * Verify build output exists
 */
function verifyBuild(target: TargetName): boolean {
	const config = TARGETS[target];
	const outputPath = join(__dirname, config.output);

	if (!existsSync(outputPath)) {
		log(`✗ Output file not found: ${config.output}`, 'red');
		return false;
	}

	// Check file size (should not be empty)
	const { size } = require('node:fs').statSync(outputPath);
	if (size === 0) {
		log(`✗ Output file is empty: ${config.output}`, 'red');
		return false;
	}

	log(`✓ Verified: ${config.output} (${formatSize(size)})`, 'green');
	return true;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Main build function
 */
async function main() {
	const args = process.argv.slice(2);
	const watch = args.includes('--watch');
	const targets = args.filter((a) => a in TARGETS) as TargetName[];

	// Default to all targets
	if (targets.length === 0) {
		targets.push('node', 'cfw');
	}

	logSection('Hanumate Runtime Build');

	log(`Build targets: ${targets.map((t) => TARGETS[t].name).join(', ')}`);
	log(`Watch mode: ${watch ? 'enabled' : 'disabled'}\n`);

	// Ensure dist directory exists
	if (!existsSync(distDir)) {
		mkdirSync(distDir, { recursive: true });
	}

	const results: Record<string, boolean> = {};

	for (const target of targets) {
		const success = await runBuild(target, watch);
		if (success && !watch) {
			results[target] = verifyBuild(target);
		} else {
			results[target] = success;
		}
	}

	// Summary
	logSection('Build Summary');

	const allSucceeded = Object.values(results).every(Boolean);

	for (const [target, success] of Object.entries(results)) {
		const status = success ? '✓' : '✗';
		log(`${status} ${TARGETS[target as TargetName].name}`);
	}

	if (allSucceeded && !watch) {
		log('\n✓ All builds completed successfully!', 'green');

		// List output files
		log('\nOutput files:');
		for (const target of targets) {
			const outputPath = join(__dirname, TARGETS[target as TargetName].output);
			const { size } = require('node:fs').statSync(outputPath);
			log(`  - ${TARGETS[target as TargetName].output} (${formatSize(size)})`);
		}
	} else if (watch) {
		log('\n↻ Watching for changes... (Ctrl+C to stop)', 'yellow');
	} else {
		log('\n✗ Some builds failed', 'red');
		process.exit(1);
	}
}

// Handle watch mode exit gracefully
process.on('SIGINT', () => {
	log('\n\nBuild interrupted. Exiting...', 'yellow');
	process.exit(0);
});

// Run main
main().catch((err) => {
	log(`\n✗ Build error: ${err.message}`, 'red');
	process.exit(1);
});
