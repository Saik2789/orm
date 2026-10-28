import { canonicalize } from './canonicalize';
import type { MongoIndexKey } from './contract-types';
import type { MongoIndexInput } from './ir/mongo-index';

/**
 * Returns a function that accepts a list of options only when it names every member of `Option`;
 * a list missing one fails to compile, naming the missing option.
 */
export function listsEveryOption<Option extends string>() {
  return <const T extends readonly Option[]>(
    options: T &
      ([Exclude<Option, T[number]>] extends [never]
        ? unknown
        : { readonly unlistedOption: Exclude<Option, T[number]> }),
  ): T => options;
}

/** The index options that tell two indexes on the same keys apart: every option of an index. */
export const MONGO_INDEX_OPTION_KEYS = listsEveryOption<Exclude<keyof MongoIndexInput, 'keys'>>()([
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'wildcardProjection',
  'collation',
  'weights',
  'default_language',
  'language_override',
] as const);

export type MongoIndexOptionKey = (typeof MONGO_INDEX_OPTION_KEYS)[number];

/** An index as `indexLookupKey` reads it: the contract's `MongoIndex` and the schema IR's index both fit. */
export type MongoIndexLookupInput = { readonly keys: ReadonlyArray<MongoIndexKey> } & {
  readonly [Option in MongoIndexOptionKey]?: MongoIndexInput[Option] | undefined;
};

function keysOf(index: MongoIndexLookupInput): string {
  return index.keys.map((k) => `${k.field}:${k.direction}`).join(',');
}

/** Identifies an index by its keys and the options it sets; an option set to `false` counts as unset. */
export function indexLookupKey(index: MongoIndexLookupInput): string {
  const options = MONGO_INDEX_OPTION_KEYS.flatMap((option) => {
    const value = index[option];
    return value === undefined || value === null || value === false
      ? []
      : [`${option}:${canonicalize(value)}`];
  });
  return options.length > 0 ? `${keysOf(index)}|${options.join(';')}` : keysOf(index);
}
