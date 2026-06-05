/**
 * MiniMax LLM Integration Service
 * Provides AI capabilities for the RubberDuck GitHub App
 */

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class MiniMaxService {
  private config: LLMConfig;
  private defaultSystemPrompt = `You are RubberDuck, an AI coding assistant for GitHub. You help developers with:
- Writing and implementing code
- Debugging and fixing issues
- Code review and quality checks
- Answering questions about repositories

Be concise, helpful, and technical. When writing code, use proper formatting.`;

  constructor(config: LLMConfig) {
    this.config = {
      model: config.model || 'MiniMax-M2.7',
      baseURL: config.baseURL || 'https://agent.minimax.io/mavis/api/v1/llm/v1',
      apiKey: config.apiKey,
    };
  }

  /**
   * Process a user message and return an AI response
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.defaultSystemPrompt },
            ...messages,
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `API error ${response.status}: ${error}` };
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (data.error) {
        return { success: false, error: data.error.message || 'Unknown error' };
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return { success: false, error: 'No response from model' };
      }

      return { success: true, message: content };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Process a GitHub issue/PR comment
   */
  async processIssueComment(comment: string, context: {
    issueTitle?: string;
    issueBody?: string;
    isPR?: boolean;
    repo?: string;
  }): Promise<LLMResponse> {
    const systemContext = context.isPR
      ? `This is a pull request comment in the ${context.repo || 'repository'} repository.`
      : `This is an issue comment in the ${context.repo || 'repository'} repository.`;

    const fullContext = context.issueTitle
      ? `Issue/PR Title: ${context.issueTitle}\n${context.issueBody ? `Description: ${context.issueBody}\n` : ''}`
      : '';

    return this.chat([
      { role: 'user', content: `${systemContext}\n\n${fullContext}User comment: ${comment}` },
    ]);
  }
}

/**
 * Create MiniMax service from environment
 */
export function createMiniMaxService(): MiniMaxService {
  return new MiniMaxService({
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseURL: process.env.MINIMAX_BASE_URL || 'https://agent.minimax.io/mavis/api/v1/llm/v1',
    model: 'MiniMax-M2.7',
  });
}