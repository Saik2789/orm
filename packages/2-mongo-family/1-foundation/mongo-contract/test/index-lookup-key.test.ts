import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  indexLookupKey,
  MONGO_INDEX_OPTION_KEYS,
  type MongoIndexOptionKey,
} from '../src/index-lookup-key';
import { MongoIndex, type MongoIndexInput } from '../src/ir/mongo-index';

const keys = [{ field: 'email', direction: 1 as const }];

describe('MONGO_INDEX_OPTION_KEYS', () => {
  it('lists every index option', () => {
    expectTypeOf<MongoIndexOptionKey>().toEqualTypeOf<Exclude<keyof MongoIndexInput, 'keys'>>();
    expect(MONGO_INDEX_OPTION_KEYS).toHaveLength(9);
  });
});

describe('indexLookupKey', () => {
  const lookupKey = (options: Omit<MongoIndexInput, 'keys'>) =>
    indexLookupKey(new MongoIndex({ keys, ...options }));

  it('tells apart indexes that differ in any option, and ignores options set to false', () => {
    expect({
      plain: lookupKey({}),
      notSparse: lookupKey({ sparse: false }),
      reordered:
        lookupKey({ collation: { locale: 'en', strength: 2 } }) ===
        lookupKey({ collation: { strength: 2, locale: 'en' } }),
      distinct: new Set(
        [
          {},
          { unique: true },
          { sparse: true },
          { expireAfterSeconds: 0 },
          { partialFilterExpression: { a: 1 } },
          { wildcardProjection: { a: 1 as const } },
          { collation: { locale: 'en' } },
          { weights: { a: 2 } },
          { default_language: 'french' },
          { language_override: 'lang' },
        ].map(lookupKey),
      ).size,
    }).toEqual({ plain: 'email:1', notSparse: 'email:1', reordered: true, distinct: 10 });
  });

  it('gives unique set to false, sparse set to false and no options the same key, and a set option another', () => {
    expect({
      notUnique: lookupKey({ unique: false }),
      notSparse: lookupKey({ sparse: false }),
      unset: lookupKey({}),
      sparse: lookupKey({ sparse: true }),
      collation: lookupKey({ collation: { locale: 'fr' } }),
    }).toEqual({
      notUnique: 'email:1',
      notSparse: 'email:1',
      unset: 'email:1',
      sparse: 'email:1|sparse:true',
      collation: 'email:1|collation:{"locale":"fr"}',
    });
  });
});
