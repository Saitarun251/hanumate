import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Repository Configuration', () => {
  describe('Configuration Schema', () => {
    it('should validate configuration structure', () => {
      interface RepoConfig {
        enabled: boolean;
        autoReview: boolean;
        autoMerge: boolean;
        requiredApprovals: number;
        blockedPaths: string[];
        allowedAuthors?: string[];
      }

      const validateConfig = (config: any): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (typeof config.enabled !== 'boolean') {
          errors.push('enabled must be a boolean');
        }
        if (typeof config.autoReview !== 'boolean') {
          errors.push('autoReview must be a boolean');
        }
        if (typeof config.autoMerge !== 'boolean') {
          errors.push('autoMerge must be a boolean');
        }
        if (typeof config.requiredApprovals !== 'number' || config.requiredApprovals < 0) {
          errors.push('requiredApprovals must be a non-negative number');
        }
        if (!Array.isArray(config.blockedPaths)) {
          errors.push('blockedPaths must be an array');
        }

        return { valid: errors.length === 0, errors };
      };

      const validConfig = {
        enabled: true,
        autoReview: true,
        autoMerge: false,
        requiredApprovals: 2,
        blockedPaths: ['**/secret/**', '**/*.test.ts'],
      };

      const invalidConfig = {
        enabled: 'yes',
        requiredApprovals: -1,
      };

      expect(validateConfig(validConfig).valid).toBe(true);
      expect(validateConfig(invalidConfig).valid).toBe(false);
      expect(validateConfig(invalidConfig).errors).toHaveLength(3);
    });

    it('should handle default configuration values', () => {
      const getDefaults = (): any => ({
        enabled: true,
        autoReview: true,
        autoMerge: false,
        requiredApprovals: 1,
        blockedPaths: [],
        allowedAuthors: null,
        reviewLabels: [],
        autoMergeMethod: 'squash',
      });

      const defaults = getDefaults();

      expect(defaults.enabled).toBe(true);
      expect(defaults.requiredApprovals).toBe(1);
      expect(defaults.blockedPaths).toEqual([]);
    });

    it('should merge config with defaults', () => {
      const mergeConfig = (userConfig: Partial<any>, defaults: any): any => ({
        ...defaults,
        ...userConfig,
      });

      const defaults = {
        enabled: true,
        autoReview: true,
        requiredApprovals: 1,
      };

      const userConfig = {
        requiredApprovals: 3,
      };

      const merged = mergeConfig(userConfig, defaults);

      expect(merged.enabled).toBe(true);
      expect(merged.autoReview).toBe(true);
      expect(merged.requiredApprovals).toBe(3);
    });
  });

  describe('Path Matching', () => {
    it('should match blocked paths correctly', () => {
      const matchPath = (filePath: string, patterns: string[]): boolean => {
        return patterns.some((pattern) => {
          const regex = new RegExp(
            pattern
              .replace(/\*\*/g, '.*')
              .replace(/\*/g, '[^/]*')
              .replace(/\//g, '\\/')
          );
          return regex.test(filePath);
        });
      };

      const blockedPaths = ['**/secret/**', '**/*.test.ts', 'src/temp/**'];

      expect(matchPath('config/secret/api-key.ts', blockedPaths)).toBe(true);
      expect(matchPath('src/utils.ts', blockedPaths)).toBe(false);
      expect(matchPath('src/main.test.ts', blockedPaths)).toBe(true);
      expect(matchPath('src/temp/file.ts', blockedPaths)).toBe(true);
    });

    it('should handle glob patterns', () => {
      const matchGlob = (path: string, glob: string): boolean => {
        // Simplified glob matching
        const parts = glob.split('/');
        const pathParts = path.split('/');
        
        let p = 0;
        for (const part of parts) {
          if (part === '**') return true;
          if (part === '*') {
            if (p >= pathParts.length) return false;
            p++;
          } else {
            if (pathParts[p] !== part) return false;
            p++;
          }
        }
        return p === pathParts.length;
      };

      expect(matchGlob('src/test.ts', '*.ts')).toBe(true);
      expect(matchGlob('src/test.ts', 'src/*.ts')).toBe(true);
      expect(matchGlob('src/nested/test.ts', '**/*.ts')).toBe(true);
      expect(matchGlob('src/test.js', '**/*.ts')).toBe(false);
    });
  });

  describe('Repository Rules', () => {
    it('should evaluate repository rules', () => {
      interface Rule {
        name: string;
        condition: (context: any) => boolean;
        action: string;
      }

      const evaluateRules = (rules: Rule[], context: any) => {
        const results: { rule: string; triggered: boolean; action: string }[] = [];

        for (const rule of rules) {
          const triggered = rule.condition(context);
          results.push({
            rule: rule.name,
            triggered,
            action: triggered ? rule.action : 'none',
          });
        }

        return results;
      };

      const rules: Rule[] = [
        {
          name: 'require-tests',
          condition: (ctx) => ctx.hasTestFiles,
          action: 'block',
        },
        {
          name: 'require-description',
          condition: (ctx) => ctx.prDescription?.length > 10,
          action: 'warn',
        },
      ];

      const context = {
        hasTestFiles: false,
        prDescription: 'Short',
      };

      const results = evaluateRules(rules, context);

      expect(results[0].triggered).toBe(false);
      expect(results[1].triggered).toBe(true);
      expect(results[1].action).toBe('warn');
    });

    it('should apply repository-specific settings', () => {
      const applyRepoSettings = (repo: string, settings: any) => {
        const repoOverrides: Record<string, Partial<any>> = {
          'org/frontend': { requiredApprovals: 2, autoMerge: true },
          'org/backend': { requiredApprovals: 3, blockedPaths: ['**/dist/**'] },
        };

        const override = repoOverrides[repo] || {};
        return { ...settings, ...override };
      };

      const settings = {
        requiredApprovals: 1,
        autoMerge: false,
      };

      expect(applyRepoSettings('org/frontend', settings).requiredApprovals).toBe(2);
      expect(applyRepoSettings('org/backend', settings).requiredApprovals).toBe(3);
      expect(applyRepoSettings('org/other', settings).requiredApprovals).toBe(1);
    });
  });

  describe('Configuration Persistence', () => {
    it('should serialize configuration to JSON', () => {
      const config = {
        enabled: true,
        rules: [
          { name: 'test-rule', value: 42 },
        ],
        metadata: {
          version: '1.0',
          updatedAt: '2024-01-01',
        },
      };

      const serialized = JSON.stringify(config);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.enabled).toBe(true);
      expect(deserialized.rules[0].name).toBe('test-rule');
      expect(deserialized.metadata.version).toBe('1.0');
    });

    it('should handle configuration migrations', () => {
      const migrateConfig = (oldConfig: any, version: string) => {
        if (version === '1.0') {
          return {
            ...oldConfig,
            version: '2.0',
            newField: 'default-value',
            rules: oldConfig.rules?.map((r: any) => ({
              ...r,
              enabled: r.enabled ?? true,
            })),
          };
        }
        return oldConfig;
      };

      const oldConfig = {
        version: '1.0',
        rules: [{ name: 'rule1' }, { name: 'rule2' }],
      };

      const migrated = migrateConfig(oldConfig, '1.0');

      expect(migrated.version).toBe('2.0');
      expect(migrated.newField).toBe('default-value');
      expect(migrated.rules[0].enabled).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required fields', () => {
      const validateRequired = (config: any, requiredFields: string[]): string[] => {
        const errors: string[] = [];
        
        for (const field of requiredFields) {
          if (!(field in config) || config[field] === null || config[field] === undefined) {
            errors.push(`Missing required field: ${field}`);
          }
        }

        return errors;
      };

      const config = { name: 'test', enabled: true };
      const errors = validateRequired(config, ['name', 'version', 'enabled']);

      expect(errors).toContain('Missing required field: version');
      expect(errors).not.toContain('Missing required field: name');
    });

    it('should validate field types', () => {
      const validateTypes = (config: any, types: Record<string, string>): string[] => {
        const errors: string[] = [];

        for (const [field, expectedType] of Object.entries(types)) {
          const value = config[field];
          if (value !== undefined && typeof value !== expectedType) {
            errors.push(`${field} must be ${expectedType}, got ${typeof value}`);
          }
        }

        return errors;
      };

      const config = {
        name: 'test',
        count: 'not-a-number',
        active: true,
      };

      const errors = validateTypes(config, {
        name: 'string',
        count: 'number',
        active: 'boolean',
      });

      expect(errors).toContain('count must be number, got string');
    });

    it('should validate numeric ranges', () => {
      const validateRange = (value: number, min: number, max: number, field: string): string | null => {
        if (value < min) return `${field} must be at least ${min}`;
        if (value > max) return `${field} must be at most ${max}`;
        return null;
      };

      expect(validateRange(5, 1, 10, 'count')).toBeNull();
      expect(validateRange(0, 1, 10, 'count')).toBe('count must be at least 1');
      expect(validateRange(15, 1, 10, 'count')).toBe('count must be at most 10');
    });
  });

  describe('Environment Overrides', () => {
    it('should apply environment-specific overrides', () => {
      const applyEnvOverrides = (config: any, env: string) => {
        const envConfig = config.environments?.[env];
        if (!envConfig) return config;

        return {
          ...config,
          ...envConfig,
          rules: [
            ...(config.rules || []),
            ...(envConfig.rules || []),
          ],
        };
      };

      const config = {
        enabled: true,
        environments: {
          production: {
            requiredApprovals: 3,
            rules: [{ name: 'production-only' }],
          },
        },
      };

      const productionConfig = applyEnvOverrides(config, 'production');

      expect(productionConfig.requiredApprovals).toBe(3);
      expect(productionConfig.rules).toHaveLength(1);
      expect(productionConfig.enabled).toBe(true);
    });
  });
});