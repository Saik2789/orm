import { describe, expect, it } from 'vitest';
import { detectionPatterns } from '../guide-detections';

const EXTENSION_GUIDE =
  'upgrade-instructions/pending/mongo-merged-redundant-indexes/extension/instructions.md';

const matches = (content: string) =>
  detectionPatterns(EXTENSION_GUIDE, 'mongo-build-refusal-index-duplicate-removed').some(
    (pattern) => pattern.test(content),
  );

describe('the extension mongo-build-refusal-index-duplicate-removed detection', () => {
  it('matches code that names the indexDuplicate kind, and not other refusal kinds', () => {
    expect([
      matches("switch (refusal.kind) {\n  case 'indexDuplicate':\n    return;\n}"),
      matches("if (refusal.kind === 'indexDuplicate') return refusal.firstModel;"),
      matches("switch (refusal.kind) {\n  case 'indexShape':\n    return;\n}"),
      matches('const indexDuplicates = new Set<string>();'),
    ]).toEqual([true, true, false, false]);
  });
});
