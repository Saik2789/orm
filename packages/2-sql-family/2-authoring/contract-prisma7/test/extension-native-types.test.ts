import type { ControlExtensionDescriptor } from '@internal/framework-components/control';
import { prisma7PostgresBinding } from '@internal/target-postgres/prisma7-binding';
import { describe, expect, it } from 'vitest';
import type { Prisma7TargetBinding } from '../src/target-binding';
import { interpretSchemaText, interpretSchemaTextResult, serializedTable } from './support';

const shoutPack: ControlExtensionDescriptor<'sql', 'postgres'> = {
  kind: 'extension',
  id: 'shout',
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.0.1',
  authoring: {
    type: {
      shout: {
        Shout: { kind: 'typeConstructor', output: { codecId: 'pg/xml@1' } },
      },
    },
  },
  create: () => ({ familyId: 'sql', targetId: 'postgres' }),
};

const binding: Prisma7TargetBinding = {
  ...prisma7PostgresBinding,
  typeMap: {
    ...prisma7PostgresBinding.typeMap,
    extensionNativeTypes: {
      Shout: {
        constructorName: 'shout.Shout',
        args: [],
        pack: { id: 'shout', importName: 'shout', importPath: '@example/shout/control' },
      },
    },
  },
};

const schema = `datasource db {
  provider = "postgresql"
}

model Account {
  id    Int      @id
  name  String   @db.Shout
  names String[] @db.Shout
}
`;

describe('a native type an extension pack provides', () => {
  it('reads as the pack constructor when the pack is composed', () => {
    const contract = interpretSchemaText(schema, { binding, extensions: [shoutPack] });
    expect(serializedTable(contract, 'Account').columns).toMatchObject({
      name: { codecId: 'pg/xml@1', nullable: false },
      names: { codecId: 'pg/xml@1', many: { elementNullable: true } },
    });
  });

  it('records the composed pack in the contract', () => {
    const contract = interpretSchemaText(schema, { binding, extensions: [shoutPack] });
    expect(contract.extensions).toEqual({
      shout: {
        kind: 'extension',
        id: 'shout',
        familyId: 'sql',
        targetId: 'postgres',
        version: '0.0.1',
      },
    });
  });

  it('names the config edit when the pack is not composed', () => {
    const result = interpretSchemaTextResult(schema, { binding });
    if (result.ok) throw new Error('expected the schema to be refused');
    expect(result.failure.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: 'PSL.PRISMA7_EXTENSION_PACK_MISSING',
        message:
          'Field "Account.name": native type "@db.Shout" is a column type of the "shout" extension pack, which the config does not compose. Add it to extensions in prisma.config.ts: import shout from \'@example/shout/control\', then extensions: [shout].',
      },
      {
        code: 'PSL.PRISMA7_EXTENSION_PACK_MISSING',
        message:
          'Field "Account.names": native type "@db.Shout" is a column type of the "shout" extension pack, which the config does not compose. Add it to extensions in prisma.config.ts: import shout from \'@example/shout/control\', then extensions: [shout].',
      },
    ]);
  });
});
