// @rubberduck/runtime - Core agent engine
// Built on top of pi-agent-core (@earendil-works/pi-agent-core)

// Core exports
export { createAgent, createAgentWithId, type RubberDuckAgent, type Tool, loadAgentSkills } from './harness.js';
export { init, type Harness, type Session } from './harness.js';

// Agent registry for subagent/orchestration
export {
	AgentRegistry,
} from './agents.js';
export type {
	AgentRegistration,
	AgentRegistryOptions,
} from './agents.js';

// Dispatch system for multi-agent task execution
export {
	Dispatcher,
	dispatch,
	dispatchAsync,
	dispatchSequential,
} from './dispatch.js';
export type {
	DispatchTarget,
	DispatchOptions,
	DispatchResult,
	BatchDispatchResult,
} from './dispatch.js';

export { SkillLoader, getSkillLoader } from './skills.js';
export * from './types.js';

// MCP (Model Context Protocol) support
export {
	connectMCP,
	connectMCPServers,
	mcpToolsToRubberDuck,
	type MCPConfig,
	type MCPServerConfig,
	type MCPToolDefinition,
	type MCPConnection,
} from './mcp.js';

// Shell execution
export {
	exec,
	execStream,
	getDefaultEnv,
	type ExecResult,
	type ExecOptions,
} from './shell.js';

// Filesystem operations
export {
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
	type FSError,
} from './fs.js';

// Sandbox connectors
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

// Session persistence
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

// Provider abstraction
export {
	ProviderManager,
	ProviderFallbackChain,
	PROVIDER_ENV_KEYS,
	loadApiKeyFromEnv,
	loadBaseUrlFromEnv,
} from './providers.js';
export type {
	ProviderConfig,
	Provider,
} from './providers.js';

// Provider configuration with enterprise gateway support
export {
	configureProvider,
	getConfiguredProvider,
	listConfiguredProviders,
	removeProviderConfig,
	configureGateway,
	getGatewayConfig,
	removeGatewayConfig,
	resolveProviderWithGateway,
	registerEnterpriseProvider,
	createProviderConfig,
	clearProviderConfigs,
	ENTERPRISE_PRESETS,
} from './provider-config.js';
export type {
	GatewayConfig,
	ConfiguredProvider,
} from './provider-config.js';

// OpenTelemetry integration
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

// Shared context for context propagation
export {
	SharedContext,
	ResultCapture,
	createSharedContext,
	createResultCapture,
	SharedContextFactory,
	defaultContextFactory,
} from './shared-context.js';
export type {
	ContextEntry,
	CapturedResult,
	PropagationOptions,
	ResultCaptureConfig,
	ContextTrace,
} from './shared-context.js';