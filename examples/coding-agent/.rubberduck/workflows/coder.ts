import { createAgent, init } from '@rubberduck/runtime';

const coder = createAgent(() => ({
	model: 'anthropic/claude-sonnet-4-6',
	skills: ['code-review', 'refactor'],
}));

export async function run({ init: initFn, payload }: any) {
	const harness = await initFn(coder);
	const session = await harness.session();

	return await session.prompt('You are a coding agent. Task: ' + payload.task);
}