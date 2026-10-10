import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { z } from 'zod';
import {
  isWorksheetClaudeEnabled,
  requestWorksheetClaude,
  resolveWorksheetClaudeConfig,
  type WorksheetClaudeClient,
} from './claudeProvider';

const PROMPT = 'PROMPT-MARKER Generate a Multiple Choice test about photosynthesis.';
const API_KEY = 'sk-ant-test-KEY-MARKER';

const schema = z.object({
  questions: z.array(z.object({
    text: z.string(),
    options: z.array(z.string()).length(4),
    correctAnswer: z.number().min(0).max(3),
  })),
});

const validObject = {
  questions: [{ text: 'What do plants make?', options: ['Glucose', 'Salt', 'Iron', 'Sand'], correctAnswer: 0 }],
};

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: JSON.stringify(validObject) }],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: { input_tokens: 812, output_tokens: 240, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...overrides,
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

function setup(responses: Array<() => Promise<Anthropic.Beta.Messages.BetaMessage>>, now?: () => number) {
  const create = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra call');
    return next();
  });
  const createClient = vi.fn((): WorksheetClaudeClient => ({ beta: { messages: { create } } }) as unknown as WorksheetClaudeClient);
  return { create, createClient, deps: { createClient, ...(now ? { now } : {}) } };
}

const status = (code: number) => () => Promise.reject(Anthropic.APIError.generate(code, { error: { message: 'SDK-ERROR-TEXT' } }, 'SDK-ERROR-TEXT', new Headers()));

describe('resolveWorksheetClaudeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '', '   '])('is disabled when ANTHROPIC_API_KEY is %j', (value) => {
    if (value === undefined) vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    else vi.stubEnv('ANTHROPIC_API_KEY', value);

    expect(resolveWorksheetClaudeConfig()).toBeNull();
    expect(isWorksheetClaudeEnabled()).toBe(false);
  });

  it('uses defaults when only the key is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY);
    vi.stubEnv('ANTHROPIC_MODEL', undefined);
    vi.stubEnv('ANTHROPIC_EFFORT', undefined);
    vi.stubEnv('ANTHROPIC_TIMEOUT_MS', undefined);

    expect(resolveWorksheetClaudeConfig()).toEqual({ apiKey: API_KEY, model: 'claude-sonnet-5-5', effort: 'low', timeoutMs: 25000 });
  });

  it.each([
    ['1000', 5000],
    ['99999', 35000],
    ['30000', 30000],
    ['abc', 25000],
  ])('handles ANTHROPIC_TIMEOUT_MS=%s as %i', (value, expected) => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY);
    vi.stubEnv('ANTHROPIC_TIMEOUT_MS', value);
    expect(resolveWorksheetClaudeConfig()?.timeoutMs).toBe(expected);
  });

  it('falls back to low effort for an invalid ANTHROPIC_EFFORT and keeps a valid one', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY);
    vi.stubEnv('ANTHROPIC_EFFORT', 'extreme');
    expect(resolveWorksheetClaudeConfig()?.effort).toBe('low');
    vi.stubEnv('ANTHROPIC_EFFORT', 'high');
    expect(resolveWorksheetClaudeConfig()?.effort).toBe('high');
  });
});

describe('requestWorksheetClaude', () => {
  let info: MockInstance<typeof console.info>;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY);
    vi.stubEnv('ANTHROPIC_MODEL', undefined);
    vi.stubEnv('ANTHROPIC_EFFORT', undefined);
    vi.stubEnv('ANTHROPIC_TIMEOUT_MS', undefined);
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the schema-validated object on success', async () => {
    const { create, createClient, deps } = setup([async () => message()]);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(result).toEqual(validObject);
    expect(create).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({ apiKey: API_KEY, maxRetries: 0 });
  });

  it('sends structured output and effort without forbidden sampling or thinking parameters', async () => {
    const { create, deps } = setup([async () => message()]);

    await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    const [params, requestOptions] = create.mock.calls[0] as unknown as [Record<string, unknown>, { timeout?: number; signal?: AbortSignal }];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.max_tokens as number).toBeGreaterThanOrEqual(8000);
    expect(params.messages).toEqual([{ role: 'user', content: PROMPT }]);
    expect((params.output_config as { effort: string }).effort).toBe('low');
    expect((params.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    for (const forbidden of ['temperature', 'top_p', 'top_k', 'thinking', 'budget_tokens', 'tool_choice', 'system']) {
      expect(params).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(params)).not.toContain('budget_tokens');
    expect((params.messages as Array<{ role: string }>).some(entry => entry.role === 'assistant')).toBe(false);
    expect(requestOptions.timeout).toBe(25000);
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('opts into server-side refusal fallbacks for claude-sonnet-5-5', async () => {
    const { create, deps } = setup([async () => message()]);

    await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    const [params] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
  });

  it('skips server-side fallbacks for models that do not support them', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-haiku-5-5');
    const { create, deps } = setup([async () => message({ model: 'claude-haiku-5-5' })]);

    await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    const [params] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params).not.toHaveProperty('fallbacks');
    expect(params).not.toHaveProperty('betas');
  });

  it.each([
    ['timeout', () => Promise.reject(new Anthropic.APIConnectionTimeoutError())],
    ['timeout', () => Promise.reject(new Anthropic.APIUserAbortError())],
    ['network', () => Promise.reject(new Anthropic.APIConnectionError({ message: 'SDK-ERROR-TEXT' }))],
    ['retryable_http', status(429)],
    ['retryable_http', status(500)],
    ['retryable_http', status(529)],
    ['malformed', async () => message({ stop_reason: 'max_tokens' })],
    ['malformed', async () => message({ content: [{ type: 'text', text: '{not json' }] })],
    ['malformed', async () => message({ content: [{ type: 'text', text: JSON.stringify({ questions: [{ text: 'x', options: ['a', 'b', 'c'], correctAnswer: 0 }] }) }] })],
  ])('maps %s failures, retries once, then falls through', async (kind, failure) => {
    const { create, deps } = setup([failure, failure]);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(result).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.map(call => (call[1] as { failureKind: string }).failureKind)).toEqual([kind, kind]);
  });

  it.each([400, 401, 403, 404])('does not retry terminal HTTP %i and logs only the status', async (code) => {
    const { create, deps } = setup([status(code)]);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(result).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toMatchObject({ provider: 'claude', attempt: 1, failureKind: 'terminal_http', status: code });
  });

  it('falls through on refusal without retrying and logs the category', async () => {
    const { create, deps } = setup([async () => message({ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio', explanation: 'EXPLANATION-TEXT' } })]);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(result).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toMatchObject({ failureKind: 'refusal', refusalCategory: 'bio' });
    expect(JSON.stringify(info.mock.calls)).not.toContain('EXPLANATION-TEXT');
  });

  it('retries a 529 once when the fallback reserve still fits', async () => {
    const { create, deps } = setup([status(529), async () => message()]);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(result).toEqual(validObject);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 529 when the retry would eat into the 20s fallback reserve', async () => {
    let clock = 0;
    const { create, deps } = setup([async () => {
      clock = 30000;
      return status(529)();
    }], () => clock);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: 0 }, deps);

    expect(result).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('caps the attempt timeout so the fallback keeps 20 seconds', async () => {
    let clock = 20000;
    const { create, deps } = setup([async () => message()], () => clock);

    await requestWorksheetClaude(PROMPT, schema, { startedAt: 0 }, deps);

    const [, requestOptions] = create.mock.calls[0] as unknown as [unknown, { timeout: number }];
    expect(requestOptions.timeout).toBe(12000);
    clock = 0;
  });

  it('makes no call when the budget left after the fallback reserve is too small', async () => {
    const { create, deps } = setup([async () => message()], () => 30000);

    const result = await requestWorksheetClaude(PROMPT, schema, { startedAt: 0 }, deps);

    expect(result).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(info.mock.calls).toEqual([['[worksheet-ai-claude]', { provider: 'claude', attempt: 1, durationMs: 0, failureKind: 'budget_skipped' }]]);
  });

  it('logs bounded telemetry with usage and never the prompt, key, response text or SDK messages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps } = setup([status(529), async () => message()]);

    await requestWorksheetClaude(PROMPT, schema, { startedAt: Date.now() }, deps);

    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[1]).toEqual(['[worksheet-ai-claude]', expect.objectContaining({
      provider: 'claude',
      attempt: 2,
      failureKind: 'success',
      model: 'claude-sonnet-5-5',
      inputTokens: 812,
      outputTokens: 240,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      durationMs: expect.any(Number),
    })]);
    const logs = JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
    for (const secret of ['PROMPT-MARKER', 'KEY-MARKER', 'SDK-ERROR-TEXT', 'What do plants make?']) {
      expect(logs).not.toContain(secret);
    }
  });
});
