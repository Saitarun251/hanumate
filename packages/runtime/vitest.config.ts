import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	test: {
		environment: 'node',
		alias: {
			'@': resolve(__dirname, './src'),
		},
		include: ['__tests__/**/*.test.ts', 'test/**/*.test.ts'],
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs'],
	},
});