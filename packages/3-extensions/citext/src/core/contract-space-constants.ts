/**
 * Names shared by citext's contract, baseline migration, head ref and descriptor. An invariantId is immutable once published: other spaces and the marker table match it by its literal text.
 */

export const CITEXT_SPACE_ID = 'citext' as const;

export const CITEXT_NATIVE_TYPE = 'citext' as const;

export const CITEXT_BASELINE_MIGRATION_NAME = '20261027T0000_install_citext_extension' as const;

export const CITEXT_INVARIANTS = {
  installCitext: 'citext:install-citext-v1',
} as const;
