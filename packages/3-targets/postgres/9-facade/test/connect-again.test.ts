import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractFromJson } from '../src/static/contract-from-json';
import type { Contract } from './fixtures/generated/contract';
import fixtureContractJson from './fixtures/generated/contract.json' with { type: 'json' };

vi.mock('pg', () => {
  class Pool {
    on = vi.fn().mockReturnThis();
    connect = vi.fn(async () => ({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
      on: vi.fn(),
    }));
    end = vi.fn().mockResolvedValue(undefined);
    totalCount = 0;
    idleCount = 0;
    waitingCount = 0;
  }
  class Client {
    on = vi.fn().mockReturnThis();
    connect = vi.fn().mockResolvedValue(undefined);
    query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    end = vi.fn().mockResolvedValue(undefined);
    escapeIdentifier = vi.fn();
    escapeLiteral = vi.fn();
  }
  return { Pool, Client };
});

import postgresDriver from '@internal/driver-postgres/runtime';
import postgres from '../src/runtime/postgres';

const contract = contractFromJson<Contract>(fixtureContractJson);
const url = 'postgres://localhost:5432/db';

function client() {
  return postgres({ contract, url, verifyMarker: false });
}

function driverConnectsWhenReleased() {
  let release: (outcome: { readonly error?: Error }) => void = () => undefined;
  const settled = new Promise<{ readonly error?: Error }>((resolve) => {
    release = resolve;
  });
  const createDriver = postgresDriver.create.bind(postgresDriver);
  vi.spyOn(postgresDriver, 'create').mockImplementationOnce((options) => {
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

describe('connect() on a postgres() client', () => {
  it('resolves with the runtime after a query connected the client', async () => {
    const db = client();
    await db.query(db.sql.public.users.select('id').build()).toArray();

    await expect(db.connect()).resolves.toBe(db.runtime());
    await db.close();
  });

  it('resolves with the same runtime when called twice', async () => {
    const db = client();
    const first = await db.connect();

    await expect(db.connect()).resolves.toBe(first);
    await db.close();
  });

  it('treats connect(undefined) as connect()', async () => {
    const db = client();
    const first = await db.connect();

    await expect(db.connect(undefined)).resolves.toBe(first);
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

  it('waits for a connection a query started', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const rows = db.query(db.sql.public.users.select('id').build()).toArray();
    const connected = db.connect();
    release({});

    await expect(connected).resolves.toBe(db.runtime());
    await rows;
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

    await expect(db.connect({ url })).rejects.toMatchObject({
      code: 'DRIVER.ALREADY_CONNECTED',
      message: 'Postgres client already connected',
      fix: 'Options were passed to a client that is already bound. Call connect() without options, or create a new client for another database.',
    });
    await db.close();
  });

  it('rejects options on a connecting client with DRIVER.ALREADY_CONNECTED', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const first = db.connect();

    await expect(db.connect({ url })).rejects.toMatchObject({ code: 'DRIVER.ALREADY_CONNECTED' });
    release({});
    await first;
    await db.close();
  });

  it('rejects after close() with DRIVER.NOT_CONNECTED', async () => {
    const db = client();
    await db.connect();
    await db.close();

    await expect(db.connect()).rejects.toMatchObject({ code: 'DRIVER.NOT_CONNECTED' });
  });
});
