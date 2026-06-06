import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { Skill, SkillMetadata } from './types.js';

// Re-export Skill type for convenience
export type { Skill, SkillMetadata } from './types.js';

/**
 * Frontmatter parsing result
 */
interface FrontmatterResult {
	metadata: Record<string, string | string[]>;
	content: string;
}

/**
 * SkillLoader - Loads and parses skills from the filesystem
 *
 * Skills are stored in .hanumate/.agents/skills/:skill-name/SKILL.md
 * with YAML frontmatter for metadata and markdown for instructions.
 */
export class SkillLoader {
	private skillsDir: string;
	private loadedSkills: Map<string, Skill> = new Map();

	constructor(basePath?: string) {
		this.skillsDir = resolve(basePath ?? process.cwd(), '.hanumate', '.agents', 'skills');
	}

	/**
	 * Load a skill by name from the skills directory
	 * @param name - The skill name (directory name)
	 * @returns The loaded Skill object
	 */
	async loadSkill(name: string): Promise<Skill> {
		// Return cached skill if available
		if (this.loadedSkills.has(name)) {
			return this.loadedSkills.get(name)!;
		}

		const skillPath = join(this.skillsDir, name, 'SKILL.md');

		try {
			const content = await readFile(skillPath, 'utf-8');
			const frontmatterResult = this.parseFrontmatter(content);
			const instructions = this.getSkillInstructionsFromContent(content);

			// Extract metadata from frontmatter result
			const metadata = frontmatterResult.metadata;

			const skill: Skill = {
				name,
				description: (metadata.description as string) ?? `Skill: ${name}`,
				instructions,
				tools: this.parseToolsArray(metadata.tools),
			};

			this.loadedSkills.set(name, skill);
			return skill;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Skill '${name}' not found at ${skillPath}`);
			}
			throw error;
		}
	}

	/**
	 * Load multiple skills by names
	 * @param names - Array of skill names
	 * @returns Array of loaded Skills
	 */
	async loadSkills(names: string[]): Promise<Skill[]> {
		return Promise.all(names.map((name) => this.loadSkill(name)));
	}

	/**
	 * Parse skill markdown file and extract frontmatter metadata
	 * @param path - Path to the SKILL.md file (for error messages)
	 * @param content - The raw markdown content
	 * @returns Parsed metadata and content
	 */
	parseSkillMarkdown(content: string): SkillMetadata & { instructions: string } {
		const result = this.parseFrontmatter(content);
		return {
			name: result.metadata.name as string ?? '',
			description: result.metadata.description as string ?? '',
			tools: this.parseToolsArray(result.metadata.tools),
			instructions: this.getSkillInstructionsFromContent(content),
		};
	}

	/**
	 * Get the instructions string from a parsed skill
	 * @param skill - The skill object
	 * @returns The instructions string
	 */
	getSkillInstructions(skill: Skill): string {
		return skill.instructions;
	}

	/**
	 * List all available skills in the skills directory
	 * @returns Array of skill names
	 */
	async listSkills(): Promise<string[]> {
		const { readdir } = await import('fs/promises');
		try {
			const entries = await readdir(this.skillsDir, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Parse YAML frontmatter from markdown content
	 */
	private parseFrontmatter(content: string): FrontmatterResult {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);

		if (!match) {
			return { metadata: {}, content };
		}

		const yamlContent = match[1];
		const bodyContent = content.slice(match[0].length);
		const metadata = this.parseYaml(yamlContent);

		return { metadata, content: bodyContent };
	}

	/**
	 * Simple YAML parser for frontmatter
	 */
	private parseYaml(yaml: string): Record<string, string | string[]> {
		const result: Record<string, string | string[]> = {};
		const lines = yaml.split('\n');

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith('#')) continue;

			const colonIndex = trimmedLine.indexOf(':');
			if (colonIndex === -1) continue;

			const key = trimmedLine.slice(0, colonIndex).trim();
			const value = trimmedLine.slice(colonIndex + 1).trim();

			if (value.startsWith('[') && value.endsWith(']')) {
				// Parse array
				const arrayContent = value.slice(1, -1);
				result[key] = arrayContent
					.split(',')
					.map((item) => item.trim().replace(/^["']|["']$/g, ''))
					.filter(Boolean);
			} else {
				result[key] = value.replace(/^["']|["']$/g, '');
			}
		}

		return result;
	}

	/**
	 * Parse tools array from metadata
	 */
	private parseToolsArray(value: string | string[] | undefined): string[] | undefined {
		if (!value) return undefined;
		if (Array.isArray(value)) return value;
		if (typeof value === 'string' && value.startsWith('[')) {
			return value
				.slice(1, -1)
				.split(',')
				.map((item) => item.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		}
		return [value];
	}

	/**
	 * Extract instructions from markdown content
	 * Instructions are everything after the Description section
	 */
	private getSkillInstructionsFromContent(content: string): string {
		const result = this.parseFrontmatter(content);
		return result.content.trim();
	}
}

/**
 * Default global skill loader instance
 */
let defaultLoader: SkillLoader | null = null;

export function getSkillLoader(basePath?: string): SkillLoader {
	if (!defaultLoader) {
		defaultLoader = new SkillLoader(basePath);
	}
	return defaultLoader;
}
