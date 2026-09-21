import { describe, expect, it } from 'vitest';
import {
  WorksheetAiProviderConfigError,
  resolveWorksheetMakerAiProviderConfig,
} from './aiProviderConfig';

const primarySecret = 'primary-sentinel-secret';
const secondarySecret = 'secondary-sentinel-secret';

function profile(prefix: string, overrides: Record<string, string> = {}) {
  return {
    [`${prefix}BASE_URL`]: `https://${prefix.toLowerCase()}example.test/v1///`,
    [`${prefix}API_KEY`]: prefix.includes('PRIMARY') ? primarySecret : secondarySecret,
    [`${prefix}MODEL`]: `${prefix.toLowerCase()}model`,
    [`${prefix}AUTH_SCHEME`]: 'bearer',
    [`${prefix}TIMEOUT_MS`]: '15000',
    ...overrides,
  };
}

function dualEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    WORKSHEET_MAKER_AI_MODE: 'dual',
    WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS: '52000',
    ...profile('WORKSHEET_MAKER_AI_PRIMARY_'),
    ...profile('WORKSHEET_MAKER_AI_SECONDARY_', {
      WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS: '30000',
    }),
    ...overrides,
  };
}

function expectConfigError(env: Record<string, string>, code: string) {
  let thrown: unknown;

  try {
    resolveWorksheetMakerAiProviderConfig(env);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(WorksheetAiProviderConfigError);
  const configError = thrown as WorksheetAiProviderConfigError;
  expect(configError.code).toBe(code);
  expect(configError.message).not.toContain(primarySecret);
  expect(configError.message).not.toContain(secondarySecret);
  expect(JSON.stringify(configError)).not.toContain(primarySecret);
  expect(JSON.stringify(configError)).not.toContain(secondarySecret);
}

describe('resolveWorksheetMakerAiProviderConfig', () => {
  it('keeps blank, unset, and legacy modes on the legacy provider path', () => {
    expect(resolveWorksheetMakerAiProviderConfig({})).toEqual({ mode: 'legacy' });
    expect(resolveWorksheetMakerAiProviderConfig({
      WORKSHEET_MAKER_AI_MODE: '   ',
      WORKSHEET_MAKER_AI_PRIMARY_API_KEY: '',
    })).toEqual({ mode: 'legacy' });
    expect(resolveWorksheetMakerAiProviderConfig({
      WORKSHEET_MAKER_AI_MODE: 'legacy',
      WORKSHEET_MAKER_AI_PRIMARY_BASE_URL: 'not-a-url',
    })).toEqual({ mode: 'legacy' });
  });

  it('resolves two independent profiles and preserves temperature zero', () => {
    const env = dualEnv({
      WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME: 'api-key',
      WORKSHEET_MAKER_AI_PRIMARY_TEMPERATURE: '0',
      WORKSHEET_MAKER_AI_SECONDARY_TEMPERATURE: '0.7',
    });

    expect(resolveWorksheetMakerAiProviderConfig(env)).toEqual({
      mode: 'dual',
      totalTimeoutMs: 52000,
      profiles: [
        {
          alias: 'primary',
          baseUrl: 'https://worksheet_maker_ai_primary_example.test/v1',
          apiKey: primarySecret,
          model: 'worksheet_maker_ai_primary_model',
          authScheme: 'api-key',
          timeoutMs: 15000,
          temperature: 0,
        },
        {
          alias: 'secondary',
          baseUrl: 'https://worksheet_maker_ai_secondary_example.test/v1',
          apiKey: secondarySecret,
          model: 'worksheet_maker_ai_secondary_model',
          authScheme: 'bearer',
          timeoutMs: 30000,
          temperature: 0.7,
        },
      ],
    });
  });

  it('accepts the 52000 / 15000 / 30000 timeout budget', () => {
    expect(resolveWorksheetMakerAiProviderConfig(dualEnv()).mode).toBe('dual');
  });

  it('rejects an over-budget timeout configuration without leaking secrets', () => {
    expectConfigError(dualEnv({
      WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS: '30000',
      WORKSHEET_MAKER_AI_SECONDARY_TIMEOUT_MS: '30000',
    }), 'TIMEOUT_BUDGET_EXCEEDED');
  });

  it.each([
    'http://primary.example.test/v1',
    'https://user:pass@primary.example.test/v1',
    'https://primary.example.test/v1?query=1',
    'https://primary.example.test/v1#fragment',
    'https://primary.example.test/v1/chat/completions',
    'https://primary.example.test/v1/chat/completions/',
    'https://primary.example.test/v1\u0000bad',
  ])('rejects invalid provider base URL %j', (baseUrl) => {
    expectConfigError(dualEnv({
      WORKSHEET_MAKER_AI_PRIMARY_BASE_URL: baseUrl,
    }), 'INVALID_BASE_URL');
  });

  it.each([
    ['WORKSHEET_MAKER_AI_PRIMARY_AUTH_SCHEME', 'basic', 'INVALID_AUTH_SCHEME'],
    ['WORKSHEET_MAKER_AI_PRIMARY_MODEL', 'model name', 'INVALID_MODEL'],
    ['WORKSHEET_MAKER_AI_PRIMARY_API_KEY', 'key\nvalue', 'INVALID_API_KEY'],
    ['WORKSHEET_MAKER_AI_PRIMARY_TIMEOUT_MS', '1.5', 'INVALID_TIMEOUT_MS'],
    ['WORKSHEET_MAKER_AI_TOTAL_TIMEOUT_MS', '', 'INVALID_TOTAL_TIMEOUT_MS'],
    ['WORKSHEET_MAKER_AI_PRIMARY_TEMPERATURE', '', 'INVALID_TEMPERATURE'],
    ['WORKSHEET_MAKER_AI_PRIMARY_TEMPERATURE', '2.1', 'INVALID_TEMPERATURE'],
  ])('rejects invalid %s values', (name, value, code) => {
    expectConfigError(dualEnv({ [name]: value }), code);
  });

  it('requires every field in each dual provider profile', () => {
    for (const suffix of ['BASE_URL', 'API_KEY', 'MODEL', 'AUTH_SCHEME', 'TIMEOUT_MS']) {
      const env = dualEnv();
      delete env[`WORKSHEET_MAKER_AI_SECONDARY_${suffix}`];
      expectConfigError(env, 'MISSING_PROFILE_FIELD');
    }
  });
});
