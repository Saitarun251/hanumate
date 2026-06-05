// Stub types for external dependencies (actual types to be determined)
interface Agent {
	run(turn: Turn): Promise<TurnResult>;
}

interface Turn {
	type: 'user' | 'assistant' | 'system';
	content: string;
	attachments?: Array<{
		name: string;
		type: string;
		url?: string;
	}>;
}

interface TurnResult {
	type: 'result' | 'error';
	message?: string;
}

function createPiAgent(config: { model: string }): Agent {
	return {
		run: async () => ({ type: 'result', message: 'Mock response' }),
	};
}
import { exec, execStream, getDefaultEnv, type ExecResult, type ExecOptions } from './shell.js';
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
	type FileInfo,
	type ReadOptions,
	type WriteOptions,
	type GlobOptions,
} from './fs.js';
import { SkillLoader, getSkillLoader, type Skill } from './skills.js';
import { type MCPConnection, type MCPServerConfig, connectMCPServers } from './mcp.js';
import {
	createSandbox,
	createLocalSandbox,
	createVirtualSandbox,
	createDaytonaSandbox,
	createE2BSandbox,
	type Sandbox,
	type SandboxConnectorType,
} from './connectors/index.js';
import {
	type SessionStore,
	type SessionData,
	type SessionMessage,
	InMemorySessionStore,
	generateSessionId,
	createSessionData,
	turnToMessage,
	messageToTurn,
} from './session-store.js';
import {
	initTelemetry,
	shutdownTelemetry,
	isTelemetryEnabled,
	tracePrompt,
	traceSkillExecution,
	traceShellCommand,
	traceFsOperation,
	traceMCPOperation,
	type TelemetryConfig,
} from './telemetry.js';
import {
	createTracer,
	traceSessionPrompt,
	traceToolExecution,
	traceWorkflowExecution,
	traceWorkflowStep,
	wrapWithSpan,
	wrapWithSpanSync,
} from './observability.js';
import {
	ProviderManager,
	ProviderFallbackChain,
	type ProviderConfig,
	type Provider,
} from './providers.js';
import {
	configureProvider,
	getConfiguredProvider,
	listConfiguredProviders,
	resolveProviderWithGateway,
	configureGateway,
	getGatewayConfig,
	type GatewayConfig,
	type ConfiguredProvider,
} from './provider-config.js';
import { join } from 'node:path';

// Agent registry for subagent/orchestration system
import { AgentRegistry, type AgentRegistration } from './agents.js';
import { SharedContext, defaultContextFactory } from './shared-context.js';
import {
	Dispatcher,
	type DispatchOptions,
	type DispatchResult as HarnessDispatchResult,
	type BatchDispatchResult,
	type DispatchTarget,
} from './dispatch.js';

export interface RubberDuckConfig {
	/** Agent name (default: 'rubberduck-agent') */
	name?: string;
	model?: string;
	apiKey?: string;
	baseUrl?: string;
	/** Provider ID (e.g., 'openai', 'anthropic', 'google', 'ollama', 'lmstudio') */
	providerId?: string;
	/** Custom environment variables */
	env?: Record<string, string>;
	/** Shell timeout in milliseconds (default: 30000) */
	shellTimeout?: number;
	skills?: string[];
	basePath?: string;
	/** MCP server configurations */
	mcpServers?: MCPServerConfig[];
	/** Sandbox connector type (default: 'local') */
	sandbox?: {
		type: SandboxConnectorType;
		/** API key for remote sandboxes (daytona, e2b) */
		apiKey?: string;
		/** Custom base URL for remote sandboxes */
		baseUrl?: string;
		/** Template for E2B sandbox */
		template?: string;
	};
	/** OpenTelemetry configuration */
	telemetry?: TelemetryConfig;
	/** Provider configuration (deprecated: use providerId instead) */
	provider?: {
		/** Provider ID (e.g., 'openai', 'anthropic', 'google', 'ollama', 'lmstudio') */
		id?: string;
		/** Custom base URL for the provider (for proxies/gateways) */
		baseURL?: string;
		/** Custom API key */
		apiKey?: string;
		/** Fallback providers for high availability */
		fallbackProviders?: string[];
	};
	/** Gateway configuration for enterprise API proxies */
	gateway?: GatewayConfig;
	/** Session store configuration */
	sessionStore?: {
		/** Session store instance */
		store: SessionStore;
		/** Session ID (optional, generates new if not provided) */
		sessionId?: string;
		/** Default TTL in milliseconds */
		defaultTTL?: number | null;
	};
}

export interface Tool {
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
	handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface RubberDuckAgent {
	/** Agent name */
	name: string;
	model: string;
	/** Provider ID for LLM provider selection */
	providerId?: string;
	tools: Tool[];
	skills: string[];
	/** Merged environment variables */
	env: Record<string, string>;
	/** Active MCP server connections */
	mcpConnections: MCPConnection[];
}

export function createAgent(config: RubberDuckConfig): RubberDuckAgent {
	// Build environment - inherit defaults and merge custom vars
	const customEnv = config.env ?? {};
	const defaultEnv = getDefaultEnv();
	const mergedEnv = { ...defaultEnv, ...customEnv };

	// Determine provider ID - can come from provider.id or directly from providerId
	const effectiveProviderId = config.providerId ?? config.provider?.id;

	return {
		name: config.name ?? 'rubberduck-agent',
		model: config.model ?? 'anthropic/claude-sonnet-4-6',
		providerId: effectiveProviderId,
		tools: [],
		skills: config.skills ?? [],
		env: mergedEnv,
		mcpConnections: [],
	};
}

/**
 * Create a new agent with explicit ID and configuration
 * Used for subagent registration in the harness
 * 
 * @param id - Unique identifier for the agent
 * @param config - Agent configuration
 * @param name - Optional display name override
 * @param tags - Optional capability tags
 * @returns Created agent instance
 */
export function createAgentWithId(
	id: string,
	config: RubberDuckConfig,
	name?: string,
	tags?: string[]
): RubberDuckAgent {
	const effectiveConfig: RubberDuckConfig = {
		...config,
		name: name ?? config.name ?? id,
	};
	return createAgent(effectiveConfig);
}

/**
 * Load skills for an agent from the skills directory
 * Skills are loaded from .rubberduck/.agents/skills/:skill-name/SKILL.md
 * @param skillNames - Array of skill names to load (empty = load all)
 * @param basePath - Base path to search for skills directory
 * @returns Map of skill name to Skill object
 */
export async function loadAgentSkills(
	skillNames: string[],
	basePath?: string
): Promise<Map<string, Skill>> {
	const skillLoader = new SkillLoader(basePath);
	const loadedSkills = new Map<string, Skill>();

	if (skillNames.length === 0) {
		// Load all available skills
		const allSkills = await skillLoader.listSkills();
		for (const name of allSkills) {
			try {
				const skill = await skillLoader.loadSkill(name);
				loadedSkills.set(name, skill);
			} catch (error) {
				console.warn(`Failed to load skill '${name}':`, error);
			}
		}
	} else {
		// Load specified skills
		for (const name of skillNames) {
			try {
				const skill = await skillLoader.loadSkill(name);
				loadedSkills.set(name, skill);
			} catch (error) {
				console.warn(`Failed to load skill '${name}':`, error);
			}
		}
	}

	return loadedSkills;
}

export interface Session {
	prompt(message: string): Promise<string>;
	runSkill(skillName: string, context?: Record<string, unknown>): Promise<string>;
	getSkillInstructions(skillName: string): Promise<string>;
	listSkills(): Promise<string[]>;
	/** Execute a shell command */
	shell(command: string, cwd?: string): Promise<ExecResult>;
	/** Read a file */
	readFile(path: string, options?: ReadOptions): Promise<string | Buffer>;
	/** Write content to a file */
	writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
	/** Create a directory */
	mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined>;
	/** Read directory contents */
	readDir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | FileInfo[]>;
	/** Check if path exists */
	pathExists(path: string): boolean;
	/** Get file stats */
	stat(path: string): Promise<ReturnType<typeof getStats>>;
	/** Copy a file */
	copyFile(src: string, dest: string): Promise<void>;
	/** Delete a file */
	deleteFile(path: string): Promise<void>;
	/** Delete a directory */
	deleteDir(path: string): Promise<void>;
	/** Move/rename a file or directory */
	moveFile(src: string, dest: string): Promise<void>;
	/** Find files matching a glob pattern */
	glob(basePath: string, options?: GlobOptions): Promise<string[]>;
	/** Resolve path to absolute */
	resolve(...paths: string[]): string;
	/** Join path segments */
	join(...paths: string[]): string;
	/** Get message history */
	getHistory(): Promise<SessionMessage[]>;
	/** Clear message history */
	clearHistory(): Promise<void>;
	/** Save current session state */
	save(): Promise<void>;
}

export interface Harness {
	agent: RubberDuckAgent;
	/** Get the agent registry for managing subagents */
	getAgentRegistry(): AgentRegistry;
	/** Create a new subagent and register it
	 * @param id - Unique identifier for the agent
	 * @param config - Agent configuration
	 * @param name - Optional display name
	 * @param tags - Optional capability tags
	 */
	createAgent(id: string, config?: RubberDuckConfig, name?: string, tags?: string[]): RubberDuckAgent;
	/** Get an agent by ID
	 * @param id - Agent identifier
	 */
	getAgent(id: string): RubberDuckAgent | undefined;
	/** List all registered agent IDs */
	listAgents(): string[];
	/** Check if an agent is registered */
	hasAgent(id: string): boolean;
	/** Dispatch a task to a single agent
	 * @param target - Agent ID or instance
	 * @param task - Task/prompt to execute
	 * @param timeout - Optional timeout in ms
	 */
	dispatch(target: DispatchTarget, task: string, timeout?: number): Promise<HarnessDispatchResult>;
	/** Dispatch to multiple agents in parallel
	 * @param targets - Array of agent IDs or instances
	 * @param task - Task/prompt to execute
	 * @param timeout - Optional timeout in ms
	 */
	dispatchAsync(targets: DispatchTarget[], task: string, timeout?: number): Promise<BatchDispatchResult>;
	/** Dispatch to multiple agents sequentially
	 * @param targets - Array of agent IDs or instances
	 * @param task - Task/prompt to execute
	 * @param timeout - Optional timeout in ms
	 */
	dispatchSequential(targets: DispatchTarget[], task: string, timeout?: number): Promise<BatchDispatchResult>;
	/** Create or get the shared context for this harness */
	getSharedContext(): SharedContext;
	session(): Session;
	/** Get the current session ID */
	getSessionId(): string;
	/** Get the provider manager for this harness */
	getProviderManager(): ProviderManager;
	/** Get the provider fallback chain if configured */
	getProviderFallbackChain(): ProviderFallbackChain | null;
	/** Get current provider or fall back to next in chain */
	getCurrentProvider(): Provider | null;
	/** Get configured provider with gateway rewrites */
	getConfiguredProvider(): ConfiguredProvider | null;
	/** Get the configured API gateway */
	getGatewayConfig(): GatewayConfig | null;
	/** Reset fallback chain to primary provider */
	resetProviders(): void;
	shutdown(): Promise<void>;
}

export async function init(
	agent: RubberDuckAgent,
	options?: { name?: string; config?: RubberDuckConfig }
): Promise<Harness> {
	// Initialize telemetry if configured
	const telemetryConfig = options?.config?.telemetry;
	if (telemetryConfig?.enabled !== false) {
		initTelemetry(telemetryConfig ?? {});
	}

	// Connect to MCP servers if configured
	const mcpConnections: MCPConnection[] = [];
	if (options?.config?.mcpServers && options.config.mcpServers.length > 0) {
		try {
			// Trace MCP connections
			for (const server of options.config.mcpServers) {
				const connection = await traceMCPOperation(server.name, 'connect', async () => {
					const [conn] = await connectMCPServers([server]);
					return conn;
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				mcpConnections.push(connection as any);
			}
		} catch (error) {
			console.error('Failed to connect to MCP servers:', error);
			throw error;
		}
	}

	// Merge MCP tools with agent tools
	const mcpTools = mcpConnections.flatMap((conn) =>
		conn.tools.map((tool) => ({
			name: `${conn.name}_${tool.name}`,
			description: `[MCP:${conn.name}] ${tool.description}`,
			parameters: tool.inputSchema as Record<string, unknown> | undefined,
			handler: async (params: Record<string, unknown>) => {
				// Call the MCP tool through the client
				const result = await conn.client.callTool({
					name: tool.name,
					arguments: params,
				});
				return result;
			},
		}))
	);

	// Update agent with MCP connections and merged tools
	agent.mcpConnections = mcpConnections;
	agent.tools = [...agent.tools, ...mcpTools];

	// Create sandbox if configured
	let sandbox: Sandbox | null = null;
	const sandboxConfig = options?.config?.sandbox;

	if (sandboxConfig) {
		switch (sandboxConfig.type) {
			case 'local':
				sandbox = createLocalSandbox();
				break;
			case 'virtual':
				sandbox = createVirtualSandbox();
				break;
			case 'daytona':
				if (!sandboxConfig.apiKey) {
					throw new Error('API key required for Daytona sandbox');
				}
				sandbox = createDaytonaSandbox(sandboxConfig.apiKey, sandboxConfig.baseUrl);
				break;
			case 'e2b':
				if (!sandboxConfig.apiKey) {
					throw new Error('API key required for E2B sandbox');
				}
				sandbox = createE2BSandbox(sandboxConfig.apiKey, sandboxConfig.baseUrl, sandboxConfig.template);
				break;
		}
	}

	// Initialize provider manager and fallback chain
	const providerConfig = options?.config?.provider;
	const providerId = options?.config?.providerId ?? providerConfig?.id;
	const providerManager = new ProviderManager();
	let providerFallbackChain: ProviderFallbackChain | null = null;
	let configuredProvider: ConfiguredProvider | null = null;
	let activeGateway: GatewayConfig | null = null;

	// Register custom provider if specified
	if (providerId) {
		const resolvedProvider = providerManager.resolveProvider(providerId, {
			baseURL: providerConfig?.baseURL || undefined,
			authHeaders: providerConfig?.apiKey
				? { 'Authorization': `Bearer ${providerConfig.apiKey}` }
				: undefined,
		});
		if (resolvedProvider) {
			// Custom provider is ready to use
		}
	}

	// Configure gateway if specified
	if (options?.config?.gateway && providerId) {
		activeGateway = options.config.gateway;
		configureGateway(providerId, activeGateway);
	}

	// Set up fallback chain if specified
	if (providerConfig?.fallbackProviders && providerConfig.fallbackProviders.length > 0) {
		const allProviders = providerId
			? [providerId, ...providerConfig.fallbackProviders]
			: providerConfig.fallbackProviders;
		providerFallbackChain = new ProviderFallbackChain(
			providerManager,
			allProviders,
			providerConfig.baseURL ? { [providerId!]: { baseURL: providerConfig.baseURL } } : undefined
		);
	}

	// Resolve configured provider with gateway support
	if (providerId) {
		configuredProvider = resolveProviderWithGateway(providerManager, providerId, {
			baseURL: providerConfig?.baseURL,
			authHeaders: providerConfig?.apiKey
				? { 'Authorization': `Bearer ${providerConfig.apiKey}` }
				: undefined,
		});
	}

	// Create pi-agent-core agent with LLM configuration
	const piAgent = createPiAgent({
		model: agent.model,
	});

	// Create agent registry and dispatcher for subagent/orchestration
	const agentRegistry = new AgentRegistry({
		defaultBasePath: options?.config?.basePath,
		autoCleanup: true,
	});
	const dispatcher = new Dispatcher(agentRegistry);

	// Create shared context for this harness
	const sharedContext = defaultContextFactory.createRootContext();
	// Set main agent in context
	sharedContext.set('main-agent', agent.name, 'harness');
	sharedContext.set('main-model', agent.model, 'harness');

	// Get session store configuration
	const sessionStoreConfig = options?.config?.sessionStore;

	// Resolve session store - use provided or create default
	let sessionStore: SessionStore | null = null;
	let sessionId: string;

	if (sessionStoreConfig?.store) {
		sessionStore = sessionStoreConfig.store;
		sessionId = sessionStoreConfig.sessionId ?? generateSessionId();
	} else {
		// Create in-memory session store with default TTL
		const defaultTTL = sessionStoreConfig?.defaultTTL ?? 24 * 60 * 60 * 1000;
		sessionStore = new InMemorySessionStore({ defaultTTL });
		sessionId = generateSessionId();
	}

	// Create the session with config, sandbox, and session store
	const session = createSession(piAgent, agent, options?.config, sandbox, sessionStore, sessionId);

	return {
		agent,
		getAgentRegistry: () => agentRegistry,
		createAgent: (id: string, config?: RubberDuckConfig, name?: string, tags?: string[]) => {
			const newAgent = agentRegistry.register(id, config ?? {}, name, tags);
			sharedContext.set(`agent:${id}`, newAgent.name, 'harness');
			return newAgent;
		},
		getAgent: (id: string) => agentRegistry.get(id),
		listAgents: () => agentRegistry.list(),
		hasAgent: (id: string) => agentRegistry.has(id),
		dispatch: (target: DispatchTarget, task: string, timeout?: number) =>
			dispatcher.dispatch({ target, task, timeout }),
		dispatchAsync: (targets: DispatchTarget[], task: string, timeout?: number) =>
			dispatcher.dispatchAsync(targets, task, { timeout }),
		dispatchSequential: (targets: DispatchTarget[], task: string, timeout?: number) =>
			dispatcher.dispatchSequential(targets, task, { timeout }),
		getSharedContext: () => sharedContext,
		session: () => session,
		getSessionId: () => sessionId,
		getProviderManager: () => providerManager,
		getProviderFallbackChain: () => providerFallbackChain,
		getCurrentProvider: () => providerFallbackChain?.getCurrent() ?? null,
		getConfiguredProvider: () => configuredProvider,
		getGatewayConfig: () => activeGateway,
		resetProviders: () => providerFallbackChain?.reset(),
		shutdown: async () => {
			// Stop agent registry cleanup timer
			agentRegistry.stop();
			// Close all MCP connections
			for (const conn of mcpConnections) {
				await traceMCPOperation(conn.name, 'disconnect', async () => {
					await conn.client.close();
				});
			}
			// Cleanup sandbox
			if (sandbox) {
				await sandbox.cleanup();
			}
			// Shutdown telemetry
			if (isTelemetryEnabled()) {
				await shutdownTelemetry();
			}
		},
	};
}

function createSession(
	piAgent: Agent,
	duckAgent: RubberDuckAgent,
	config?: RubberDuckConfig,
	sandbox?: Sandbox | null,
	sessionStore?: SessionStore | null,
	sessionId?: string
): Session {
	// Merge environment variables with config overrides
	const sessionEnv = { ...duckAgent.env, ...(config?.env ?? {}) };
	const shellTimeout = config?.shellTimeout ?? 30000;
	const basePath = config?.basePath;

	// Initialize skill loader and cached skills
	const skillLoader = new SkillLoader(basePath);
	const loadedSkillsCache = new Map<string, Skill>();

	// Pre-load agent skills
	(async () => {
		for (const skillName of duckAgent.skills) {
			try {
				const skill = await skillLoader.loadSkill(skillName);
				loadedSkillsCache.set(skillName, skill);
			} catch (error) {
				console.warn(`Failed to preload skill '${skillName}':`, error);
			}
		}
	})();

	// Session message history for persistence
	let messageHistory: SessionMessage[] = [];

	// Load existing session data if session store and ID are provided
	(async () => {
		if (sessionStore && sessionId) {
			const existingData = await sessionStore.load(sessionId);
			if (existingData && existingData.messages.length > 0) {
				messageHistory = existingData.messages;
			}
		}
	})();

	// Helper to save session state
	const saveSession = async (): Promise<void> => {
		if (sessionStore && sessionId) {
			const ttl = config?.sessionStore?.defaultTTL ?? 24 * 60 * 60 * 1000;
			const data = createSessionData(sessionId, messageHistory, {
				model: duckAgent.model,
				skills: duckAgent.skills,
				env: sessionEnv,
			}, ttl);
			await sessionStore.save(sessionId, data);
		}
	};

	return {
		async prompt(message: string): Promise<string> {
			// Add user message to history
			const userMessage: SessionMessage = {
				id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
				role: 'user',
				content: message,
				timestamp: Date.now(),
			};
			messageHistory.push(userMessage);

			// Trace the prompt execution
			const result = await tracePrompt(duckAgent.model, message.length, async () => {
				// Use pi-agent-core's turn system
				const turn: Turn = {
					type: 'user',
					content: message,
					attachments: [],
				};

				const result: TurnResult = await piAgent.run(turn);

				if (result.type === 'error') {
					throw new Error(result.message);
				}

				if (result.type === 'result') {
					return result.message ?? 'No response';
				}

				return 'No response';
			});

			// Add assistant response to history
			const assistantMessage: SessionMessage = {
				id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
				role: 'assistant',
				content: result,
				timestamp: Date.now(),
			};
			messageHistory.push(assistantMessage);

			// Save session state after successful response
			await saveSession();

			return result;
		},

		async runSkill(skillName: string, context?: Record<string, unknown>): Promise<string> {
			// Trace skill execution
			return traceSkillExecution(skillName, async () => {
				// Load skill if not cached
				if (!loadedSkillsCache.has(skillName)) {
					try {
						const skill = await skillLoader.loadSkill(skillName);
						loadedSkillsCache.set(skillName, skill);
					} catch (error) {
						return `Error: Skill '${skillName}' not found or failed to load: ${error}`;
					}
				}

				const skill = loadedSkillsCache.get(skillName)!;
				const contextStr = context ? JSON.stringify(context, null, 2) : 'No context provided';

				// Return skill instructions with context for execution
				return `Executing skill: ${skill.name}\n\nDescription: ${skill.description}\n\nInstructions:\n${skill.instructions}\n\nContext:\n${contextStr}`;
			});
		},

		async getSkillInstructions(skillName: string): Promise<string> {
			// Load skill if not cached
			if (!loadedSkillsCache.has(skillName)) {
				try {
					const skill = await skillLoader.loadSkill(skillName);
					loadedSkillsCache.set(skillName, skill);
				} catch (error) {
					return `Error: Skill '${skillName}' not found or failed to load: ${error}`;
				}
			}

			const skill = loadedSkillsCache.get(skillName)!;
			return skill.instructions;
		},

		async listSkills(): Promise<string[]> {
			// First return configured skills
			const configuredSkills = duckAgent.skills;

			// Then add any available skills from the skills directory
			const availableSkills = await skillLoader.listSkills();

			// Combine and deduplicate
			const allSkills = new Set([...configuredSkills, ...availableSkills]);
			return Array.from(allSkills);
		},

		// Shell execution - use sandbox if available, otherwise use real shell
		async shell(command: string, cwd?: string): Promise<ExecResult> {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await traceShellCommand(command, cwd, async () => {
				if (sandbox && sandbox.isAlive()) {
					const res = await sandbox.shell.exec(command, {
						cwd,
						timeout: shellTimeout,
						env: sessionEnv,
					});
					return {
						stdout: res.stdout,
						stderr: res.stderr,
						exitCode: res.exitCode,
						timedOut: res.timedOut,
					};
				}
				const execOptions: ExecOptions = {
					cwd,
					env: sessionEnv,
					timeout: shellTimeout,
				};
				return exec(command, cwd, execOptions);
			}) as { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean };
			// Ensure timedOut is always present
			return {
				...result,
				timedOut: result.timedOut ?? false,
			};
		},

		// Filesystem operations - use sandbox fs if available, otherwise use real fs
		async readFile(path: string, options?: ReadOptions): Promise<string | Buffer> {
			return traceFsOperation('read', path, async () => {
				if (sandbox && sandbox.isAlive()) {
					const content = await sandbox.fs.read(path);
					return options?.encoding === 'utf-8' || !options?.encoding ? content : Buffer.from(content);
				}
				return read(path, options);
			}) as Promise<string | Buffer>;
		},

		async writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
			return traceFsOperation('write', path, async () => {
				if (sandbox && sandbox.isAlive()) {
					const strContent = typeof content === 'string' ? content : content.toString('utf-8');
					return sandbox.fs.write(path, strContent);
				}
				return write(path, content, options);
			}) as Promise<void>;
		},

		async mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<string | undefined> {
			return traceFsOperation('mkdir', path, async () => {
				if (sandbox && sandbox.isAlive()) {
					await sandbox.fs.mkdir(path, { recursive: options?.recursive });
					return path;
				}
				return mk(path, options);
			}) as Promise<string | undefined>;
		},

		async readDir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | FileInfo[]> {
			return traceFsOperation('listDir', path, async () => {
				if (sandbox && sandbox.isAlive()) {
					const entries = await sandbox.fs.listDir(path);
					if (options?.withFileTypes) {
						// Return basic FileInfo for sandbox
						const results: FileInfo[] = await Promise.all(
							entries.map(async (name) => {
								const fullPath = join(path, name);
								try {
									const content = await sandbox!.fs.read(fullPath);
									return {
										path: fullPath,
										name,
										isDirectory: false,
										isFile: true,
										size: content.length,
										modified: new Date(),
										created: new Date(),
									};
								} catch {
									return {
										path: fullPath,
										name,
										isDirectory: true,
										isFile: false,
										size: 0,
										modified: new Date(),
										created: new Date(),
									};
								}
							})
						);
						return results;
					}
					return entries;
				}
				return readDir(path, options);
			}) as Promise<string[] | FileInfo[]>;
		},

		pathExists(path: string): boolean {
			if (sandbox && sandbox.isAlive()) {
				return sandbox.fs.exists(path);
			}
			return exists(path);
		},

		async stat(path: string): Promise<ReturnType<typeof getStats>> {
			if (sandbox && sandbox.isAlive()) {
				// Simplified stat for sandbox - returns mock stats
				const exists = sandbox.fs.exists(path);
				if (!exists) {
					throw new Error(`Path not found: ${path}`);
				}
				try {
					const content = await sandbox.fs.read(path);
					return {
						isFile: () => true,
						isDirectory: () => false,
						size: content.length,
						mtime: new Date(),
						ctime: new Date(),
					} as unknown as ReturnType<typeof getStats>;
				} catch {
					return {
						isFile: () => false,
						isDirectory: () => true,
						size: 0,
						mtime: new Date(),
						ctime: new Date(),
					} as unknown as ReturnType<typeof getStats>;
				}
			}
			return getStats(path);
		},

		async copyFile(src: string, dest: string): Promise<void> {
			return traceFsOperation('copy', src, async () => {
				if (sandbox && sandbox.isAlive()) {
					const content = await sandbox.fs.read(src);
					return sandbox.fs.write(dest, content);
				}
				return copy(src, dest);
			}) as Promise<void>;
		},

		async deleteFile(path: string): Promise<void> {
			return traceFsOperation('delete', path, async () => {
				if (sandbox && sandbox.isAlive()) {
					return sandbox.fs.remove(path);
				}
				return remove(path);
			}) as Promise<void>;
		},

		async deleteDir(path: string): Promise<void> {
			// Sandboxes typically don't support full rm -rf
			if (sandbox && sandbox.isAlive()) {
				throw new Error('deleteDir not supported in sandbox mode');
			}
			return removeDir(path);
		},

		async moveFile(src: string, dest: string): Promise<void> {
			return traceFsOperation('move', src, async () => {
				if (sandbox && sandbox.isAlive()) {
					const content = await sandbox.fs.read(src);
					await sandbox.fs.write(dest, content);
					return sandbox.fs.remove(src);
				}
				return move(src, dest);
			}) as Promise<void>;
		},

		async glob(basePath: string, options?: GlobOptions): Promise<string[]> {
			return traceFsOperation('glob', basePath, async () => {
				if (sandbox && sandbox.isAlive()) {
					const pattern = options?.pattern ?? '**/*';
					const cwd = options?.cwd ?? basePath;
					return sandbox.fs.glob(pattern, cwd);
				}
				return glob(basePath, options);
			}) as Promise<string[]>;
		},

		resolve(...paths: string[]): string {
			return resolvePath(...paths);
		},

		join(...paths: string[]): string {
			return joinPath(...paths);
		},

		async getHistory(): Promise<SessionMessage[]> {
			return [...messageHistory];
		},

		async clearHistory(): Promise<void> {
			messageHistory = [];
			await saveSession();
		},

		async save(): Promise<void> {
			await saveSession();
		},
	};
}

// Note: Agent, Turn, TurnResult types are defined as local stubs
// ModelOptions type is defined as a local stub

// Re-export sandbox connector types and functions
export {
	createSandbox,
	createLocalSandbox,
	createVirtualSandbox,
	createDaytonaSandbox,
	createE2BSandbox,
} from './connectors/index.js';
export type {
	Sandbox,
	SandboxShell,
	SandboxFs,
	SandboxConnectorType,
	SandboxConnectorOptions,
	ShellResult,
	DaytonaSandbox,
	E2BSandbox,
	VirtualFilesystem,
} from './connectors/index.js';

// Re-export session store types and implementations
export {
	InMemorySessionStore,
	DurableObjectSessionStore,
	generateSessionId,
	createSessionData,
	turnToMessage,
	messageToTurn,
} from './session-store.js';
export type {
	SessionStore,
	SessionStoreConfig,
	SessionData,
	SessionMessage,
	SessionMetadata,
} from './session-store.js';

// Re-export telemetry functions and types
export {
	initTelemetry,
	shutdownTelemetry,
	isTelemetryEnabled,
	tracePrompt,
	traceSkillExecution,
	traceShellCommand,
	traceFsOperation,
	traceMCPOperation,
} from './telemetry.js';
export type { TelemetryConfig } from './telemetry.js';
