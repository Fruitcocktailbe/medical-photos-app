import { defineConfig } from 'vitest/config';

// Only the pure core is unit-tested here; screens and native adapters are
// verified on the device (docs/spike-checklist.md).
export default defineConfig({
  test: { include: ['src/core/**/*.test.ts'] },
});
