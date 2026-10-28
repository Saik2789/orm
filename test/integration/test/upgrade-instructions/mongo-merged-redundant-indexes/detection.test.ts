import { describe, expect, it } from 'vitest';
import { detectionPatterns } from '../guide-detections';

const APP_GUIDE = 'upgrade-instructions/pending/mongo-merged-redundant-indexes/app/instructions.md';

const EXTENSION_GUIDE =
  'upgrade-instructions/pending/mongo-merged-redundant-indexes/extension/instructions.md';

const extensionMatches = (content: string) =>
  detectionPatterns(EXTENSION_GUIDE, 'mongo-build-refusal-index-duplicate-removed').some(
    (pattern) => pattern.test(content),
  );

const matches = (content: string) =>
  detectionPatterns(APP_GUIDE, 'mongo-merged-redundant-indexes').some((pattern) =>
    pattern.test(content),
  );

const mongoBuilderImport =
  "import { defineContract, field, index, model } from '@prisma/orm-mongo/contract-builder';\n";

const mongoModel = (body: string) => `model User {
  id    ObjectId @id @map("_id")
${body}
}
`;

describe('the app mongo-merged-redundant-indexes detection', () => {
  it('matches a PSL MongoDB model with a unique and a plain index on the same keys', () => {
    expect([
      matches(mongoModel('  email String @unique\n\n  @@index([email])')),
      matches(mongoModel('  a String\n  b String\n  @@unique([a, b])\n  @@index([a, b])')),
      matches(mongoModel('  a String\n  b String\n  @@index([a, b])\n  @@unique([a, b])')),
    ]).toEqual([true, true, true]);
  });

  it('does not match other keys, a SQL schema, or two plain indexes', () => {
    expect([
      matches(mongoModel('  email String @unique\n  name String\n  @@index([name])')),
      matches(mongoModel('  a String\n  b String\n  @@unique([a, b])\n  @@index([b, a])')),
      matches('model User {\n  id Int @id\n  email String @unique\n  @@index([email])\n}\n'),
      matches(mongoModel('  email String\n  @@index([email])\n  @@index([email])')),
      matches(mongoModel('  email String @unique\n  @@index([email], sparse: true)')),
    ]).toEqual([false, false, false, false, false]);
  });

  it('matches a defineContract file with a unique and a plain index on the same keys', () => {
    expect([
      matches(
        `${mongoBuilderImport}indexes: [index({ email: 1 }, { unique: true }), index({ email: 1 })]`,
      ),
      matches(
        `${mongoBuilderImport}indexes: [index({ email: 1 }), index({ email: 1 }, { unique: true })]`,
      ),
    ]).toEqual([true, true]);
  });

  it('does not match other keys, or a file without the MongoDB builder', () => {
    expect([
      matches(
        `${mongoBuilderImport}indexes: [index({ email: 1 }, { unique: true }), index({ name: 1 })]`,
      ),
      matches(
        `${mongoBuilderImport}indexes: [index({ email: 1 }, { unique: true }), index({ email: -1 })]`,
      ),
      matches('indexes: [index({ email: 1 }, { unique: true }), index({ email: 1 })]'),
      matches(
        `${mongoBuilderImport}indexes: [index({ email: 1 }, { unique: true, sparse: true }), index({ email: 1 })]`,
      ),
    ]).toEqual([false, false, false, false]);
  });
});

describe('the extension mongo-build-refusal-index-duplicate-removed detection', () => {
  it('matches code that names the indexDuplicate kind, and not other refusal kinds', () => {
    expect([
      extensionMatches("switch (refusal.kind) {\n  case 'indexDuplicate':\n    return;\n}"),
      extensionMatches("if (refusal.kind === 'indexDuplicate') return refusal.firstModel;"),
      extensionMatches("switch (refusal.kind) {\n  case 'indexShape':\n    return;\n}"),
      extensionMatches('const indexDuplicates = new Set<string>();'),
    ]).toEqual([true, true, false, false]);
  });
});
