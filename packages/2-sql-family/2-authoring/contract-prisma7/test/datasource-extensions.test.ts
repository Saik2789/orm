import { prisma7PostgresBinding } from '@internal/target-postgres/prisma7-binding';
import { describe, expect, it } from 'vitest';
import { interpretSchemaText, interpretSchemaTextResult, serializedNamespaces } from './support';

function schemaListing(
  extensions: string,
  generators = 'previewFeatures = ["postgresqlExtensions"]',
) {
  return `datasource db {
  provider   = "postgresql"
  extensions = ${extensions}
}

generator client {
  provider = "prisma-client"
  ${generators}
}

model User {
  id Int @id
}
`;
}

/** A stand-in pgvector contract declaring `vector` in `schema`, read from a Prisma 7 schema with no pack for it. */
function pgvectorDeclaringIn(schema: string) {
  const packless = {
    ...prisma7PostgresBinding,
    extensions: { ...prisma7PostgresBinding.extensions, packs: {} },
  };
  const result = interpretSchemaTextResult(
    schemaListing(`[vector(schema: "${schema}")]`),
    packless,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.failure.diagnostics));
  return new Map([['pgvector', result.value]]);
}

function diagnosticsOf(text: string, composedPacks = new Map()) {
  const result = interpretSchemaTextResult(text, prisma7PostgresBinding, composedPacks);
  if (result.ok) throw new Error('The schema interpreted to a contract');
  return result.failure.diagnostics.map(({ code, message }) => ({ code, message }));
}

describe('the datasource extensions list', () => {
  it('keeps the first of two entries for one extension', () => {
    const namespaces = serializedNamespaces(
      interpretSchemaText(schemaListing('[pg_trgm, pg_trgm(schema: "extensions")]')),
    );
    expect(namespaces['public']?.entries['extension']).toEqual({
      pg_trgm: { kind: 'extension', name: 'pg_trgm' },
    });
    expect(namespaces['extensions']).toBeUndefined();
  });

  it('reads the preview feature from any generator block', () => {
    const text = `${schemaListing('[pg_trgm]', '')}
generator other {
  provider        = "prisma-client"
  previewFeatures = ["postgresqlExtensions"]
}
`;
    expect(interpretSchemaTextResult(text).ok).toBe(true);
  });

  it('keeps the other arguments in the edit that replaces map', () => {
    expect(diagnosticsOf(schemaListing('[trgm(map: "pg_trgm", schema: "extensions")]'))).toEqual([
      {
        code: 'PSL.PRISMA7_EXTENSION_ARGUMENT_UNSUPPORTED',
        message:
          'Extension "trgm": the map argument is not supported. Replace trgm(map: "pg_trgm", schema: "extensions") with pg_trgm(schema: "extensions"), the extension\'s name in the database; Prisma 7\'s next migration is then empty.',
      },
    ]);
  });

  it('refuses map naming an extension Prisma 7 can write only with map', () => {
    expect(diagnosticsOf(schemaListing('[uuid_ossp(map: "uuid-ossp")]'))).toEqual([
      {
        code: 'PSL.PRISMA7_EXTENSION_ARGUMENT_UNSUPPORTED',
        message:
          'Extension "uuid_ossp": the map argument is not supported, and Prisma 7 can write the name "uuid-ossp" only with map, so Prisma 8 cannot read this schema until it reads map.',
      },
    ]);
  });

  it('refuses arguments Prisma 7 refuses', () => {
    expect(diagnosticsOf(schemaListing('[a("x"), b(foo: "x"), c(schema: 1), "d", e.f]'))).toEqual([
      {
        code: 'PSL_INVALID_EXTENSION_BLOCK_MEMBER',
        message:
          'datasource "db": the value of "extensions" holds the dotted path e.f, which Prisma 7 does not accept in a datasource block.',
      },
      {
        code: 'PSL.PRISMA7_EXTENSION_ARGUMENT_UNSUPPORTED',
        message:
          'Extension "a": the argument "x" has no name, and Prisma 7 refuses it too. Remove it.',
      },
      {
        code: 'PSL.PRISMA7_EXTENSION_ARGUMENT_UNSUPPORTED',
        message:
          'Extension "b": argument "foo" is not known, and Prisma 7 refuses it too. Remove it.',
      },
      {
        code: 'PSL.PRISMA7_EXTENSION_ARGUMENT_UNSUPPORTED',
        message: 'Extension "c": schema must be a string, and Prisma 7 refuses schema: 1 too.',
      },
      {
        code: 'PSL_INVALID_EXTENSION_BLOCK_MEMBER',
        message:
          'datasource "db": extensions lists "d", which is not an extension name, and Prisma 7 refuses it too. List each extension by name, such as extensions = [pg_trgm].',
      },
    ]);
  });

  it('refuses a value that is not a list', () => {
    expect(diagnosticsOf(schemaListing('pg_trgm'))).toEqual([
      {
        code: 'PSL_INVALID_EXTENSION_BLOCK_MEMBER',
        message:
          'datasource "db": extensions is pg_trgm, which is not a list, and Prisma 7 refuses it too. List each extension by name, such as extensions = [pg_trgm].',
      },
    ]);
  });

  describe('an extension a composed pack declares', () => {
    it('is accepted in the schema the pack declares it in', () => {
      const result = interpretSchemaTextResult(
        schemaListing('[vector(schema: "extensions")]'),
        prisma7PostgresBinding,
        pgvectorDeclaringIn('extensions'),
      );
      expect(result.ok).toBe(true);
    });

    it('refuses schema: naming another schema', () => {
      expect(
        diagnosticsOf(
          schemaListing('[vector(schema: "extensions")]'),
          pgvectorDeclaringIn('public'),
        ),
      ).toEqual([
        {
          code: 'PSL.PRISMA7_EXTENSION_SCHEMA_MISMATCH',
          message:
            'Extension "vector": the "pgvector" extension pack declares it in schema "public", so Prisma 8 expects it there, but this entry puts it in schema "extensions". Moving it is a database change the pack does not make: move it with ALTER EXTENSION "vector" SET SCHEMA "public", then remove schema: "extensions".',
        },
      ]);
    });

    it('refuses an entry without schema: when the pack declares it elsewhere', () => {
      expect(diagnosticsOf(schemaListing('[vector]'), pgvectorDeclaringIn('extensions'))).toEqual([
        {
          code: 'PSL.PRISMA7_EXTENSION_SCHEMA_MISMATCH',
          message:
            'Extension "vector": the "pgvector" extension pack declares it in schema "extensions", so Prisma 8 expects it there, but this entry puts it in schema "public". Moving it is a database change the pack does not make: move it with ALTER EXTENSION "vector" SET SCHEMA "extensions", then write vector(schema: "extensions").',
        },
      ]);
    });
  });
});
