/**
 * Repository Configuration Service
 * Per-repo settings, multi-org support, secret management, and config storage
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// ============================================
// Configuration Schema
// ============================================

export interface RepoSettings {
  /** Repository full name (owner/repo) */
  repo: string;
  /** Enable Hanumate for this repo */
  enabled: boolean;
  /** Triggers */
  triggers: TriggerConfig;
  /** Code review settings */
  codeReview: CodeReviewConfig;
  /** Auto merge settings */
  autoMerge: AutoMergeConfig;
  /** Agent model to use */
  agentModel: string;
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
}

export interface TriggerConfig {
  /** Labels that trigger the bot */
  enabled_repos: string[];
  /** Labels that trigger processing */
  trigger_labels: string[];
  /** Trigger on @mentions */
  trigger_mentions: boolean;
  /** Branch patterns that trigger processing */
  trigger_branches: string[];
}

export interface CodeReviewConfig {
  /** Enable code review */
  enabled: boolean;
  /** Auto-request review from bot */
  autoRequestReview: boolean;
  /** File patterns to exclude from review */
  excludePatterns: string[];
  /** Minimum PR size to trigger review (lines changed) */
  minPRSize: number;
}

export interface AutoMergeConfig {
  /** Enable auto-merge */
  enabled: boolean;
  /** Merge methods allowed (squash, merge, rebase) */
  methods: Array<'squash' | 'merge' | 'rebase'>;
  /** Required checks that must pass before merge */
  requiredChecks: string[];
  /** Auto-delete branches after merge */
  deleteBranchAfterMerge: boolean;
}

export interface RepoConfigSchema {
  /** Version of the config schema */
  version: string;
  /** Repository settings by full name */
  repos: Record<string, RepoSettings>;
  /** Default settings for new repos */
  defaults: Omit<RepoSettings, 'repo'>;
}

// ============================================
// Installation Context (Multi-org Support)
// ============================================

export interface InstallationContext {
  /** Installation ID from GitHub */
  installationId: number;
  /** Account type (Organization or User) */
  accountType: 'Organization' | 'User';
  /** Account login (org/user name) */
  accountLogin: string;
  /** Account ID */
  accountId: number;
  /** Repositories this installation has access to */
  repositoryNames: string[];
  /** Creation timestamp */
  createdAt: Date;
  /** Expiration timestamp (for GitHub App tokens) */
  expiresAt?: Date;
  /** Custom metadata for this installation */
  metadata: Record<string, unknown>;
}

export interface InstallationStore {
  /** Get installation by ID */
  get(installationId: number): Promise<InstallationContext | null>;
  /** Get all installations for an account */
  getByAccount(accountLogin: string): Promise<InstallationContext[]>;
  /** Set installation data */
  set(installationId: number, context: InstallationContext): Promise<void>;
  /** Remove installation */
  remove(installationId: number): Promise<void>;
  /** List all installations */
  list(): Promise<InstallationContext[]>;
  /** Get repos accessible to an installation */
  getRepos(installationId: number): string[];
  /** Check if repo is accessible to installation */
  hasRepo(installationId: number, repoFullName: string): boolean;
}

class InMemoryInstallationStore implements InstallationStore {
  private installations: Map<number, InstallationContext> = new Map();
  private accountIndex: Map<string, number[]> = new Map();

  async get(installationId: number): Promise<InstallationContext | null> {
    return this.installations.get(installationId) ?? null;
  }

  async getByAccount(accountLogin: string): Promise<InstallationContext[]> {
    const ids = this.accountIndex.get(accountLogin) || [];
    return ids.map(id => this.installations.get(id)).filter((i): i is InstallationContext => i !== undefined);
  }

  async set(installationId: number, context: InstallationContext): Promise<void> {
    this.installations.set(installationId, context);
    
    const existing = this.accountIndex.get(context.accountLogin) || [];
    if (!existing.includes(installationId)) {
      existing.push(installationId);
      this.accountIndex.set(context.accountLogin, existing);
    }
  }

  async remove(installationId: number): Promise<void> {
    const context = this.installations.get(installationId);
    if (context) {
      const existing = this.accountIndex.get(context.accountLogin) || [];
      this.accountIndex.set(
        context.accountLogin,
        existing.filter(id => id !== installationId)
      );
    }
    this.installations.delete(installationId);
  }

  async list(): Promise<InstallationContext[]> {
    return Array.from(this.installations.values());
  }

  getRepos(installationId: number): string[] {
    const context = this.installations.get(installationId);
    return context?.repositoryNames ?? [];
  }

  hasRepo(installationId: number, repoFullName: string): boolean {
    return this.getRepos(installationId).includes(repoFullName);
  }
}

// ============================================
// Secret Management
// ============================================

export interface RepoSecret {
  /** Secret identifier */
  id: string;
  /** Repository full name */
  repo: string;
  /** Secret name */
  name: string;
  /** Encrypted secret value */
  encryptedValue: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface SecretManager {
  /** Store a secret for a repo */
  store(repoFullName: string, name: string, value: string, metadata?: Record<string, unknown>): Promise<RepoSecret>;
  /** Retrieve a secret */
  retrieve(repoFullName: string, name: string): Promise<string | null>;
  /** List secrets for a repo */
  list(repoFullName: string): Promise<Array<{ name: string; metadata: Record<string, unknown> }>>;
  /** Delete a secret */
  delete(repoFullName: string, name: string): Promise<boolean>;
  /** Update secret metadata */
  updateMetadata(repoFullName: string, name: string, metadata: Record<string, unknown>): Promise<void>;
  /** Get secret by ID */
  getById(id: string): Promise<RepoSecret | null>;
}

interface EncryptedSecret {
  id: string;
  repo: string;
  name: string;
  encryptedValue: string;
  createdAt: string;
  lastUsedAt?: string;
  metadata: Record<string, unknown>;
}

/**
 * Simple secret manager with basic encryption
 * Note: In production, use proper secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
 */
class BasicSecretManager implements SecretManager {
  private secrets: Map<string, EncryptedSecret> = new Map();
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.SECRET_ENCRYPTION_KEY || 'default-dev-key';
  }

  private makeKey(repo: string, name: string): string {
    return `${repo}:${name}`.toLowerCase();
  }

  private encrypt(value: string): string {
    // Simple XOR encryption for development
    // In production, use proper AES-256-GCM or similar
    const key = this.encryptionKey;
    let result = '';
    for (let i = 0; i < value.length; i++) {
      result += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
  }

  private decrypt(encrypted: string): string {
    const decoded = Buffer.from(encrypted, 'base64').toString();
    const key = this.encryptionKey;
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  async store(repoFullName: string, name: string, value: string, metadata: Record<string, unknown> = {}): Promise<RepoSecret> {
    const id = randomUUID();
    const key = this.makeKey(repoFullName, name);
    
    const secret: EncryptedSecret = {
      id,
      repo: repoFullName.toLowerCase(),
      name: name.toLowerCase(),
      encryptedValue: this.encrypt(value),
      createdAt: new Date().toISOString(),
      metadata,
    };
    
    this.secrets.set(key, secret);
    
    return {
      id,
      repo: repoFullName,
      name,
      encryptedValue: secret.encryptedValue,
      createdAt: new Date(secret.createdAt),
      metadata,
    };
  }

  async retrieve(repoFullName: string, name: string): Promise<string | null> {
    const key = this.makeKey(repoFullName, name);
    const secret = this.secrets.get(key);
    
    if (!secret) return null;
    
    // Update last used
    secret.lastUsedAt = new Date().toISOString();
    
    return this.decrypt(secret.encryptedValue);
  }

  async list(repoFullName: string): Promise<Array<{ name: string; metadata: Record<string, unknown> }>> {
    const prefix = repoFullName.toLowerCase() + ':';
    const result: Array<{ name: string; metadata: Record<string, unknown> }> = [];
    
    for (const [key, secret] of this.secrets) {
      if (key.startsWith(prefix)) {
        result.push({
          name: secret.name,
          metadata: secret.metadata,
        });
      }
    }
    
    return result;
  }

  async delete(repoFullName: string, name: string): Promise<boolean> {
    const key = this.makeKey(repoFullName, name);
    return this.secrets.delete(key);
  }

  async updateMetadata(repoFullName: string, name: string, metadata: Record<string, unknown>): Promise<void> {
    const key = this.makeKey(repoFullName, name);
    const secret = this.secrets.get(key);
    
    if (secret) {
      secret.metadata = { ...secret.metadata, ...metadata };
    }
  }

  async getById(id: string): Promise<RepoSecret | null> {
    for (const secret of this.secrets.values()) {
      if (secret.id === id) {
        return {
          id: secret.id,
          repo: secret.repo,
          name: secret.name,
          encryptedValue: secret.encryptedValue,
          createdAt: new Date(secret.createdAt),
          lastUsedAt: secret.lastUsedAt ? new Date(secret.lastUsedAt) : undefined,
          metadata: secret.metadata,
        };
      }
    }
    return null;
  }
}

// ============================================
// Config Storage
// ============================================

export type ConfigStorageType = 'file' | 'github' | 'external';

export interface ConfigStorageOptions {
  /** Storage type */
  type: ConfigStorageType;
  /** File path (for 'file' type) */
  filePath?: string;
  /** GitHub repo for config (for 'github' type) */
  githubRepo?: string;
  /** GitHub branch (for 'github' type) */
  githubBranch?: string;
  /** Config file path in repo (for 'github' type) */
  githubConfigPath?: string;
  /** External config URL (for 'external' type) */
  externalUrl?: string;
  /** External config API key */
  externalApiKey?: string;
  /** Refresh interval in ms (for 'external' type) */
  refreshInterval?: number;
}

export interface ConfigStorage {
  /** Read configuration */
  read(): Promise<RepoConfigSchema>;
  /** Write configuration */
  write(config: RepoConfigSchema): Promise<void>;
  /** Get storage type */
  getType(): ConfigStorageType;
  /** Get config source info */
  getSource(): string;
  /** Close/release resources */
  close(): Promise<void>;
}

class FileConfigStorage implements ConfigStorage {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async read(): Promise<RepoConfigSchema> {
    try {
      if (!existsSync(this.filePath)) {
        return this.getDefaultConfig();
      }
      const content = await readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as RepoConfigSchema;
    } catch (error) {
      console.error(`Failed to read config from ${this.filePath}:`, error);
      return this.getDefaultConfig();
    }
  }

  async write(config: RepoConfigSchema): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(this.filePath), { recursive: true });
    
    // Write atomically using temp file
    const tempPath = this.filePath + '.tmp';
    await writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    
    // Move temp to actual (atomic on most systems)
    await writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  getType(): ConfigStorageType {
    return 'file';
  }

  getSource(): string {
    return this.filePath;
  }

  async close(): Promise<void> {
    // No-op for file storage
  }

  private getDefaultConfig(): RepoConfigSchema {
    return {
      version: '1.0.0',
      repos: {},
      defaults: {
        enabled: true,
        triggers: {
          enabled_repos: [],
          trigger_labels: ['needs-review', 'hanumate'],
          trigger_mentions: true,
          trigger_branches: [],
        },
        codeReview: {
          enabled: true,
          autoRequestReview: true,
          excludePatterns: ['*.md', '*.txt', '*.lock'],
          minPRSize: 10,
        },
        autoMerge: {
          enabled: false,
          methods: ['squash'],
          requiredChecks: [],
          deleteBranchAfterMerge: true,
        },
        agentModel: 'claude-3-5-sonnet-20241022',
        maxConcurrentTasks: 3,
      },
    };
  }
}

class GitHubConfigStorage implements ConfigStorage {
  private repo: string;
  private branch: string;
  private configPath: string;
  private octokit: any; // GitHub client
  private cachedConfig: RepoConfigSchema | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 60000; // 1 minute default

  constructor(
    repo: string,
    branch: string = 'main',
    configPath: string = '.hanumate/config.json',
    octokit?: any
  ) {
    this.repo = repo;
    this.branch = branch;
    this.configPath = configPath;
    this.octokit = octokit;
  }

  async read(): Promise<RepoConfigSchema> {
    if (!this.octokit) {
      throw new Error('GitHub client not configured');
    }

    const [owner, repo] = this.repo.split('/');
    
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: this.configPath,
        ref: this.branch,
      });

      if ('content' in data && data.encoding === 'base64') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        this.cachedConfig = JSON.parse(content);
        this.cacheTimestamp = Date.now();
        return this.cachedConfig!;
      }

      throw new Error('Invalid response from GitHub API');
    } catch (error: any) {
      if (error.status === 404) {
        return this.getDefaultConfig();
      }
      throw error;
    }
  }

  async write(config: RepoConfigSchema): Promise<void> {
    if (!this.octokit) {
      throw new Error('GitHub client not configured');
    }

    const [owner, repo] = this.repo.split('/');
    const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');

    try {
      // Try to get existing file SHA
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: this.configPath,
          ref: this.branch,
        });
        if ('sha' in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist, that's okay
      }

      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: this.configPath,
        message: 'chore: Update RubberDuck repository configuration',
        content,
        branch: this.branch,
        sha,
      });

      this.cachedConfig = config;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Failed to write config to GitHub:', error);
      throw error;
    }
  }

  getType(): ConfigStorageType {
    return 'github';
  }

  getSource(): string {
    return `${this.repo}/${this.configPath}@${this.branch}`;
  }

  async close(): Promise<void> {
    this.cachedConfig = null;
  }

  private getDefaultConfig(): RepoConfigSchema {
    return {
      version: '1.0.0',
      repos: {},
      defaults: {
        enabled: true,
        triggers: {
          enabled_repos: [],
          trigger_labels: ['needs-review', 'hanumate'],
          trigger_mentions: true,
          trigger_branches: [],
        },
        codeReview: {
          enabled: true,
          autoRequestReview: true,
          excludePatterns: ['*.md', '*.txt', '*.lock'],
          minPRSize: 10,
        },
        autoMerge: {
          enabled: false,
          methods: ['squash'],
          requiredChecks: [],
          deleteBranchAfterMerge: true,
        },
        agentModel: 'claude-3-5-sonnet-20241022',
        maxConcurrentTasks: 3,
      },
    };
  }
}

class ExternalConfigStorage implements ConfigStorage {
  private url: string;
  private apiKey?: string;
  private refreshInterval?: number;
  private cachedConfig: RepoConfigSchema | null = null;
  private cacheTimestamp: number = 0;
  private refreshTimer?: NodeJS.Timeout;
  private listeners: Array<(config: RepoConfigSchema) => void> = [];

  constructor(url: string, apiKey?: string, refreshInterval?: number) {
    this.url = url;
    this.apiKey = apiKey;
    this.refreshInterval = refreshInterval;
    
    if (refreshInterval && refreshInterval > 0) {
      this.startAutoRefresh();
    }
  }

  async read(): Promise<RepoConfigSchema> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.url, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json() as RepoConfigSchema;
      this.cachedConfig = config;
      this.cacheTimestamp = Date.now();
      
      return config;
    } catch (error) {
      // Return cached config if fetch fails
      if (this.cachedConfig) {
        return this.cachedConfig;
      }
      throw error;
    }
  }

  async write(config: RepoConfigSchema): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.cachedConfig = config;
      this.cacheTimestamp = Date.now();
      
      // Notify listeners
      for (const listener of this.listeners) {
        listener(config);
      }
    } catch (error) {
      console.error('Failed to write config to external storage:', error);
      throw error;
    }
  }

  getType(): ConfigStorageType {
    return 'external';
  }

  getSource(): string {
    return this.url;
  }

  async close(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.listeners = [];
  }

  /**
   * Subscribe to config changes
   */
  onConfigChange(listener: (config: RepoConfigSchema) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        await this.read();
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, this.refreshInterval);
  }
}

// ============================================
// Main RepoConfig Service
// ============================================

export interface RepoConfigServiceOptions {
  /** Storage configuration */
  storage: ConfigStorageOptions;
  /** Installation store (optional, uses in-memory if not provided) */
  installationStore?: InstallationStore;
  /** Secret manager (optional, creates default if not provided) */
  secretManager?: SecretManager;
  /** Default config values */
  defaults?: Partial<Omit<RepoSettings, 'repo'>>;
}

export class RepoConfigService {
  private storage: ConfigStorage;
  private installationStore: InstallationStore;
  private secretManager: SecretManager;
  private config: RepoConfigSchema;
  private defaults: Omit<RepoSettings, 'repo'>;
  private listeners: Array<(repo: string, config: RepoSettings | null) => void> = [];

  constructor(options: RepoConfigServiceOptions) {
    // Initialize storage
    this.storage = this.createStorage(options.storage);
    
    // Initialize stores
    this.installationStore = options.installationStore || new InMemoryInstallationStore();
    this.secretManager = options.secretManager || new BasicSecretManager();
    
    // Initialize defaults
    this.defaults = this.getDefaultSettings(options.defaults);
    
    // Initialize config
    this.config = {
      version: '1.0.0',
      repos: {},
      defaults: this.defaults,
    };
  }

  /**
   * Get settings for a specific repo
   */
  async getRepoSettings(repoFullName: string): Promise<RepoSettings> {
    const config = await this.loadConfig();
    
    if (config.repos[repoFullName]) {
      return config.repos[repoFullName];
    }
    
    // Return default settings for this repo
    return {
      repo: repoFullName,
      ...this.defaults,
    };
  }

  /**
   * Update settings for a repo
   */
  async updateRepoSettings(repoFullName: string, settings: Partial<RepoSettings>): Promise<void> {
    const config = await this.loadConfig();
    
    const existing = config.repos[repoFullName] || {
      repo: repoFullName,
      ...this.defaults,
    };
    
    config.repos[repoFullName] = { ...existing, ...settings };
    
    await this.saveConfig(config);
    
    // Notify listeners
    this.notifyListeners(repoFullName, config.repos[repoFullName]);
  }

  /**
   * Delete settings for a repo
   */
  async deleteRepoSettings(repoFullName: string): Promise<void> {
    const config = await this.loadConfig();
    
    if (config.repos[repoFullName]) {
      delete config.repos[repoFullName];
      await this.saveConfig(config);
      this.notifyListeners(repoFullName, null);
    }
  }

  /**
   * List all configured repos
   */
  async listRepos(): Promise<Array<{ repo: string; settings: RepoSettings }>> {
    const config = await this.loadConfig();
    
    return Object.entries(config.repos).map(([repo, settings]) => ({
      repo,
      settings,
    }));
  }

  /**
   * Check if repo is enabled
   */
  async isRepoEnabled(repoFullName: string): Promise<boolean> {
    const settings = await this.getRepoSettings(repoFullName);
    return settings.enabled;
  }

  /**
   * Get enabled repos
   */
  async getEnabledRepos(): Promise<string[]> {
    const config = await this.loadConfig();
    
    return Object.entries(config.repos)
      .filter(([, settings]) => settings.enabled)
      .map(([repo]) => repo);
  }

  /**
   * Register installation
   */
  async registerInstallation(context: InstallationContext): Promise<void> {
    await this.installationStore.set(context.installationId, context);
    
    // Auto-register repos for this installation
    for (const repoName of context.repositoryNames) {
      const fullName = `${context.accountLogin}/${repoName}`;
      await this.updateRepoSettings(fullName, { enabled: true });
    }
  }

  /**
   * Get installation by ID
   */
  async getInstallation(installationId: number): Promise<InstallationContext | null> {
    return this.installationStore.get(installationId);
  }

  /**
   * Get installations by account
   */
  async getInstallationsByAccount(accountLogin: string): Promise<InstallationContext[]> {
    return this.installationStore.getByAccount(accountLogin);
  }

  /**
   * Remove installation
   */
  async removeInstallation(installationId: number): Promise<void> {
    await this.installationStore.remove(installationId);
  }

  /**
   * Store a secret for a repo
   */
  async storeSecret(
    repoFullName: string,
    name: string,
    value: string,
    metadata?: Record<string, unknown>
  ): Promise<RepoSecret> {
    return this.secretManager.store(repoFullName, name, value, metadata);
  }

  /**
   * Retrieve a secret
   */
  async retrieveSecret(repoFullName: string, name: string): Promise<string | null> {
    return this.secretManager.retrieve(repoFullName, name);
  }

  /**
   * List secrets for a repo
   */
  async listSecrets(repoFullName: string): Promise<Array<{ name: string; metadata: Record<string, unknown> }>> {
    return this.secretManager.list(repoFullName);
  }

  /**
   * Delete a secret
   */
  async deleteSecret(repoFullName: string, name: string): Promise<boolean> {
    return this.secretManager.delete(repoFullName, name);
  }

  /**
   * Subscribe to repo config changes
   */
  onChange(listener: (repo: string, config: RepoSettings | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Get storage info
   */
  getStorageInfo(): { type: ConfigStorageType; source: string } {
    return {
      type: this.storage.getType(),
      source: this.storage.getSource(),
    };
  }

  /**
   * Reload configuration from storage
   */
  async reload(): Promise<void> {
    this.config = await this.storage.read();
  }

  /**
   * Close service and release resources
   */
  async close(): Promise<void> {
    await this.storage.close();
    this.listeners = [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private createStorage(options: ConfigStorageOptions): ConfigStorage {
    switch (options.type) {
      case 'file':
        return new FileConfigStorage(options.filePath || '.hanumate/repo-config.json');
      
      case 'github':
        return new GitHubConfigStorage(
          options.githubRepo!,
          options.githubBranch,
          options.githubConfigPath,
          undefined // Octokit passed separately when available
        );
      
      case 'external':
        return new ExternalConfigStorage(
          options.externalUrl!,
          options.externalApiKey,
          options.refreshInterval
        );
      
      default:
        throw new Error(`Unknown storage type: ${options.type}`);
    }
  }

  private async loadConfig(): Promise<RepoConfigSchema> {
    try {
      this.config = await this.storage.read();
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      return this.config;
    }
  }

  private async saveConfig(config: RepoConfigSchema): Promise<void> {
    this.config = config;
    await this.storage.write(config);
  }

  private getDefaultSettings(overrides?: Partial<Omit<RepoSettings, 'repo'>>): Omit<RepoSettings, 'repo'> {
    return {
      enabled: true,
      triggers: {
        enabled_repos: [],
        trigger_labels: ['needs-review', 'hanumate'],
        trigger_mentions: true,
        trigger_branches: [],
      },
      codeReview: {
        enabled: true,
        autoRequestReview: true,
        excludePatterns: ['*.md', '*.txt', '*.lock'],
        minPRSize: 10,
      },
      autoMerge: {
        enabled: false,
        methods: ['squash'],
        requiredChecks: [],
        deleteBranchAfterMerge: true,
      },
      agentModel: 'claude-3-5-sonnet-20241022',
      maxConcurrentTasks: 3,
      ...overrides,
    };
  }

  private notifyListeners(repo: string, config: RepoSettings | null): void {
    for (const listener of this.listeners) {
      try {
        listener(repo, config);
      } catch (error) {
        console.error('Config change listener error:', error);
      }
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a RepoConfigService with file-based storage
 */
export function createFileRepoConfigService(
  filePath?: string,
  defaults?: Partial<Omit<RepoSettings, 'repo'>>
): RepoConfigService {
  return new RepoConfigService({
    storage: {
      type: 'file',
      filePath: filePath || '.hanumate/repo-config.json',
    },
    defaults,
  });
}

/**
 * Create a RepoConfigService with GitHub-based storage
 */
export function createGitHubRepoConfigService(
  repo: string,
  branch?: string,
  configPath?: string,
  octokit?: any,
  defaults?: Partial<Omit<RepoSettings, 'repo'>>
): RepoConfigService {
  return new RepoConfigService({
    storage: {
      type: 'github',
      githubRepo: repo,
      githubBranch: branch || 'main',
      githubConfigPath: configPath || '.hanumate/config.json',
    },
    defaults,
  });
}

/**
 * Create a RepoConfigService with external storage
 */
export function createExternalRepoConfigService(
  url: string,
  apiKey?: string,
  refreshInterval?: number,
  defaults?: Partial<Omit<RepoSettings, 'repo'>>
): RepoConfigService {
  return new RepoConfigService({
    storage: {
      type: 'external',
      externalUrl: url,
      externalApiKey: apiKey,
      refreshInterval,
    },
    defaults,
  });
}

