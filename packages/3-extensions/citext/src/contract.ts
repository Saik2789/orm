/**
 * citext's contract space ships no tables. It registers the `citext` database type under `storage.types`, as pgvector registers `vector`, so the space's pinned contract names the type its baseline migration installs.
 *
 * The source is TypeScript because PSL's `types {}` block names an application's own types and has no way for a pack to register a database type under its native name.
 *
 * @see docs/architecture docs/adrs/ADR 212 - Contract spaces.md
 */

import { assembleDataTypes } from '@internal/framework-components/codec';
import { defineContract } from '@internal/postgres/contract-builder';
import { assemblePostgresCodecRegistryWithBuiltins } from '@internal/target-postgres/codecs';
import { postgresDataTypes } from '@internal/target-postgres/data-types';
import { CITEXT_CODEC_ID } from './core/constants';
import { CITEXT_NATIVE_TYPE } from './core/contract-space-constants';
import { citextDataTypes } from './core/data-types';
import { citextCodecRegistry } from './core/registry';

const dataTypeLookup = assembleDataTypes([
  { id: 'postgres', dataTypes: postgresDataTypes },
  { id: 'citext', dataTypes: citextDataTypes },
]).lookup;
const codecLookup = assemblePostgresCodecRegistryWithBuiltins(
  [{ types: { codecTypes: { codecDescriptors: [...citextCodecRegistry.values()] } } }],
  dataTypeLookup,
);

export const contract = defineContract({ codecLookup, dataTypeLookup }, () => ({
  databaseTypes: {
    [CITEXT_NATIVE_TYPE]: {
      kind: 'codec-instance',
      codecId: CITEXT_CODEC_ID,
      typeParams: {},
    },
  },
  models: {},
}));

export default contract;
