export type WorksheetAiProviderAlias = 'primary' | 'secondary';
export type WorksheetAiProviderAuthScheme = 'bearer' | 'api-key';

export interface WorksheetAiProviderProfile {
  alias: WorksheetAiProviderAlias;
  baseUrl: string;
  apiKey: string;
  model: string;
  authScheme: WorksheetAiProviderAuthScheme;
  timeoutMs: number;
  temperature?: number;
}

export type WorksheetMakerAiProviderConfig =
  | { mode: 'legacy' }
  | {
    mode: 'dual';
    totalTimeoutMs: number;
    profiles: [WorksheetAiProviderProfile, WorksheetAiProviderProfile];
  };

export type WorksheetAiProviderConfigErrorCode =
  | 'INVALID_MODE'
  | 'INVALID_TOTAL_TIMEOUT_MS'
  | 'MISSING_PROFILE_FIELD'
  | 'INVALID_BASE_URL'
  | 'INVALID_API_KEY'
  | 'INVALID_MODEL'
  | 'INVALID_AUTH_SCHEME'
  | 'INVALID_TIMEOUT_MS'
  | 'INVALID_TEMPERATURE'
  | 'TIMEOUT_BUDGET_EXCEEDED';

const ERROR_MESSAGES: Record<WorksheetAiProviderConfigErrorCode, string> = {
  INVALID_MODE: 'Invalid worksheet AI provider mode.',
  INVALID_TOTAL_TIMEOUT_MS: 'Invalid worksheet AI provider total timeout.',
  MISSING_PROFILE_FIELD: 'Worksheet AI provider profile is incomplete.',
  INVALID_BASE_URL: 'Invalid worksheet AI provider base URL.',
  INVALID_API_KEY: 'Invalid worksheet AI provider API key.',
  INVALID_MODEL: 'Invalid worksheet AI provider model.',
  INVALID_AUTH_SCHEME: 'Invalid worksheet AI provider authentication scheme.',
  INVALID_TIMEOUT_MS: 'Invalid worksheet AI provider timeout.',
  INVALID_TEMPERATURE: 'Invalid worksheet AI provider temperature.',
  TIMEOUT_BUDGET_EXCEEDED: 'Worksheet AI provider timeout budget exceeded.',
};

const DEFAULT_TOTAL_TIMEOUT_MS = 52000;
const MIN_TOTAL_TIMEOUT_MS = 10000;
const MIN_PROVIDER_TIMEOUT_MS = 1000;
const FINALIZATION_AND_TRANSITION_RESERVE_MS = 5500;

export class WorksheetAiProviderConfigError extends Error {
  readonly code: WorksheetAiProviderConfigErrorCode;

  constructor(code: WorksheetAiProviderConfigErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WorksheetAiProviderConfigError';
    this.code = code;
  }
}

function fail(code: WorksheetAiProviderConfigErrorCode): never {
  throw new WorksheetAiProviderConfigError(code);
}

function supplied(env: Record<string, unknown>, name: string): unknown {
  return Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined;
}

function requiredText(
  env: Record<string, unknown>,
  name: string,
  code: WorksheetAiProviderConfigErrorCode,
): string {
  const value = supplied(env, name);
  if (value === undefined) fail('MISSING_PROFILE_FIELD');
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function integer(
  env: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
  code: WorksheetAiProviderConfigErrorCode,
  missingCode: WorksheetAiProviderConfigErrorCode = code,
): number {
  const value = supplied(env, name);
  if (value === undefined) fail(missingCode);
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(code);

  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) fail(code);
  return result;
}

function optionalTemperature(env: Record<string, unknown>, name: string): number | undefined {
  const value = supplied(env, name);
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) {
    fail('INVALID_TEMPERATURE');
  }

  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 2) fail('INVALID_TEMPERATURE');
  return result;
}

function baseUrl(env: Record<string, unknown>, name: string): string {
  const raw = requiredText(env, name, 'INVALID_BASE_URL');
  if (/[?#]/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) fail('INVALID_BASE_URL');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail('INVALID_BASE_URL');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || normalizedPath.endsWith('/chat/completions')
  ) {
    fail('INVALID_BASE_URL');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function profile(
  env: Record<string, unknown>,
  alias: WorksheetAiProviderAlias,
): WorksheetAiProviderProfile {
  const prefix = `WORKSHEET_MAKER_AI_${alias.toUpperCase()}_`;
  const apiKey = (() => {
    const raw = supplied(env, `${prefix}API_KEY`);
    if (raw === undefined) fail('MISSING_PROFILE_FIELD');
    if (typeof raw !== 'string' || /[\r\n\u0000-\u001f\u007f]/.test(raw) || raw.trim() === '') {
      fail('INVALID_API_KEY');
    }
    return raw.trim();
  })();
  const model = requiredText(env, `${prefix}MODEL`, 'INVALID_MODEL');
  if (/\s|[\u0000-\u001f\u007f]/.test(model)) fail('INVALID_MODEL');

  const authScheme = requiredText(env, `${prefix}AUTH_SCHEME`, 'INVALID_AUTH_SCHEME');
  if (authScheme !== 'bearer' && authScheme !== 'api-key') fail('INVALID_AUTH_SCHEME');

  const result: WorksheetAiProviderProfile = {
    alias,
    baseUrl: baseUrl(env, `${prefix}BASE_URL`),
    apiKey,
    model,
    authScheme,
    timeoutMs: integer(
      env,
      `${prefix}TIMEOUT_MS`,
      MIN_PROVIDER_TIMEOUT_MS,
      Number.MAX_SAFE_INTEGER,
      'INVALID_TIMEOUT_MS',
      'MISSING_PROFILE_FIELD',
    ),
  };

  const temperature = optionalTemperature(env, `${prefix}TEMPERATURE`);
  if (temperature !== undefined) result.temperature = temperature;
  return result;
}

export function resolveWorksheetMakerAiProviderConfig(
  env: Record<string, unknown> | null | undefined = process.env,
): WorksheetMakerAiProviderConfig {
  if (!env || typeof env !== 'object') return { mode: 'legacy' };

  const modeValue = supplied(env, 'WORKSHEET_MAKER_AI_MODE');
  const mode = typeof modeValue === 'string' ? modeValue.trim() : modeValue;
  if (mode === undefined || mode === '' || mode === 'legacy') return { mode: 'legacy' };
  if (mode !== 'dual') fail('INVALID_MODE');

  const totalTimeoutMs = supplied(env, 'WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS') === undefined
    ? DEFAULT_TOTAL_TIMEOUT_MS
    : integer(
      env,
      'WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS',
      MIN_TOTAL_TIMEOUT_MS,
      DEFAULT_TOTAL_TIMEOUT_MS,
      'INVALID_TOTAL_TIMEOUT_MS',
    );
  const profiles = [profile(env, 'primary'), profile(env, 'secondary')] as [
    WorksheetAiProviderProfile,
    WorksheetAiProviderProfile,
  ];

  if (profiles[0].timeoutMs + profiles[1].timeoutMs + FINALIZATION_AND_TRANSITION_RESERVE_MS > totalTimeoutMs) {
    fail('TIMEOUT_BUDGET_EXCEEDED');
  }

  return { mode: 'dual', totalTimeoutMs, profiles };
}

export const WORKSHEET_AI_FINALIZATION_AND_TRANSITION_RESERVE_MS = FINALIZATION_AND_TRANSITION_RESERVE_MS;
