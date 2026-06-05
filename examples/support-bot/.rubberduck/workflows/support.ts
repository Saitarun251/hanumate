import { createAgent, init } from '@rubberduck/runtime';

const support = createAgent(() => ({
	model: 'openrouter/moonshotai/kimi-k2.6',
}));

export async function run({ init: initFn, payload }: any) {
	const harness = await initFn(support);
	const session = await harness.session();

	return await session.prompt('You are a support agent. Customer: ' + payload.message);
}