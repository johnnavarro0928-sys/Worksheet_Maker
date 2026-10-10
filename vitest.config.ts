import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Keep tests off the real Claude API even if the shell exports a key.
    env: { ANTHROPIC_API_KEY: '' },
  },
})
