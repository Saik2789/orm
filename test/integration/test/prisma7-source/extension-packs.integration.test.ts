import paradedb from '@internal/extension-paradedb/control';
import pgvector from '@internal/extension-pgvector/control';
import postgis from '@internal/extension-postgis/control';
import { prisma7PostgresBinding } from '@internal/target-postgres/prisma7-binding';
import { describe, expect, it } from 'vitest';

const descriptors = new Map([pgvector, postgis, paradedb].map((pack) => [pack.id, pack]));

interface SerializedNamespaces {
  readonly storage: {
    readonly namespaces: Record<string, { readonly entries: { readonly extension?: object } }>;
  };
}

function declaredExtensions(contractJson: unknown): string[] {
  return Object.values((contractJson as SerializedNamespaces).storage.namespaces).flatMap(
    (namespace) => Object.keys(namespace.entries.extension ?? {}),
  );
}

describe('the Prisma 7 binding’s extension packs', () => {
  for (const [extension, pack] of Object.entries(prisma7PostgresBinding.extensions.packs)) {
    it(`names the pack whose contract declares ${extension}`, () => {
      const descriptor = descriptors.get(pack.id);
      expect(descriptor?.id).toBe(pack.id);
      expect(declaredExtensions(descriptor?.contractSpace?.contractJson)).toContain(extension);
    });
  }
});
