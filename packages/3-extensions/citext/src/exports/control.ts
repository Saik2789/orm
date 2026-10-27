import type { Contract } from '@internal/contract/types';
import type { SqlControlExtensionDescriptor } from '@internal/family-sql/control';
import { contractSpaceFromJson } from '@internal/migration-tools/spaces';
import type { SqlStorage } from '@internal/sql-contract/types';
import baselineMetadata from '../../migrations/20261027T0000_install_citext_extension/migration.json' with {
  type: 'json',
};
import baselineOps from '../../migrations/20261027T0000_install_citext_extension/ops.json' with {
  type: 'json',
};
import headRef from '../../migrations/refs/head.json' with { type: 'json' };
import contractJson from '../contract.json' with { type: 'json' };
import { CITEXT_BASELINE_MIGRATION_NAME, CITEXT_SPACE_ID } from '../core/contract-space-constants';
import { citextPackMeta } from '../core/descriptor-meta';

const citextContractSpace = contractSpaceFromJson<Contract<SqlStorage>>({
  contractJson,
  migrations: [
    {
      dirName: CITEXT_BASELINE_MIGRATION_NAME,
      metadata: baselineMetadata,
      ops: baselineOps,
    },
  ],
  headRef,
});

const citextExtensionDescriptor: SqlControlExtensionDescriptor<'postgres'> = {
  ...citextPackMeta,
  id: CITEXT_SPACE_ID,
  contractSpace: citextContractSpace,
  create: () => ({
    familyId: 'sql' as const,
    targetId: 'postgres' as const,
  }),
};

export { citextExtensionDescriptor };
export default citextExtensionDescriptor;
