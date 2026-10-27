import { describe, expect, it } from 'vitest';
import baselineOps from '../migrations/20261027T0000_install_citext_extension/ops.json' with {
  type: 'json',
};
import contractJson from '../src/contract.json' with { type: 'json' };
import citextControl from '../src/exports/control';

describe('the citext contract space', () => {
  it('has one baseline migration that installs citext with a stable invariant', () => {
    const space = citextControl.contractSpace;
    expect({
      id: citextControl.id,
      head: space?.headRef,
      migrations: space?.migrations.map((migration) => ({
        dirName: migration.dirName,
        from: migration.metadata.from,
        to: migration.metadata.to,
        invariants: migration.metadata.providedInvariants,
      })),
    }).toEqual({
      id: 'citext',
      head: {
        hash: contractJson.storage.storageHash,
        invariants: ['citext:install-citext-v1'],
      },
      migrations: [
        {
          dirName: '20261027T0000_install_citext_extension',
          from: null,
          to: contractJson.storage.storageHash,
          invariants: ['citext:install-citext-v1'],
        },
      ],
    });
    expect(baselineOps.flatMap((op) => op.execute.map((step) => step.sql))).toEqual([
      'CREATE EXTENSION IF NOT EXISTS citext',
    ]);
  });
});
