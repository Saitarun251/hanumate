/**
 * tsup configuration for Hanumate runtime
 * Builds ESM bundles for Node.js and Cloudflare Workers
 */

import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

// Shared options for both builds
const sharedOptions = {
	entry: ['src/index.ts'],
	sourcemap: true,
	clean: true,
	dts: true,
	treeshake: true,
	format: ['esm'] as const,
	platform: 'node' as const,
	Target: 'node18' as const,
	define: {
		'process.env.NODE_ENV': 'production',
	},
};

// Cloudflare Workers compatible build
// Uses ESM format with no Node.js built-ins beyond fetch/formdata
const cfwOptions = defineConfig({
	...sharedOptions,
	entry: ['src/index.ts'],
	outDir: 'dist',
	outFile: 'worker.mjs',
	platform: 'neutral' as const,
	// Strip Node.js specific code for CFW compatibility
	noExternal: ['hono', 'valibot'],
	// CFW doesn't support some Node.js APIs
	replaceNodeEnv: false,
	// Banner needed for ESM modules in CFW
	banner: {
		js: `/**
 * Hanumate Runtime - Cloudflare Workers Compatible Build
 * Generated at: ${new Date().toISOString()}
 */
`,
	},
});

// Node.js 18+ ESM bundle with full Node.js support
const nodeOptions = defineConfig([
	{
		...sharedOptions,
		entry: ['src/index.ts'],
		outDir: 'dist',
		outFile: 'index.js',
		platform: 'node' as const,
		// Allow Node.js built-ins
		noExternal: [],
	},
]);

export default defineConfig((options) => {
	// Check for Cloudflare Workers build flag
	if (options.env?.TARGET === 'cfw') {
		return cfwOptions;
	}
	return nodeOptions;
});

// Export named configs for direct use
export { nodeOptions, cfwOptions };
