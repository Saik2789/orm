---
changes:
  - id: mongo-build-refusal-index-duplicate-removed
    summary: |
      The MongoDB contract builder's `BuildRefusal` type, exported from `@prisma/orm-family-mongo/contract-ts/contract-builder`, no longer has the kind `indexDuplicate`. The builder now merges identical and redundant indexes instead of refusing them. Remove any `case 'indexDuplicate'` and any other code that reads that kind.
    detection:
      glob: "**/*.{ts,mts,cts,tsx}"
      matches:
        - '\bindexDuplicate\b'
---

# The `indexDuplicate` refusal is gone

## `mongo-build-refusal-index-duplicate-removed`

Code that switches over `refusal.kind` no longer compiles while it names `indexDuplicate`. Delete that case:

```typescript
switch (refusal.kind) {
  case 'indexShape':
    return describeShape(refusal);
  // remove: case 'indexDuplicate': ...
}
```
