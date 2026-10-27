#!/usr/bin/env -S node
/**
 * citext's baseline migration: installs the `citext` contrib module. Hand-authored, because the space's contract has no tables for `migration plan` to diff; `node migration.ts` re-emits `ops.json` and `migration.json`. See ADR 212, contract-space package layout.
 */
import { Migration, MigrationCLI } from '@internal/target-postgres/migration';
import { CITEXT_INVARIANTS } from '../../src/core/contract-space-constants';

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: '4d5c833aafef1c0794d85d5554378630b4adc6f718b49d747301ef2c69da8811',
    };
  }

  override get operations() {
    return [
      this.installExtension({
        id: 'citext.install-citext-extension',
        extensionName: 'citext',
        invariantId: CITEXT_INVARIANTS.installCitext,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
