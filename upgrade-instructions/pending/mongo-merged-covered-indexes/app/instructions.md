---
changes:
  - id: mongo-merged-covered-indexes
    summary: |
      Every MongoDB contract source now merges an index that another index in the same collection covers. Identical indexes, which TypeScript and PSL refused before (`CONTRACT.NAME_DUPLICATE`, `PSL_INVALID_INDEX`), become one index. A unique and a plain index on the same keys, such as `@unique` and `@@index` on one field, become one unique index; before, the contract held both and the migration that created them failed. No source change is needed. Run `prisma contract emit`; a contract that held such a pair gets a new storage hash. Delete a migration planned earlier that creates both indexes, and plan it again.
    detection:
      glob: "**/*.{ts,mts,cts,tsx,prisma}"
      matches:
        - '(?<![\s\S])(?=[\s\S]*(?:\bObjectId\b|"mongodb"))[\s\S]*\n\s*(\w+)\s[^\n]*@unique\b[\s\S]*@@index\(\[\1\]'
        - '(?<![\s\S])(?=[\s\S]*(?:\bObjectId\b|"mongodb"))[\s\S]*@@unique\((\[[^\]]*\])[\s\S]*@@index\(\1'
        - '(?<![\s\S])(?=[\s\S]*(?:\bObjectId\b|"mongodb"))[\s\S]*@@index\((\[[^\]]*\])[\s\S]*@@unique\(\1'
        - '@prisma/orm-(?:mongo|family-mongo/contract-ts)/contract-builder[\x27"][\s\S]*\bindex\(\s*(\{[^}]*\})\s*,\s*\{[^}]*\bunique\s*:\s*true[\s\S]*\bindex\(\s*\1\s*\)'
        - '@prisma/orm-(?:mongo|family-mongo/contract-ts)/contract-builder[\x27"][\s\S]*\bindex\(\s*(\{[^}]*\})\s*\)[\s\S]*\bindex\(\s*\1\s*,\s*\{[^}]*\bunique\s*:\s*true'
---

# MongoDB indexes another index covers are merged

An index covers another in the same collection when both have the same keys and the same options, counting an option set to `false` as unset; a unique index also covers a plain one. The contract keeps the unique index, or the first of two identical ones, where it was written:

```prisma
model User {
  id    ObjectId @id @map("_id")
  email String   @unique

  @@index([email])
}
```

This now gives one unique index on `{ email: 1 }`. Indexes on the same keys with a different collation, partial filter or other option stay separate.

## `mongo-merged-covered-indexes`

The detection matches a MongoDB schema or `defineContract` file that writes a unique and a plain index on the same keys. Identical indexes are not matched: the contract builder refused them before, so no working project has them.

1. Run `prisma contract emit`. If the storage hash changed, the contract held a unique and a plain index on the same keys.
2. A migration planned before this upgrade that creates both indexes never applied: its second `createIndex` fails with `MIGRATION.PRECHECK_FAILED`. Delete it and run `prisma migration plan` again.
3. If `prisma migration apply` stopped part way on that migration, the first index may already exist. Run `prisma db verify` before applying the new plan.
