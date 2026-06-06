// @kishkindhalabs/hanumate-runtime - Core agent engine
// Built on top of pi-agent-core (@earendil-works/pi-agent-core)

// Core exports
export { createAgent, createAgentWithId, type HanumateAgent, type Tool, loadAgentSkills } from './harness.js';
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
	mcpToolsToHanumate,
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

// Convoys - Work bundling system
export {
	ConvoyManager,
	createConvoyManager,
	ConvoyStore,
	ConvoyStoreError,
	DEFAULT_CONVOYS_DIR,
} from './convoys/index.js';
export type {
	Convoy,
	ConvoyStatus,
	CreateConvoyOptions,
	UpdateConvoyOptions,
	ListConvoyOptions,
	ConvoyChangeEvent,
	ConvoyListener,
} from './convoys/index.js';

// Hooks - Persistent work queue for agents
export {
	HookStore,
	InMemoryHookStore,
	HookManager,
	createHookManager,
	generateHookId,
	createHook,
} from './hooks/index.js';
export type {
	Hook,
	HookStatus,
	HookCreateOptions,
	HookUpdateOptions,
	HookManagerConfig,
} from './hooks/index.js';

// Beads - Git-backed issue tracking system
export {
	type Bead,
	type BeadType,
	type BeadPriority,
	type BeadStatus,
	type CreateBeadInput,
	type UpdateBeadInput,
	type BeadFilter,
	type BeadStore,
	type CreateBeadOptions,
	type UpdateBeadOptions,
	type ListBeadsOptions,
	type BeadCommandResult,
	generateBeadId,
	isValidBeadId,
	getDefaultStatus,
	isBlocked,
	sortByPriority,
	formatBead,
	JsonBeadStore,
	createBeadStore,
	createInMemoryBeadStore,
	BeadCommands,
	createBeadCommands,
	formatBeadForCLI,
	formatBeadList,
} from './beads/index.js';

// Mail - Persistent agent messaging
export { MailStore, createMailStore, createInMemoryMailStore } from './mail/index.js';
export type { Mail, MailConfig, MailFilter } from './mail/index.js';

// Nudge - WebSocket-based real-time agent communication
export { NudgeClient, NudgeServer } from './nudge/index.js';
export type {
	NudgeMessage,
	NudgeType,
	NudgePayload,
	NudgeConfig,
	NudgeConnection,
	NudgeClientConfig,
} from './nudge/index.js';

// Watchdog - Process health monitoring
export { Witness, createWitness, Deacon, createDeacon } from './watchdog/index.js';
export { runBootDog, runCleanupDog, runHealthDog } from './watchdog/dogs/index.js';
export type {
	WitnessConfig,
	WitnessConfigOptions,
	DeaconConfig,
	DeaconId,
	WitnessId,
	DogId,
	WitnessReport,
	DeaconReport,
	DogTask,
	DogConfig,
	PatrolCycle,
	PatrolCallback,
	DogDispatchCallback,
	HealthChangeCallback,
	HealthStatus,
} from './watchdog/index.js';
export type {
	BootCheck,
	WitnessReportSummary,
	HealthStats,
	DogResult,
	BootDogOptions,
	BootDogReport,
	CleanupDogOptions,
	CleanupDogReport,
	HealthDogOptions,
	HealthDogReport,
} from './watchdog/dogs/index.js';

// Refinery - Bors-style merge queue
export { Refinery, RefineryQueue, CiGate, LintGate, CoverageGate } from './refinery/index.js';
export type {
	MergeRequest,
	MergeStatus,
	MergeRequestId,
	VerificationGate,
	GateResult,
	RefineryConfig,
	RefineryStatus,
	QueueOptions,
	TestResult,
	BisectResult,
} from './refinery/index.js';

// Escalation - Severity-routed issue escalation
export { EscalationService } from './escalation/index.js';
export type {
	Escalation,
	EscalationId,
	Severity,
	EscalationStatus,
	EscalationRoute,
	EscalationOptions,
} from './escalation/index.js';
export {
	SEVERITY_PRIORITY,
	DEFAULT_ROUTES,
	isMoreSevere,
	getHighestSeverity,
} from './escalation/index.js';

// Seance - Session discovery and recovery
export { Seance } from './recovery/index.js';
export type {
	SessionRecord,
	SessionId,
	SessionEvent,
	SessionEventType,
	SessionQuery,
	SeanceOptions,
	PredecessorQuestion,
	PredecessorAnswer,
} from './recovery/index.js';
export {
	getSessionDuration,
	isSessionStale,
} from './recovery/index.js';

// CLI - Command-line interface
export type {
	Command,
	CommandRegistry,
	Option,
	GlobalOptions,
	ParsedArgs,
	CliConfig,
	CommandHandler,
	OptionType,
} from './cli/cli-types.js';
export { run as runCLI, InMemoryCommandRegistry, parseArgs, findCommand } from './cli/index.js';

// HTTP Server - Hono-based HTTP server
export {
	createServer,
	type HttpServerConfig,
	type HttpServer,
	type HealthResponse,
	type AgentPromptRequest,
	type AgentPromptResponse,
	type SessionInfoResponse,
} from './server/index.js';

// WebSocket - Real-time agent communication
export {
	WebSocketHandler,
	createWebSocketHandler,
	type WebSocketHandlerConfig,
	type WebSocketMessageType,
	type WebSocketIncomingMessage,
	type WebSocketOutgoingMessage,
	type WebSocketEventHandlers,
} from './server/index.js';

// Workflow - Workflow routing system
export {
	WorkflowRouter,
	createWorkflowRouter,
	type WorkflowDefinition,
	type WorkflowStep,
	type WorkflowStepHandler,
	type WorkflowContext,
	type WorkflowUser,
	type WorkflowStepResult,
	type WorkflowResult,
	type WorkflowRegistration,
	type Middleware,
	type AuthMiddlewareOptions,
	type LoggingMiddlewareOptions,
	type WorkflowLogEntry,
	type WorkflowRouterConfig,
} from './server/index.js';

// Message Trigger - Message-driven agent trigger
export {
	MessageTrigger,
	createMessageTrigger,
	type MessageTriggerConfig,
	type IncomingMessage,
	type RoutingResult,
} from './server/index.js';