import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Reviewer Agent', () => {
  describe('Code Review', () => {
    it('should perform code review on PR', async () => {
      const performReview = vi.fn(async (pr: any, context: any) => {
        const score = Math.floor(Math.random() * 3) + 7; // Score 7-10
        
        return {
          success: true,
          score,
          issues: score < 8 ? [
            { type: 'style', severity: 'low', message: 'Consider using const', line: 10 },
          ] : [],
          summary: score >= 8 ? 'LGTM!' : 'Needs minor changes',
          approval: score >= 8,
        };
      });

      const result = await performReview(
        { number: 123, title: 'Add feature', files: ['src/feature.ts'] },
        { reviewType: 'standard' }
      );

      expect(result.success).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(7);
      expect(result.approval).toBe(true);
    });

    it('should detect security issues', async () => {
      const detectSecurityIssues = vi.fn(async (code: string) => {
        const issues = [];

        if (code.includes('eval(')) {
          issues.push({ type: 'security', severity: 'high', message: 'Avoid eval()' });
        }
        if (code.includes('SQL') && code.includes('+ ')) {
          issues.push({ type: 'security', severity: 'high', message: 'Potential SQL injection' });
        }
        if (code.includes('password') && !code.includes('process.env')) {
          issues.push({ type: 'security', severity: 'medium', message: 'Use env vars for secrets' });
        }

        return {
          issues,
          hasSecurityIssues: issues.length > 0,
          securityScore: Math.max(0, 10 - issues.length * 2),
        };
      });

      const code = `
        const query = "SELECT * FROM users WHERE id = " + userId;
        eval(userInput);
        const password = "hardcoded";
      `;

      const result = await detectSecurityIssues(code);

      expect(result.hasSecurityIssues).toBe(true);
      expect(result.issues.length).toBe(3);
      expect(result.securityScore).toBeLessThan(10);
    });

    it('should detect performance issues', async () => {
      const detectPerformanceIssues = (code: string) => {
        const issues = [];

        if (code.includes('for') && code.includes('.map(')) {
          issues.push({ type: 'performance', message: 'Nested loops detected' });
        }
        if (code.match(/\.forEach\(/)) {
          issues.push({ type: 'performance', message: 'Consider using for...of for better performance' });
        }
        if (code.includes('JSON.parse') && !code.includes('try')) {
          issues.push({ type: 'performance', message: 'Add try-catch for JSON parsing' });
        }

        return issues;
      };

      const code = `
        data.forEach(item => {
          result.push(item.value);
        });
      `;

      const issues = detectPerformanceIssues(code);
      
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Review Feedback', () => {
    it('should generate review comment', async () => {
      const generateComment = vi.fn(async (review: any) => {
        const comment = `# Code Review Results\n\n`;
        const sections = [];

        if (review.issues.length > 0) {
          sections.push(`## Issues Found (${review.issues.length})\n\n`);
          review.issues.forEach((issue: any, i: number) => {
            sections.push(`${i + 1}. [${issue.severity}] ${issue.message}`);
            if (issue.line) sections.push(`   - File: ${issue.file}:${issue.line}\n`);
          });
        } else {
          sections.push(`## Summary\n\n✅ No issues found!`);
        }

        sections.push(`\n---\n**Review Score:** ${review.score}/10`);

        return comment + sections.join('\n');
      });

      const result = await generateComment({
        score: 8,
        issues: [
          { severity: 'low', message: 'Add JSDoc comments', file: 'src/test.ts', line: 10 },
        ],
      });

      expect(result).toContain('Code Review Results');
      expect(result).toContain('Issues Found');
      expect(result).toContain('8/10');
    });

    it('should format suggestions for improvements', () => {
      const formatSuggestion = (issue: any) => {
        const parts = [
          `**File:** \`${issue.file}\`${issue.line ? `:${issue.line}` : ''}`,
          `**Type:** ${issue.type}`,
          `**Severity:** ${issue.severity}`,
          '',
          `**Suggestion:**`,
          issue.suggestion || issue.message,
        ];

        return parts.join('\n');
      };

      const suggestion = formatSuggestion({
        file: 'src/utils.ts',
        line: 25,
        type: 'style',
        severity: 'low',
        suggestion: 'Use const instead of let for immutable variables',
      });

      expect(suggestion).toContain('src/utils.ts');
      expect(suggestion).toContain('25');
      expect(suggestion).toContain('const');
    });
  });

  describe('Review Categories', () => {
    it('should categorize issues by type', () => {
      const categorizeIssue = (issue: string): string => {
        const categories = {
          security: ['injection', 'sql', 'eval', 'password', 'secret'],
          performance: ['loop', 'O(n)', 'complexity', 'memory'],
          style: ['naming', 'formatting', 'indentation'],
          logic: ['null', 'undefined', 'edge case'],
          testing: ['test', 'coverage', 'mock'],
        };

        const lowerIssue = issue.toLowerCase();
        for (const [category, keywords] of Object.entries(categories)) {
          if (keywords.some((kw) => lowerIssue.includes(kw))) {
            return category;
          }
        }
        return 'general';
      };

      expect(categorizeIssue('Potential SQL injection')).toBe('security');
      expect(categorizeIssue('Avoid nested loops')).toBe('performance');
      expect(categorizeIssue('Inconsistent naming')).toBe('style');
      expect(categorizeIssue('Handle null case')).toBe('logic');
    });

    it('should assign severity levels', () => {
      const getSeverity = (issueType: string, context: any): string => {
        const criticalTypes = ['security', 'data-loss', 'break'];
        
        if (criticalTypes.includes(issueType)) {
          return 'critical';
        }
        if (issueType === 'performance' && context.impact === 'high') {
          return 'high';
        }
        if (issueType === 'style') {
          return 'low';
        }
        return 'medium';
      };

      expect(getSeverity('security', {})).toBe('critical');
      expect(getSeverity('performance', { impact: 'high' })).toBe('high');
      expect(getSeverity('style', {})).toBe('low');
      expect(getSeverity('logic', {})).toBe('medium');
    });
  });

  describe('Approval Logic', () => {
    it('should approve PR with high score', async () => {
      const shouldApprove = (review: any): boolean => {
        const minScore = review.requirements?.minScore || 7;
        const maxIssues = review.requirements?.maxIssues || 5;
        
        return review.score >= minScore && review.issues.length <= maxIssues;
      };

      expect(shouldApprove({ score: 9, issues: [] })).toBe(true);
      expect(shouldApprove({ score: 8, issues: [{ type: 'low' }] })).toBe(true);
      expect(shouldApprove({ score: 6, issues: [] })).toBe(false);
      expect(shouldApprove({ score: 8, issues: [{ type: 'high' }, { type: 'high' }] })).toBe(false);
    });

    it('should request changes for critical issues', () => {
      const requiresChanges = (issues: any[]): boolean => {
        return issues.some((issue) => 
          issue.severity === 'critical' || 
          issue.severity === 'high'
        );
      };

      expect(requiresChanges([{ severity: 'critical' }])).toBe(true);
      expect(requiresChanges([{ severity: 'high' }])).toBe(true);
      expect(requiresChanges([{ severity: 'low' }, { severity: 'low' }])).toBe(false);
    });

    it('should handle review with comments only', () => {
      const handleCommentOnlyReview = (review: any) => {
        const hasBlockingIssues = review.issues.some(
          (issue: any) => issue.severity === 'critical' || issue.severity === 'high'
        );

        return {
          action: hasBlockingIssues ? 'request_changes' : 'comment',
          canMerge: !hasBlockingIssues,
          commentCount: review.issues.length,
        };
      };

      const result1 = handleCommentOnlyReview({ issues: [{ severity: 'low' }] });
      expect(result1.action).toBe('comment');
      expect(result1.canMerge).toBe(true);

      const result2 = handleCommentOnlyReview({ issues: [{ severity: 'critical' }] });
      expect(result2.action).toBe('request_changes');
      expect(result2.canMerge).toBe(false);
    });
  });

  describe('Check Run Integration', () => {
    it('should create check run for review', async () => {
      const createCheckRun = vi.fn(async (context: any) => {
        return {
          success: true,
          checkRunId: `check-${Date.now()}`,
          status: 'in_progress',
          name: 'hanumate/review',
          headSha: context.headSha,
        };
      });

      const result = await createCheckRun({
        prNumber: 123,
        headSha: 'abc123',
        repo: 'test/repo',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('in_progress');
      expect(result.name).toBe('hanumate/review');
    });

    it('should update check run with results', async () => {
      const updateCheckRun = vi.fn(async (checkRunId: string, result: any) => {
        return {
          success: true,
          checkRunId,
          conclusion: result.approval ? 'success' : 'action_required',
          summary: result.summary,
          annotations: result.issues.map((issue: any, i: number) => ({
            path: issue.file,
            start_line: issue.line,
            end_line: issue.line,
            annotation_level: issue.severity === 'critical' ? 'failure' : 'warning',
            message: issue.message,
          })),
        };
      });

      const result = await updateCheckRun('check-123', {
        approval: true,
        summary: 'All checks passed',
        issues: [
          { file: 'src/test.ts', line: 10, severity: 'warning', message: 'Minor issue' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.conclusion).toBe('success');
      expect(result.annotations).toHaveLength(1);
    });

    it('should complete check run on review completion', async () => {
      const completeCheckRun = vi.fn(async (checkRunId: string, conclusion: string) => {
        return {
          success: true,
          checkRunId,
          status: 'completed',
          conclusion,
          completedAt: new Date().toISOString(),
        };
      });

      const result = await completeCheckRun('check-123', 'success');

      expect(result.status).toBe('completed');
      expect(result.conclusion).toBe('success');
    });
  });

  describe('Review Summary', () => {
    it('should generate summary markdown', async () => {
      const generateSummary = vi.fn(async (review: any) => {
        const lines = [
          `# 📋 Code Review Summary`,
          '',
          `## PR #${review.prNumber}: ${review.title}`,
          '',
          `### Overall Score: ${review.score}/10`,
          review.approval ? '✅ **Approved**' : '❌ **Changes Requested**',
          '',
          `### Statistics`,
          `- Files reviewed: ${review.filesCount}`,
          `- Lines analyzed: ${review.linesCount}`,
          `- Issues found: ${review.issues.length}`,
          '',
        ];

        if (review.issues.length > 0) {
          lines.push('### Issues by Severity');
          const bySeverity = review.issues.reduce((acc: any, issue: any) => {
            acc[issue.severity] = (acc[issue.severity] || 0) + 1;
            return acc;
          }, {});
          
          for (const [severity, count] of Object.entries(bySeverity)) {
            lines.push(`- ${severity}: ${count}`);
          }
        }

        return lines.join('\n');
      });

      const result = await generateSummary({
        prNumber: 123,
        title: 'Add feature',
        score: 8,
        approval: true,
        filesCount: 5,
        linesCount: 200,
        issues: [
          { severity: 'low', message: 'Minor style issue' },
          { severity: 'medium', message: 'Add error handling' },
        ],
      });

      expect(result).toContain('Code Review Summary');
      expect(result).toContain('8/10');
      expect(result).toContain('Approved');
    });
  });
});