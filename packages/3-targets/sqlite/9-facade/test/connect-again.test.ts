import type { Contract } from '@internal/contract/types';
import { coreHash } from '@internal/contract/types';
import sqliteDriver from '@internal/driver-sqlite/runtime';
import { SqlStorage } from '@internal/sql-contract/types';
import { RawQueryAst } from '@internal/sql-relational-core/ast';
import { planFromAst } from '@internal/sql-relational-core/plan';
import { sqliteCreateNamespace } from '@internal/target-sqlite/control';
import { createContract } from '@repo/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sqlite from '../src/runtime/sqlite';

const contract: Contract<SqlStorage> = createContract<SqlStorage>({
  target: 'sqlite',
  storage: new SqlStorage({
    storageHash: coreHash('sqlite-connect-again'),
    namespaces: {
      __unbound__: sqliteCreateNamespace({ id: '__unbound__', entries: { table: {} } }),
    },
  }),
});

const rowsPlan = () => planFromAst(RawQueryAst.rows(['select 1 as one'], {}), contract);

function client() {
  return sqlite({ contract, path: ':memory:' });
}

function driverConnectsWhenReleased() {
  let release: (outcome: { readonly error?: Error }) => void = () => undefined;
  const settled = new Promise<{ readonly error?: Error }>((resolve) => {
    release = resolve;
  });
  const createDriver = sqliteDriver.create.bind(sqliteDriver);
  vi.spyOn(sqliteDriver, 'create').mockImplementationOnce((options) => {
    const driver = createDriver(options);
    const connect = driver.connect.bind(driver);
    vi.spyOn(driver, 'connect').mockImplementationOnce(async (binding) => {
      const { error } = await settled;
      if (error !== undefined) throw error;
      return connect(binding);
    });
    return driver;
  });
  return release;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('connect() on a sqlite() client', () => {
  it('resolves with the runtime after a query connected the client', async () => {
    const db = client();
    await db.query(rowsPlan()).toArray();

    await expect(db.connect()).resolves.toBe(db.runtime());
    await db.close();
  });

  it('resolves with the same runtime when called twice', async () => {
    const db = client();
    const first = await db.connect();

    await expect(db.connect()).resolves.toBe(first);
    await db.close();
  });

  it('waits for a connection in progress and resolves with the same runtime', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const first = db.connect();
    const second = db.connect();
    release({});

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a).toBe(db.runtime());
    await db.close();
  });

  it('rejects with the error of the connection in progress when it fails', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const first = db.connect();
    const second = db.connect();
    release({ error: new Error('connect failed') });

    await expect(first).rejects.toThrow('connect failed');
    await expect(second).rejects.toThrow('connect failed');
  });

  it('rejects options on a connected client with DRIVER.ALREADY_CONNECTED', async () => {
    const db = client();
    await db.connect();

    await expect(db.connect({ path: ':memory:' })).rejects.toMatchObject({
      code: 'DRIVER.ALREADY_CONNECTED',
      message: 'SQLite client already connected',
      fix: 'Options were passed to a client that is already bound. Call connect() without options, or create a new client for another database.',
    });
    await db.close();
  });

  it('rejects after close() with DRIVER.NOT_CONNECTED', async () => {
    const db = client();
    await db.connect();
    await db.close();

    await expect(db.connect()).rejects.toMatchObject({ code: 'DRIVER.NOT_CONNECTED' });
  });
});
