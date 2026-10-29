import mysqlDriver from '@internal/driver-mysql/runtime';
import { RawQueryAst } from '@internal/sql-relational-core/ast';
import { planFromAst } from '@internal/sql-relational-core/plan';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mysql from '../../src/exports/runtime';
import { contractFromJson } from '../../src/exports/static';
import type { Contract } from '../fixtures/generated/contract.d';
import contractJson from '../fixtures/generated/contract.json' with { type: 'json' };

const contract = contractFromJson<Contract>(contractJson);
const unreachable = 'mysql://root@127.0.0.1:1/none';

const rowsPlan = () => planFromAst(RawQueryAst.rows(['select 1 as one'], {}), contract);

function client() {
  return mysql({ contract, url: unreachable });
}

function driverConnectsWhenReleased() {
  let release: (outcome: { readonly error?: Error }) => void = () => undefined;
  const settled = new Promise<{ readonly error?: Error }>((resolve) => {
    release = resolve;
  });
  const createDriver = mysqlDriver.create.bind(mysqlDriver);
  vi.spyOn(mysqlDriver, 'create').mockImplementationOnce((options) => {
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

describe('connect() on a mysql() client', () => {
  it('resolves with the runtime after a query connected the client', async () => {
    const db = client();
    await db
      .query(rowsPlan())
      .toArray()
      .catch(() => undefined);

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

    await expect(db.connect({ url: unreachable })).rejects.toMatchObject({
      code: 'DRIVER.ALREADY_CONNECTED',
      message: 'MySQL client already connected',
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
