import { UNBOUND_NAMESPACE_ID } from '@internal/framework-components/ir';
import type {
  AnyMongoTypeMaps,
  MongoContract,
  MongoContractWithTypeMaps,
} from '@internal/mongo-contract';
import type * as MongoRuntime from '@internal/mongo-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AnyMongoContract = MongoContractWithTypeMaps<MongoContract, AnyMongoTypeMaps>;

const mocks = vi.hoisted(() => ({
  createMongoExecutionStack: vi.fn(),
  createMongoExecutionContext: vi.fn(),
  createMongoRuntime: vi.fn(),
  driverFromConnection: vi.fn(),
  driverFromDb: vi.fn(),
  deserializeContract: vi.fn(),
  mongoOrm: vi.fn(),
  mongoRaw: vi.fn(),
  mongoQuery: vi.fn(),
}));

vi.mock('@internal/adapter-mongo/runtime', () => ({ default: { id: 'adapter' } }));
vi.mock('@internal/target-mongo/runtime', () => ({ default: { id: 'target' } }));
vi.mock('@internal/mongo-runtime', async (importOriginal) => ({
  buildMongoEnums: (await importOriginal<typeof MongoRuntime>()).buildMongoEnums,
  createMongoExecutionStack: mocks.createMongoExecutionStack,
  createMongoExecutionContext: mocks.createMongoExecutionContext,
  createMongoRuntime: mocks.createMongoRuntime,
}));
vi.mock('@internal/driver-mongo', () => ({
  MongoDriverImpl: {
    fromConnection: mocks.driverFromConnection,
    fromDb: mocks.driverFromDb,
  },
}));
vi.mock('@internal/family-mongo/ir', () => ({
  MongoContractSerializer: class {
    deserializeContract(json: unknown) {
      return mocks.deserializeContract(json);
    }
  },
}));
vi.mock('@internal/mongo-orm', () => ({
  mongoOrm: mocks.mongoOrm,
  mongoRaw: mocks.mongoRaw,
}));
vi.mock('@internal/mongo-query-builder', () => ({ mongoQuery: mocks.mongoQuery }));

import mongo from '../src/runtime/mongo';

const fakeContract = {
  roots: {},
  models: {},
  domain: { namespaces: { [UNBOUND_NAMESPACE_ID]: { models: {} } } },
} as unknown as AnyMongoContract;
const url = 'mongodb://localhost:27017/mydb';
const fakeRuntime = { execute: vi.fn().mockResolvedValue({ affectedCount: 0 }) };

function client() {
  return mongo({ contract: fakeContract, url });
}

function ormExecutor(): { execute(plan: unknown): Promise<unknown> } {
  return mocks.mongoOrm.mock.calls.at(-1)?.[0].executor;
}

function driverConnectsWhenReleased() {
  let release: (outcome: { readonly error?: Error }) => void = () => undefined;
  const settled = new Promise<{ readonly error?: Error }>((resolve) => {
    release = resolve;
  });
  mocks.driverFromConnection.mockImplementationOnce(async () => {
    const { error } = await settled;
    if (error !== undefined) throw error;
    return { close: vi.fn().mockResolvedValue(undefined) };
  });
  return release;
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.deserializeContract.mockReturnValue(fakeContract);
  mocks.createMongoExecutionStack.mockReturnValue({});
  mocks.createMongoExecutionContext.mockReturnValue({});
  mocks.driverFromConnection.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) });
  mocks.createMongoRuntime.mockReturnValue(fakeRuntime);
});

describe('connect() on a mongo() client', () => {
  it('resolves with the runtime after a query connected the client', async () => {
    const db = client();
    await ormExecutor().execute({});

    await expect(db.connect()).resolves.toBe(fakeRuntime);
    expect(mocks.driverFromConnection).toHaveBeenCalledTimes(1);
  });

  it('resolves with the same runtime when called twice', async () => {
    const db = client();
    const first = await db.connect();

    await expect(db.connect()).resolves.toBe(first);
    expect(mocks.driverFromConnection).toHaveBeenCalledTimes(1);
  });

  it('waits for a connection in progress and resolves with the same runtime', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const first = db.connect();
    const second = db.connect();
    release({});

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a).toBe(fakeRuntime);
    expect(mocks.driverFromConnection).toHaveBeenCalledTimes(1);
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
      message: 'Mongo client already connected',
      fix: 'Options were passed to a client that is already bound. Call connect() without options, or create a new client for another database.',
    });
  });

  it('rejects options on a connecting client with DRIVER.ALREADY_CONNECTED', async () => {
    const release = driverConnectsWhenReleased();
    const db = client();
    const first = db.connect();

    await expect(db.connect({ url })).rejects.toMatchObject({ code: 'DRIVER.ALREADY_CONNECTED' });
    release({});
    await first;
  });

  it('rejects after close() with DRIVER.NOT_CONNECTED', async () => {
    const db = client();
    await db.connect();
    await db.close();

    await expect(db.connect()).rejects.toMatchObject({ code: 'DRIVER.NOT_CONNECTED' });
  });
});
