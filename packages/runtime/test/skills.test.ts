/**
 * Tests for skills system in harness
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdir } from 'node:fs/promises';
import { write } from '../src/fs.js';

// Create mock module for pi-agent-core
vi.mock('@earendil-works/pi-agent-core', () => ({
	createAgent: vi.fn(() => ({
		run: vi.fn(() => Promise.resolve({ type: 'result', message: 'mocked response' })),
	})),
}));

// Import after mocking
import { createAgent, init } from '../src/harness.js';

describe('Skills System', () => {
	const testDir = join(tmpdir(), 'hanumate-skills-test');
	const skillsDir = join(testDir, '.hanumate', '.agents', 'skills');

	beforeAll(async () => {
		// Create skills directory structure
		await mkdir(skillsDir, { recursive: true });

		// Create test skill: mavis
		const mavisSkillDir = join(skillsDir, 'mavis');
		await mkdir(mavisSkillDir, { recursive: true });
		await write(
			join(mavisSkillDir, 'SKILL.md'),
			`---
name: mavis
description: Mavis runtime entry point
tools:
  - mavis
  - skill
---

Mavis is the runtime entry point. Use this skill for any task about Mavis itself.

## Instructions
- Load the mavis skill when needed
- Handle agent management tasks
- Manage inter-session messaging`
		);

		// Create test skill: lark-tools
		const larkSkillDir = join(skillsDir, 'lark-tools');
		await mkdir(larkSkillDir, { recursive: true });
		await write(
			join(larkSkillDir, 'SKILL.md'),
			`---
name: lark-tools
description: Feishu/Lark full-capability access
tools:
  - lark-cli
  - calendar
---

Feishu/Lark full-capability access via the official lark-cli.

## Instructions
- Use lark-cli for calendar operations
- Manage Feishu contacts and messages
- Handle Lark API integrations`
		);

		// Create test skill: pdf
		const pdfSkillDir = join(skillsDir, 'pdf');
		await mkdir(pdfSkillDir, { recursive: true });
		await write(
			join(pdfSkillDir, 'SKILL.md'),
			`---
name: pdf
description: Unified PDF skill
tools:
  - pdf
---

Unified PDF skill for generating, reformatting, filling, and reading PDFs.

## Instructions
- Generate PDFs from text
- Read and extract PDF content
- Fill PDF forms`
		);
	});

	afterAll(async () => {
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Session.listSkills()', () => {
		it('should return available skills from skills directory', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const skills = await session.listSkills();

			// Should include skills from the test skills directory
			expect(skills).toContain('mavis');
			expect(skills).toContain('lark-tools');
			expect(skills).toContain('pdf');
		});

		it('should return empty array when no skills directory exists', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: '/tmp/nonexistent' } });
			const session = harness.session();

			const skills = await session.listSkills();

			// Should return empty array for non-existent directory
			expect(Array.isArray(skills)).toBe(true);
		});

		it('should include configured skills plus available skills', async () => {
			const agent = createAgent({ skills: ['preconfigured-skill'] });
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const skills = await session.listSkills();

			// Should include both configured and available
			expect(skills).toContain('preconfigured-skill');
			expect(skills).toContain('mavis');
		});
	});

	describe('Session.getSkillInstructions()', () => {
		it('should return instructions for existing skill', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const instructions = await session.getSkillInstructions('mavis');

			expect(instructions).toContain('Mavis is the runtime entry point');
			expect(instructions).toContain('Load the mavis skill');
			expect(instructions).toContain('Handle agent management');
		});

		it('should return instructions for lark-tools skill', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const instructions = await session.getSkillInstructions('lark-tools');

			expect(instructions).toContain('Feishu/Lark');
			expect(instructions).toContain('lark-cli');
			expect(instructions).toContain('calendar operations');
		});

		it('should return error message for non-existent skill', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const instructions = await session.getSkillInstructions('nonexistent-skill');

			expect(instructions).toContain('Error');
			expect(instructions).toContain('nonexistent-skill');
			expect(instructions).toContain('not found');
		});
	});

	describe('Session.runSkill()', () => {
		it('should execute skill and return formatted response', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const result = await session.runSkill('mavis');

			expect(result).toContain('Executing skill: mavis');
			expect(result).toContain('Description: Mavis runtime entry point');
			expect(result).toContain('Instructions:');
			expect(result).toContain('Mavis is the runtime entry point');
			expect(result).toContain('Context:');
		});

		it('should include context in skill execution result', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const context = { task: 'test', userId: '123' };
			const result = await session.runSkill('lark-tools', context);

			expect(result).toContain('Executing skill: lark-tools');
			expect(result).toContain('"task": "test"');
			expect(result).toContain('"userId": "123"');
		});

		it('should handle "No context provided" when no context passed', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const result = await session.runSkill('pdf');

			expect(result).toContain('No context provided');
		});

		it('should return error for non-existent skill', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			const result = await session.runSkill('fake-skill');

			expect(result).toContain('Error');
			expect(result).toContain('fake-skill');
		});
	});

	describe('Skill caching', () => {
		it('should cache skills after first load', async () => {
			const agent = createAgent({});
			const harness = await init(agent, { config: { basePath: testDir } });
			const session = harness.session();

			// First load
			const result1 = await session.getSkillInstructions('mavis');
			// Second load (should use cache)
			const result2 = await session.getSkillInstructions('mavis');

			expect(result1).toBe(result2);
		});
	});
});
