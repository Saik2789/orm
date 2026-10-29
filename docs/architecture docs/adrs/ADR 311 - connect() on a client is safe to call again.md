# ADR 311 — `connect()` on a client is safe to call again

**Status:** Accepted
**Date:** 2026-10-29
**Amends:** [ADR 263 — A serverless Postgres connection has the same query interface as a `postgres()` client](ADR%20263%20-%20A%20serverless%20Postgres%20connection%20has%20the%20same%20query%20interface%20as%20a%20postgres%20client.md)
**Builds on:** [ADR 159 — Runtime Driver Lifecycle](ADR%20159%20-%20Driver%20Terminology%20and%20Lifecycle.md)

---

## At a glance

```ts
const db = postgres({ contract, url: process.env['DATABASE_URL']! });

await db.orm.public.User.first(); // the first query connects the client
await db.connect();               // resolves with the same runtime
```

Before this decision, the second line rejected with `DRIVER.ALREADY_CONNECTED`.

## Decision

`connect()` with no options on a `postgres()`, `sqlite()`, `mysql()` or `mongo()` client never fails because the client is already connected:

| Client state | `connect()` | `connect(options)` |
| --- | --- | --- |
| not connected | binds the client and connects it | binds the client to `options` and connects it |
| connecting | waits for that connection, then resolves with the runtime or rejects with the connection's error | rejects with `DRIVER.ALREADY_CONNECTED` |
| connected | resolves with the runtime | rejects with `DRIVER.ALREADY_CONNECTED` |
| closed | rejects with `DRIVER.NOT_CONNECTED` | rejects with `DRIVER.NOT_CONNECTED` |

`connect(undefined)` is `connect()`. The client never compares options: any options passed to a client that is connected or connecting reject, even when they name the same database.

A driver's `connect(binding)` keeps its rule from ADR 159: it binds a driver once. The client decides when to call it, so a repeated `connect()` on the client does not reach the driver. `connect` on a serverless Postgres client is unchanged: it opens a new connection on every call.

This replaces one row of the table in ADR 263's section "`connect` on a client and on a serverless client". For a client, "How often" was "at most once; it fails with `DRIVER.ALREADY_CONNECTED` if the client is already bound or binding". It is now "any number of times without options; with options, only before the client is bound".

## Why

A client connects on its first query, so calling `connect()` is optional. An application creates one client and shares it between its modules. A module that called `connect()` had to be sure that no other module had sent a query yet, and nothing tells it that. The `create-prisma` starter fell into this: its seed function called `connect()`, and its `/users` route failed whenever another route had queried first.

Tools that connect on first use make a repeated `connect` harmless. Prisma 7's `$connect()` waits for a connection in progress and returns when connected. The MongoDB Node driver's `MongoClient.connect()` does the same. Tools that throw on a repeat, such as TypeORM's `DataSource.initialize()` and node-postgres's `pg.Client.connect()`, require the call before any query, so a repeat is a mistake in the caller's own code.

Options still reject because a client cannot change its database once it is bound. If `connect({ url: other })` resolved, the caller would believe it was using `other` while every query went to the first database.

## Consequences

- A call to `connect()` that only makes sure the client is connected, such as a check at startup, works wherever it is placed.
- A misplaced `connect()` without options no longer fails, so the error no longer points at it.
- Passing options to a client that is already connected still fails, with `DRIVER.ALREADY_CONNECTED`.

## Alternatives considered

### Compare the options, and resolve when they match

`connect({ url })` with the URL the client already uses would resolve. Two URLs that name the same database can be written differently, and a pool or a `pg.Client` passed as an option can only be compared by identity. The rule would depend on how the options were written. Rejecting any options is simpler and loses nothing: a caller that only wants a connected client calls `connect()`.

### Keep the rule and document it

The rule would stay, and the documentation would tell users to call `connect()` only before the first query, or not at all. The coordination problem between modules would remain, and the starter shows that following the documentation is not enough to avoid it.
