import {
  WORKSHEET_AI_FINALIZATION_AND_TRANSITION_RESERVE_MS,
  type WorksheetAiProviderProfile,
  type WorksheetMakerAiProviderConfig,
} from './aiProviderConfig';

type DualConfig = Extract<WorksheetMakerAiProviderConfig, { mode: 'dual' }>;

export type WorksheetAiProviderErrorCode =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_HTTP_ERROR'
  | 'AI_PROVIDER_MALFORMED_RESPONSE'
  | 'AI_PROVIDER_SAFETY_REJECTION'
  | 'AI_PROVIDER_EXHAUSTED'
  | 'AI_PROVIDER_BUDGET_EXCEEDED';

const ERROR_MESSAGES: Record<WorksheetAiProviderErrorCode, string> = {
  AI_PROVIDER_TIMEOUT: 'Worksheet AI provider request timed out.',
  AI_PROVIDER_HTTP_ERROR: 'Worksheet AI provider request failed.',
  AI_PROVIDER_MALFORMED_RESPONSE: 'Worksheet AI provider returned an invalid response.',
  AI_PROVIDER_SAFETY_REJECTION: 'Worksheet AI provider rejected the request for safety reasons.',
  AI_PROVIDER_EXHAUSTED: 'Worksheet AI providers were unavailable.',
  AI_PROVIDER_BUDGET_EXCEEDED: 'Worksheet AI provider timeout budget was exhausted.',
};

const MAX_PHYSICAL_ATTEMPTS = 4;
const TIMEOUT = Symbol('worksheet-ai-provider-timeout');

export class WorksheetAiProviderError extends Error {
  readonly code: WorksheetAiProviderErrorCode;
  readonly alias?: 'primary' | 'secondary';
  readonly status?: number;
  readonly attempts: number;

  constructor(
    code: WorksheetAiProviderErrorCode,
    attempts: number,
    metadata: { alias?: 'primary' | 'secondary'; status?: number } = {},
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WorksheetAiProviderError';
    this.code = code;
    this.attempts = attempts;
    if (metadata.alias !== undefined) this.alias = metadata.alias;
    if (metadata.status !== undefined) this.status = metadata.status;
  }
}

export interface WorksheetAiProviderDependencies {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  startedAt?: number;
}

type AttemptResult =
  | { kind: 'success'; value: unknown }
  | { kind: 'malformed' }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'retryable_http'; status: number }
  | { kind: 'terminal_http'; status: number }
  | { kind: 'safety'; status?: number };

type RuntimeDependencies = Required<Pick<
  WorksheetAiProviderDependencies,
  'fetch' | 'now' | 'setTimeout' | 'clearTimeout'
>>;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isTerminalStatus(status: number): boolean {
  return (status >= 300 && status < 400) || (status >= 400 && !isRetryableStatus(status));
}

function isSafetySignal(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['content_filter', 'content_policy_violation', 'safety_blocked', 'prompt_blocked'].includes(normalized)) {
    return true;
  }

  const words = value.replace(/[\s_-]+/g, ' ');
  return /(?:block(?:ed|ing)?|reject(?:ed|ion)?|violat(?:e|ed|ion)|den(?:y|ied)|disallow(?:ed)?)\b[\s\S]{0,40}\b(?:content|safety|policy|prompt|moderation)\b/i.test(words)
    || /\b(?:content|safety|policy|prompt|moderation)\b[\s\S]{0,40}\b(?:block(?:ed|ing)?|reject(?:ed|ion)?|violat(?:e|ed|ion)|den(?:y|ied)|disallow(?:ed)?)\b/i.test(words);
}

function hasSafetySignal(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return false;

  const details = error as Record<string, unknown>;
  return [details.code, details.type, details.message, details.reason].some(isSafetySignal);
}

function completion(value: unknown): { content?: string; refusal?: string; finishReason?: unknown } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return undefined;

  const choice = choices[0] as Record<string, unknown>;
  const message = choice.message;
  if (!message || typeof message !== 'object') return { finishReason: choice.finish_reason };

  const item = message as Record<string, unknown>;
  return {
    content: typeof item.content === 'string' ? item.content : undefined,
    refusal: typeof item.refusal === 'string' ? item.refusal : undefined,
    finishReason: choice.finish_reason,
  };
}

function requestBody(profile: WorksheetAiProviderProfile, prompt: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: profile.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  };

  if (profile.temperature !== undefined) body.temperature = profile.temperature;
  return body;
}

function remainingWindowFits(
  config: DualConfig,
  profileIndex: number,
  now: number,
  timeoutMs: number,
  deadline: number,
): boolean {
  const laterProviderWindows = config.profiles
    .slice(profileIndex + 1)
    .reduce((sum, profile) => sum + profile.timeoutMs, 0);

  return now + timeoutMs + laterProviderWindows + WORKSHEET_AI_FINALIZATION_AND_TRANSITION_RESERVE_MS <= deadline;
}

function safeError(
  result: AttemptResult,
  alias: 'primary' | 'secondary',
  attempts: number,
): WorksheetAiProviderError {
  if (result.kind === 'terminal_http' || result.kind === 'retryable_http') {
    return new WorksheetAiProviderError('AI_PROVIDER_HTTP_ERROR', attempts, { alias, status: result.status });
  }
  if (result.kind === 'safety') {
    return new WorksheetAiProviderError('AI_PROVIDER_SAFETY_REJECTION', attempts, { alias, status: result.status });
  }
  if (result.kind === 'timeout') return new WorksheetAiProviderError('AI_PROVIDER_TIMEOUT', attempts, { alias });
  if (result.kind === 'malformed') return new WorksheetAiProviderError('AI_PROVIDER_MALFORMED_RESPONSE', attempts, { alias });
  return new WorksheetAiProviderError('AI_PROVIDER_EXHAUSTED', attempts, { alias });
}

function logAttempt(
  alias: 'primary' | 'secondary',
  attempt: number,
  durationMs: number,
  result: AttemptResult,
): void {
  const status = 'status' in result ? result.status : undefined;
  console.info('[worksheet-ai-provider]', {
    alias,
    attempt,
    durationMs,
    failureKind: result.kind,
    ...(status === undefined ? {} : { status }),
  });
}

async function attempt(
  profile: WorksheetAiProviderProfile,
  prompt: string,
  dependencies: RuntimeDependencies,
  attemptDeadline: number,
): Promise<AttemptResult> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const expired = () => timedOut || dependencies.now() >= attemptDeadline;
  const timeoutResult = (): AttemptResult => {
    timedOut = true;
    try {
      controller.abort();
    } catch {
      // Abort is best effort for test doubles and already-settled requests.
    }
    return { kind: 'timeout' };
  };

  try {
    let resolveTimeout: (value: typeof TIMEOUT) => void = () => undefined;
    const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
      resolveTimeout = resolve;
    });
    timer = dependencies.setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch {
        // Abort is best effort for test doubles and already-settled requests.
      }
      resolveTimeout(TIMEOUT);
    }, Math.max(0, attemptDeadline - dependencies.now()));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (profile.authScheme === 'api-key') headers['api-key'] = profile.apiKey;
    else headers.Authorization = `Bearer ${profile.apiKey}`;

    const fetchPromise = Promise.resolve().then(() => dependencies.fetch(
      `${profile.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody(profile, prompt)),
        redirect: 'manual',
        signal: controller.signal,
      },
    ));
    fetchPromise.catch(() => undefined);
    const fetched = await Promise.race([fetchPromise, timeoutPromise]);
    if (fetched === TIMEOUT) return { kind: 'timeout' };
    if (expired()) return timeoutResult();

    const response = fetched as Response;
    const terminalStatus = isTerminalStatus(response.status);
    // A 400 response may carry the existing content-filter signal; all other
    // terminal statuses can fail closed without waiting for an untrusted body.
    if (terminalStatus && response.status !== 400) {
      return { kind: 'terminal_http', status: response.status };
    }
    const bodyPromise = Promise.resolve().then(() => response.text());
    bodyPromise.catch(() => undefined);
    let body: string | typeof TIMEOUT;
    try {
      body = await Promise.race([bodyPromise, timeoutPromise]);
    } catch {
      return terminalStatus
        ? { kind: 'terminal_http', status: response.status }
        : (expired() ? timeoutResult() : { kind: 'network' });
    }
    if (body === TIMEOUT) {
      return terminalStatus
        ? { kind: 'terminal_http', status: response.status }
        : { kind: 'timeout' };
    }
    if (expired()) {
      return terminalStatus
        ? { kind: 'terminal_http', status: response.status }
        : timeoutResult();
    }

    const text = String(body);
    let outer: unknown;
    try {
      outer = JSON.parse(text);
    } catch {
      if (expired()) return timeoutResult();
      if (!response.ok && isSafetySignal(text)) return { kind: 'safety', status: response.status };
      if (response.ok) return { kind: 'malformed' };
      return isRetryableStatus(response.status)
        ? { kind: 'retryable_http', status: response.status }
        : { kind: 'terminal_http', status: response.status };
    }

    if (expired()) return timeoutResult();
    const item = completion(outer);
    if (item?.refusal?.trim() || isSafetySignal(item?.finishReason) || hasSafetySignal(outer)) {
      return { kind: 'safety', status: response.ok ? undefined : response.status };
    }
    if (!response.ok) {
      return isRetryableStatus(response.status)
        ? { kind: 'retryable_http', status: response.status }
        : { kind: 'terminal_http', status: response.status };
    }
    if (item?.finishReason === 'length' || !item?.content?.trim()) return { kind: 'malformed' };

    try {
      const trimmed = item.content.trim();
      const codeBlock = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      const value = JSON.parse(codeBlock ? codeBlock[1].trim() : trimmed);
      if (expired()) return timeoutResult();
      return { kind: 'success', value };
    } catch {
      return expired() ? timeoutResult() : { kind: 'malformed' };
    }
  } catch {
    return expired() ? timeoutResult() : { kind: 'network' };
  } finally {
    if (timer !== undefined) {
      try {
        dependencies.clearTimeout(timer);
      } catch {
        // Timer cleanup is best effort for test doubles.
      }
    }
  }
}

export async function requestWorksheetAiProvider(
  prompt: string,
  config: DualConfig,
  suppliedDependencies: WorksheetAiProviderDependencies = {},
): Promise<unknown> {
  const rawFetch = suppliedDependencies.fetch ?? globalThis.fetch;
  const rawNow = suppliedDependencies.now ?? (() => Date.now());
  const rawSetTimeout = suppliedDependencies.setTimeout ?? globalThis.setTimeout;
  const rawClearTimeout = suppliedDependencies.clearTimeout ?? globalThis.clearTimeout;
  const dependencies: RuntimeDependencies = {
    fetch: ((...args: Parameters<typeof globalThis.fetch>) => rawFetch.call(globalThis, ...args)) as typeof globalThis.fetch,
    now: () => rawNow(),
    setTimeout: ((...args: Parameters<typeof globalThis.setTimeout>) => rawSetTimeout.call(globalThis, ...args)) as typeof globalThis.setTimeout,
    clearTimeout: ((...args: Parameters<typeof globalThis.clearTimeout>) => rawClearTimeout.call(globalThis, ...args)) as typeof globalThis.clearTimeout,
  };
  const startedAt = suppliedDependencies.startedAt ?? dependencies.now();
  const deadline = startedAt + config.totalTimeoutMs;
  let attempts = 0;
  let lastResult: AttemptResult = { kind: 'network' };
  let lastAlias: 'primary' | 'secondary' = 'secondary';
  let blockedByBudget = false;

  for (let index = 0; index < config.profiles.length; index += 1) {
    const provider = config.profiles[index];
    const alias = provider.alias;
    lastAlias = alias;
    let canRetryMalformed = true;

    while (attempts < MAX_PHYSICAL_ATTEMPTS) {
      const attemptStartedAt = dependencies.now();
      if (!remainingWindowFits(config, index, attemptStartedAt, provider.timeoutMs, deadline)) {
        blockedByBudget = true;
        if (attempts === 0) {
          throw new WorksheetAiProviderError('AI_PROVIDER_BUDGET_EXCEEDED', attempts, { alias });
        }
        break;
      }

      attempts += 1;
      const result = await attempt(provider, prompt, dependencies, attemptStartedAt + provider.timeoutMs);
      const durationMs = Math.max(0, Math.floor(dependencies.now() - attemptStartedAt));
      lastResult = result;
      logAttempt(alias, attempts, durationMs, result);
      if (result.kind === 'success') return result.value;

      if (result.kind === 'safety' || result.kind === 'terminal_http') {
        throw safeError(result, alias, attempts);
      }
      if (result.kind === 'malformed' && canRetryMalformed) {
        canRetryMalformed = false;
        if (remainingWindowFits(config, index, dependencies.now(), provider.timeoutMs, deadline)) continue;
      }
      break;
    }
  }

  if (blockedByBudget) {
    throw new WorksheetAiProviderError('AI_PROVIDER_BUDGET_EXCEEDED', attempts, { alias: lastAlias });
  }
  throw safeError(lastResult, lastAlias, attempts);
}
