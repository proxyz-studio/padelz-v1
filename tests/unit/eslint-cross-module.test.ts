import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('Cross-module internal import rule', () => {
  it('blocks importing another feature\'s internal subdirectory', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' });
    const results = await eslint.lintText(
      `import { foo } from '@/features/tournaments/internal/secrets';`,
      { filePath: 'src/features/scoring/calculate.ts' }
    );
    const violations = results[0].messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('allows importing another feature\'s types.ts', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' });
    const results = await eslint.lintText(
      `import type { Tier } from '@/features/profiles/types';`,
      { filePath: 'src/features/scoring/calculate.ts' }
    );
    const violations = results[0].messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(violations.length).toBe(0);
  });
});
