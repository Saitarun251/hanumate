/**
 * End-to-end test script for Hanumate Harness
 * Verifies that all components integrate correctly
 */

import { createAgent, init, createLocalSandbox, initTelemetry, shutdownTelemetry } from './src/index.js';

async function runE2ETest() {
	console.log('=== Hanumate End-to-End Test ===\n');

	try {
		// 1. Initialize telemetry
		console.log('1. Initializing telemetry...');
		initTelemetry({
			enabled: true,
			serviceName: 'hanumate-e2e-test',
			exporter: 'console'
		});
		console.log('   ✓ Telemetry initialized\n');

		// 2. Create agent
		console.log('2. Creating agent...');
		const agent = createAgent({
			name: 'test-agent',
			model: 'anthropic/claude-sonnet-4',
			env: { PATH: process.env.PATH ?? '' }
		});
		console.log(`   ✓ Agent created: ${agent.name}\n`);

		// 3. Create local sandbox
		console.log('3. Creating local sandbox...');
		const sandbox = createLocalSandbox();
		console.log(`   ✓ Sandbox created: ${sandbox.isAlive() ? 'alive' : 'not alive'}\n`);

		// 4. Initialize harness with all components
		console.log('4. Initializing harness...');
		const harness = await init(agent, {
			name: 'test-harness',
			config: {
				skills: [],
				sandbox: { type: 'local' },
				telemetry: { enabled: true }
			}
		});
		console.log(`   ✓ Harness initialized with session ID: ${harness.getSessionId()}\n`);

		// 5. Test session shell execution
		console.log('5. Testing session.shell()...');
		const session = harness.session();
		const shellResult = await session.shell('echo "Hello from shell"');
		console.log(`   ✓ Shell output: ${shellResult.stdout.trim()}\n`);

		// 6. Test filesystem operations
		console.log('6. Testing session filesystem operations...');
		const testDir = '/tmp/hanumate-e2e-test';
		await session.mkdir(testDir, { recursive: true });
		console.log(`   ✓ Created directory: ${testDir}`);

		await session.writeFile(`${testDir}/test.txt`, 'Hello from Hanumate!');
		const content = await session.readFile(`${testDir}/test.txt`);
		console.log(`   ✓ File content: ${content}`);

		// 7. Test path resolution
		console.log('7. Testing path utilities...');
		const resolved = session.resolve('/tmp', 'test.txt');
		console.log(`   ✓ Resolved path: ${resolved}\n`);

		// 8. Cleanup
		console.log('8. Cleaning up...');
		await session.deleteFile(`${testDir}/test.txt`);
		console.log(`   ✓ Deleted test file\n`);

		// 9. Shutdown
		console.log('9. Shutting down...');
		await harness.shutdown();
		console.log('   ✓ Harness shutdown complete\n');

		console.log('=== All tests passed! ===');
	} catch (error) {
		console.error('Test failed:', error);
		process.exit(1);
	}
}

runE2ETest();