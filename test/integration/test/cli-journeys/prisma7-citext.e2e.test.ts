/**
 * A Prisma 7 project with `@db.Citext` columns, against the database Prisma 7 built after `CREATE EXTENSION citext` ran. With the citext pack in `extensions`, `contract emit` reads the schema. The citext contract space reaches `migrations/` only through `migration plan`, and only `db migrate` gives its marker the invariant its baseline migration provides, so those two run before `db sign` and `db verify`. `db migrate` finds the extension and every table already in place.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { withClient } from '@repo/test-utils';
import { join } from 'pathe';
import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import { withTempDir, writeProjectManifest } from '../utils/cli-test-helpers';
import {
  type JourneyContext,
  runContractEmit,
  runDbSign,
  runDbVerify,
  runMigrate,
  runMigrationPlan,
  timeouts,
  useDevDatabase,
} from '../utils/journey-test-helpers';

const CITEXT_FIXTURE = join(__dirname, '../fixtures/prisma7-source/citext');
const JOURNEY_FIXTURES = join(__dirname, '../fixtures/cli/cli-e2e-test-app/fixtures/cli-journeys');
const PRISMA7_DATABASE = `CREATE EXTENSION IF NOT EXISTS citext;\n${readFileSync(
  join(CITEXT_FIXTURE, 'migration.sql'),
  'utf-8',
)}`;

function setupProject(createTempDir: () => string, connectionString: string): JourneyContext {
  const testDir = createTempDir();
  writeProjectManifest(testDir);
  mkdirSync(join(testDir, 'migrations'), { recursive: true });
  copyFileSync(join(CITEXT_FIXTURE, 'schema.prisma'), join(testDir, 'schema.prisma'));
  const config = readFileSync(
    join(JOURNEY_FIXTURES, 'prisma.config.prisma7-citext.ts'),
    'utf-8',
  ).replace(/\{\{DB_URL\}\}/g, () => connectionString);
  const configPath = join(testDir, 'prisma.config.ts');
  writeFileSync(configPath, config, 'utf-8');
  return { testDir, configPath, outputDir: testDir };
}

function output(run: { readonly stdout: string; readonly stderr: string }): string {
  return `${stripAnsi(run.stderr)}\n${stripAnsi(run.stdout)}`;
}

withTempDir(({ createTempDir }) => {
  describe('Journey: Prisma 7 schema with citext columns', () => {
    const db = useDevDatabase({
      onReady: (cs) => withClient(cs, (client) => client.query(PRISMA7_DATABASE)),
    });

    it(
      'contract emit, migration plan, db migrate, db sign and db verify succeed with the citext pack composed',
      async () => {
        const ctx = setupProject(createTempDir, db.connectionString);

        const emit = await runContractEmit(ctx, ['--json']);
        expect(emit.exitCode, `contract emit\n${output(emit)}`).toBe(0);

        const plan = await runMigrationPlan(ctx, ['--name', 'adopt']);
        expect(plan.exitCode, `migration plan\n${output(plan)}`).toBe(0);
        expect(existsSync(join(ctx.testDir, 'migrations', 'citext', 'refs', 'head.json'))).toBe(
          true,
        );

        const migrate = await runMigrate(ctx);
        expect(migrate.exitCode, `db migrate\n${output(migrate)}`).toBe(0);

        const sign = await runDbSign(ctx, ['--json']);
        expect(sign.exitCode, `db sign\n${output(sign)}`).toBe(0);

        const verify = await runDbVerify(ctx, ['--json', '--strict']);
        expect(verify.exitCode, `db verify --strict\n${output(verify)}`).toBe(0);
        expect(verify.presented?.data).toMatchObject({
          ok: true,
          schema: { strict: true, warnings: [] },
        });
      },
      timeouts.spinUpPpgDev,
    );
  });
});
