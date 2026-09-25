import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'release/**',
    '.claude/**',
    '.remember/**',
    '.opencode/**',
    '.letta/**',
    'agents/**',
    'scripts/**',
  ]),
  ...nextVitals,
  ...nextTs,
  {
    files: ['build_scripts/**/*.js', 'electron/**/*.js', 'notify.js', 'playwright.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
])
