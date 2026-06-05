import { createAgent, init } from '@rubberduck/runtime';

export async function run({ init: initFn, payload }: any) {
	const agent = createAgent(() => ({
		model: 'anthropic/claude-opus-4-7',
	}));

	const harness = await initFn(agent);
	const session = await harness.session();

	return await session.prompt('You are a CI triage agent. Analyze this issue: ' + payload.title);
}