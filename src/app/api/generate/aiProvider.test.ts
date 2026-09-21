import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorksheetMakerAiProviderConfig, WorksheetAiProviderProfile } from './aiProviderConfig';
import {
  WorksheetAiProviderError,
  requestWorksheetAiProvider,
} from './aiProvider';

type DualConfig = Extract<WorksheetMakerAiProviderConfig, { mode: 'dual' }>;

const prompt = 'private worksheet prompt sentinel';
const primaryKey = 'primary-secret-sentinel';
const secondaryKey = 'secondary-secret-sentinel';

function profile(
  alias: 'primary' | 'secondary',
  overrides: Partial<WorksheetAiProviderProfile> = {},
): WorksheetAiProviderProfile {
  return {
    alias,
    baseUrl: `https://${alias}.example.test/v1`,
    apiKey: alias === 'primary' ? primaryKey : secondaryKey,
    model: `${alias}-model`,
    authScheme: alias === 'primary' ? 'bearer' : 'api-key',
    timeoutMs: 15000,
    ...overrides,
  };
}

function dualConfig({
  totalTimeoutMs = 52000,
  primary = {},
  secondary = { timeoutMs: 30000 },
}: {
  totalTimeoutMs?: number;
  primary?: Partial<WorksheetAiProviderProfile>;
  secondary?: Partial<WorksheetAiProviderProfile>;
} = {}): DualConfig {
  return {
    mode: 'dual',
    totalTimeoutMs,
    profiles: [profile('primary', primary), profile('secondary', secondary)],
  };
}

function completion(value: unknown, choice: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    choices: [{
      message: { content: JSON.stringify(value) },
      ...choice,
    }],
  }), { status: 200 });
}

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function requestBody(call: Parameters<typeof fetch>): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body));
}

async function expectProviderError(
  request: Promise<unknown>,
  code: string,
): Promise<WorksheetAiProviderError> {
  let thrown: unknown;

  try {
    await request;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(WorksheetAiProviderError);
  const providerError = thrown as WorksheetAiProviderError;
  expect(providerError.code).toBe(code);
  return providerError;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestWorksheetAiProvider', () => {
  it('sends one primary OpenAI-compatible request and returns parsed JSON', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let now = 100;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      now = 137.8;
      return completion({ answer: 42 });
    });

    await expect(requestWorksheetAiProvider(prompt, dualConfig({
      primary: { temperature: 0 },
    }), {
      fetch,
      now: () => now,
      startedAt: 100,
    })).resolves.toEqual({ answer: 42 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call[0]).toBe('https://primary.example.test/v1/chat/completions');
    expect((call[1] as RequestInit).redirect).toBe('manual');
    expect((call[1] as RequestInit).headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${primaryKey}`,
    });
    expect(requestBody(call)).toEqual({
      model: 'primary-model',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    expect(info).toHaveBeenCalledWith('[worksheet-ai-provider]', {
      alias: 'primary',
      attempt: 1,
      durationMs: 37,
      failureKind: 'success',
    });
  });

  it('emits secondary success telemetry after a primary timeout', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async () => {
        now = 1000;
        return completion({ provider: 'primary' });
      })
      .mockImplementationOnce(async () => {
        now = 1055;
        return completion({ provider: 'secondary' });
      });

    await expect(requestWorksheetAiProvider(prompt, dualConfig({
      totalTimeoutMs: 10000,
      primary: { timeoutMs: 1000 },
      secondary: { timeoutMs: 1000 },
    }), {
      fetch,
      now: () => now,
      startedAt: 0,
    })).resolves.toEqual({ provider: 'secondary' });

    expect([0, 1].map((index) => requestBody(fetch.mock.calls[index]).model)).toEqual([
      'primary-model',
      'secondary-model',
    ]);
    expect(info.mock.calls).toEqual([
      ['[worksheet-ai-provider]', {
        alias: 'primary',
        attempt: 1,
        durationMs: 1000,
        failureKind: 'timeout',
      }],
      ['[worksheet-ai-provider]', {
        alias: 'secondary',
        attempt: 2,
        durationMs: 55,
        failureKind: 'success',
      }],
    ]);
  });

  it.each([408, 429, 500, 503])('advances from retryable HTTP %i to secondary', async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response('temporary failure', status))
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));

    await expect(requestWorksheetAiProvider(prompt, dualConfig(), { fetch })).resolves.toEqual({ provider: 'secondary' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(fetch.mock.calls[0]).model).toBe('primary-model');
    expect(requestBody(fetch.mock.calls[1]).model).toBe('secondary-model');
  });

  it('advances from a network failure to secondary', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('private network exception'))
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));

    await expect(requestWorksheetAiProvider(prompt, dualConfig(), { fetch })).resolves.toEqual({ provider: 'secondary' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])('treats HTTP %i as terminal without dispatching secondary', async (status) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response('private terminal body', status))
      .mockResolvedValueOnce(completion({ should: 'not-run' }));

    const error = await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch }),
      'AI_PROVIDER_HTTP_ERROR',
    );

    expect(error.status).toBe(status);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('[worksheet-ai-provider]', expect.objectContaining({
      alias: 'primary',
      attempt: 1,
      durationMs: expect.any(Number),
      failureKind: 'terminal_http',
      status,
    }));
  });

  it('does not follow a redirect or treat it as a retryable failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response('', 302))
      .mockResolvedValueOnce(completion({ should: 'not-run' }));

    await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch }),
      'AI_PROVIDER_HTTP_ERROR',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0][1] as RequestInit).redirect).toBe('manual');
  });

  it.each([
    ['3xx redirect', 302, 'stall'],
    ['unauthorized', 401, 'reject'],
    ['forbidden', 403, 'reject'],
    ['other terminal 4xx', 404, 'stall'],
  ] as const)('classifies %s before reading its body or dispatching secondary', async (_label, status, bodyBehavior) => {
    vi.useFakeTimers();
    const bodyReader = vi.fn(() => bodyBehavior === 'stall'
      ? new Promise<string>(() => undefined)
      : Promise.reject(new Error('private body reader rejection')));
    const terminalResponse = {
      ok: false,
      status,
      text: bodyReader,
    } as unknown as Response;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(terminalResponse)
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));
    const request = requestWorksheetAiProvider(prompt, dualConfig({
      totalTimeoutMs: 10000,
      primary: { timeoutMs: 1000 },
      secondary: { timeoutMs: 1000 },
    }), { fetch });
    void request.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(1000);

    const error = await expectProviderError(request, 'AI_PROVIDER_HTTP_ERROR');
    expect(error.status).toBe(status);
    expect(error.message).toBe('Worksheet AI provider request failed.');
    expect(bodyReader).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['malformed outer response', response('not-json')],
    ['empty completion content', response({ choices: [{ message: { content: '   ' } }] })],
    ['truncated completion', completion({ partial: true }, { finish_reason: 'length' })],
  ])('retries %s once before advancing to secondary', async (_label, malformed) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(malformed)
      .mockRejectedValueOnce(new Error('private retry failure'))
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));

    await expect(requestWorksheetAiProvider(prompt, dualConfig(), { fetch })).resolves.toEqual({ provider: 'secondary' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect([0, 1].map((index) => requestBody(fetch.mock.calls[index]).model)).toEqual(['primary-model', 'primary-model']);
    expect(requestBody(fetch.mock.calls[2]).model).toBe('secondary-model');
  });

  it('caps malformed retries at four physical attempts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(response('not-json')));

    const error = await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch }),
      'AI_PROVIDER_MALFORMED_RESPONSE',
    );

    expect(error.attempts).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect([0, 1, 2, 3].map((index) => requestBody(fetch.mock.calls[index]).model)).toEqual([
      'primary-model',
      'primary-model',
      'secondary-model',
      'secondary-model',
    ]);
  });

  it('treats explicit refusal and content-filter rejection as terminal', async () => {
    const refusalFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({
        choices: [{ message: { refusal: 'private refusal', content: '{"ignored":true}' } }],
      }));
    const safetyFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ error: { code: 'content_filter', message: 'private safety body' } }, 400));

    await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch: refusalFetch }),
      'AI_PROVIDER_SAFETY_REJECTION',
    );
    await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch: safetyFetch }),
      'AI_PROVIDER_SAFETY_REJECTION',
    );
    expect(refusalFetch).toHaveBeenCalledTimes(1);
    expect(safetyFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['stalls', () => new Promise<string>(() => undefined)],
    ['rejects', () => Promise.reject(new Error('private 400 body rejection'))],
  ] as const)('keeps HTTP 400 content-filter inspection terminal when its body %s', async (_bodyState, readBody) => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const bodyReader = vi.fn(readBody);
    const contentFilterInspectionResponse = {
      ok: false,
      status: 400,
      text: bodyReader,
    } as unknown as Response;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(contentFilterInspectionResponse)
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));
    const request = requestWorksheetAiProvider(prompt, dualConfig({
      totalTimeoutMs: 10000,
      primary: { timeoutMs: 1000 },
      secondary: { timeoutMs: 1000 },
    }), { fetch });
    void request.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(1000);

    const error = await expectProviderError(request, 'AI_PROVIDER_HTTP_ERROR');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Worksheet AI provider request failed.');
    expect(bodyReader).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain(primaryKey);
    expect(logs).not.toContain(secondaryKey);
    expect(logs).not.toContain(prompt);
    expect(logs).not.toContain('private 400 body rejection');
  });

  it('bounds a stalled fetch and advances to secondary', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => undefined))
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));
    const request = requestWorksheetAiProvider(prompt, dualConfig({
      totalTimeoutMs: 10000,
      primary: { timeoutMs: 1000 },
      secondary: { timeoutMs: 1000 },
    }), { fetch });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toEqual({ provider: 'secondary' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('logs only bounded metadata for a timeout', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async () => {
        now = 1000;
        return completion({ worksheet: 'private worksheet output sentinel' });
      })
      .mockImplementationOnce(async () => {
        now = 1050;
        return response('private secondary response body', 401);
      });

    await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig({
        totalTimeoutMs: 10000,
        primary: { timeoutMs: 1000 },
        secondary: { timeoutMs: 1000 },
      }), {
        fetch,
        now: () => now,
        startedAt: 0,
      }),
      'AI_PROVIDER_HTTP_ERROR',
    );

    expect(info.mock.calls[0]).toEqual(['[worksheet-ai-provider]', {
      alias: 'primary',
      attempt: 1,
      durationMs: 1000,
      failureKind: 'timeout',
    }]);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain(primaryKey);
    expect(logs).not.toContain(secondaryKey);
    expect(logs).not.toContain(prompt);
    expect(logs).not.toContain('private worksheet output sentinel');
    expect(logs).not.toContain('private secondary response body');
  });

  it('bounds a stalled response body and advances to secondary', async () => {
    vi.useFakeTimers();
    const stalledBody = {
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => undefined),
    } as Response;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(stalledBody)
      .mockResolvedValueOnce(completion({ provider: 'secondary' }));
    const request = requestWorksheetAiProvider(prompt, dualConfig({
      totalTimeoutMs: 10000,
      primary: { timeoutMs: 1000 },
      secondary: { timeoutMs: 1000 },
    }), { fetch });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(request).resolves.toEqual({ provider: 'secondary' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honors the original request start time before dispatch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(completion({ should: 'not-run' }));

    const error = await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig({
        totalTimeoutMs: 10000,
        primary: { timeoutMs: 1000 },
        secondary: { timeoutMs: 1000 },
      }), {
        fetch,
        startedAt: 0,
        now: () => 2501,
      }),
      'AI_PROVIDER_BUDGET_EXCEEDED',
    );

    expect(error.attempts).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps overlapping invocations isolated at primary', async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const firstFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => firstResponse);
    const secondFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(completion({ request: 'second' }));

    const first = requestWorksheetAiProvider(prompt, dualConfig(), { fetch: firstFetch });
    const second = requestWorksheetAiProvider(prompt, dualConfig(), { fetch: secondFetch });

    await expect(second).resolves.toEqual({ request: 'second' });
    resolveFirst?.(completion({ request: 'first' }));
    await expect(first).resolves.toEqual({ request: 'first' });
    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it('logs only bounded metadata after a terminal provider failure', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response('private upstream response sentinel', 401),
    );

    await expectProviderError(
      requestWorksheetAiProvider(prompt, dualConfig(), { fetch }),
      'AI_PROVIDER_HTTP_ERROR',
    );

    expect(info).toHaveBeenCalled();
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain(primaryKey);
    expect(logs).not.toContain(secondaryKey);
    expect(logs).not.toContain(prompt);
    expect(logs).not.toContain('private upstream response sentinel');
  });
});
