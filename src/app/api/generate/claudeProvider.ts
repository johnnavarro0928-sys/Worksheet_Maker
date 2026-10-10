import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

// Claude is the primary worksheet provider when ANTHROPIC_API_KEY is set. It
// never throws: any failure returns undefined so the caller falls through to
// the existing dual or legacy providers.

export const WORKSHEET_AI_TOTAL_BUDGET_MS = 52000;
const LEGACY_FALLBACK_RESERVE_MS = 20000;
const MIN_ATTEMPT_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 16000;

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_EFFORT = 'low';
const DEFAULT_TIMEOUT_MS = 25000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 35000;

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type ClaudeEffort = (typeof EFFORTS)[number];

// Models that accept the server-side refusal fallback in its "default" form.
const SERVER_SIDE_FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface WorksheetClaudeConfig {
  apiKey: string;
  model: string;
  effort: ClaudeEffort;
  timeoutMs: number;
}

export interface WorksheetClaudeClient {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: { timeout?: number; signal?: AbortSignal },
      ): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

export interface WorksheetClaudeDependencies {
  createClient?: (options: { apiKey: string; maxRetries: number }) => WorksheetClaudeClient;
  now?: () => number;
}

type AttemptResult<T> =
  | { kind: 'success'; value: T; message: Anthropic.Beta.Messages.BetaMessage }
  | { kind: 'malformed'; message?: Anthropic.Beta.Messages.BetaMessage }
  | { kind: 'refusal'; message: Anthropic.Beta.Messages.BetaMessage }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'retryable_http'; status: number }
  | { kind: 'terminal_http'; status: number }
  | { kind: 'budget_skipped' };

export function resolveWorksheetClaudeConfig(env: NodeJS.ProcessEnv = process.env): WorksheetClaudeConfig | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const effortValue = env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  const effort = EFFORTS.find(level => level === effortValue) ?? DEFAULT_EFFORT;
  const parsedTimeout = Number.parseInt(env.ANTHROPIC_TIMEOUT_MS ?? '', 10);
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, parsedTimeout))
    : DEFAULT_TIMEOUT_MS;

  return { apiKey, model, effort, timeoutMs };
}

export function isWorksheetClaudeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveWorksheetClaudeConfig(env) !== null;
}

function classifyError(error: unknown): AttemptResult<never> {
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) {
    return { kind: 'timeout' };
  }
  if (error instanceof Anthropic.APIConnectionError) return { kind: 'network' };
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const status = error.status;
    return status === 408 || status === 429 || status >= 500
      ? { kind: 'retryable_http', status }
      : { kind: 'terminal_http', status };
  }
  return { kind: 'network' };
}

function parseMessage<T>(message: Anthropic.Beta.Messages.BetaMessage, schema: z.ZodType<T>): AttemptResult<T> {
  if (message.stop_reason === 'refusal') return { kind: 'refusal', message };
  if (message.stop_reason === 'max_tokens') return { kind: 'malformed', message };

  const text = message.content.find((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')?.text;
  if (!text) return { kind: 'malformed', message };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'malformed', message };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { kind: 'success', value: parsed.data, message } : { kind: 'malformed', message };
}

function logAttempt<T>(attempt: number, durationMs: number, result: AttemptResult<T>): void {
  const message = 'message' in result ? result.message : undefined;
  const usage = message?.usage;
  const refusalCategory = result.kind === 'refusal' ? result.message.stop_details?.category : undefined;
  console.info('[worksheet-ai-claude]', {
    provider: 'claude',
    attempt,
    durationMs,
    failureKind: result.kind,
    ...('status' in result ? { status: result.status } : {}),
    ...(message?.model ? { model: message.model } : {}),
    ...(refusalCategory ? { refusalCategory } : {}),
    ...(usage
      ? {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreationInputTokens: usage.cache_creation_input_tokens,
          cacheReadInputTokens: usage.cache_read_input_tokens,
        }
      : {}),
  });
}

export interface WorksheetClaudeBudget {
  startedAt: number;
  // Shared budget for Claude plus the fallback (dual uses its own total).
  totalBudgetMs?: number;
  // Time the fallback provider needs to start; Claude never eats into it.
  fallbackReserveMs?: number;
}

function getAttemptTimeoutMs(config: WorksheetClaudeConfig, budget: WorksheetClaudeBudget, now: number): number {
  const totalBudgetMs = budget.totalBudgetMs ?? WORKSHEET_AI_TOTAL_BUDGET_MS;
  const fallbackReserveMs = budget.fallbackReserveMs ?? LEGACY_FALLBACK_RESERVE_MS;
  const remainingMs = budget.startedAt + totalBudgetMs - now;
  return Math.min(config.timeoutMs, remainingMs - fallbackReserveMs);
}

export async function requestWorksheetClaude<T>(
  prompt: string,
  schema: z.ZodType<T>,
  budget: WorksheetClaudeBudget,
  dependencies: WorksheetClaudeDependencies = {},
): Promise<T | undefined> {
  const config = resolveWorksheetClaudeConfig();
  if (!config) return undefined;

  const now = dependencies.now ?? (() => Date.now());
  const createClient = dependencies.createClient
    ?? ((clientOptions: { apiKey: string; maxRetries: number }): WorksheetClaudeClient => new Anthropic(clientOptions));
  const client = createClient({ apiKey: config.apiKey, maxRetries: 0 });

  const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
    model: config.model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: config.effort, format: zodOutputFormat(schema as z.ZodType) },
    ...(SERVER_SIDE_FALLBACK_MODELS.has(config.model)
      ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' as const }
      : {}),
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = now();
    const timeoutMs = getAttemptTimeoutMs(config, budget, attemptStartedAt);
    if (timeoutMs < MIN_ATTEMPT_TIMEOUT_MS) {
      logAttempt(attempt, 0, { kind: 'budget_skipped' });
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let result: AttemptResult<T>;
    try {
      const message = await client.beta.messages.create(params, { timeout: timeoutMs, signal: controller.signal });
      result = parseMessage(message, schema);
    } catch (error) {
      result = classifyError(error);
    } finally {
      clearTimeout(timer);
    }

    logAttempt(attempt, Math.max(0, Math.floor(now() - attemptStartedAt)), result);
    if (result.kind === 'success') return result.value;
    if (result.kind === 'terminal_http' || result.kind === 'refusal') return undefined;
  }

  return undefined;
}
