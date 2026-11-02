import { describe, expect, it, vi } from "vitest";
import { KnexAdapter } from "./knex.adapter";

type Call = { executor: "root" | "transaction"; operation: string; value?: unknown };

function createQueryExecutor(executor: Call["executor"], calls: Call[]) {
  const query = {
    where: vi.fn((value: unknown) => {
      calls.push({ executor, operation: "where", value });
      return query;
    }),
    first: vi.fn(async () => {
      calls.push({ executor, operation: "first" });
      return { id: "review-1", source: executor };
    }),
    insert: vi.fn(async (value: unknown) => {
      calls.push({ executor, operation: "insert", value });
      return [1];
    }),
    update: vi.fn(async (value: unknown) => {
      calls.push({ executor, operation: "update", value });
      return 1;
    }),
    del: vi.fn(async () => {
      calls.push({ executor, operation: "delete" });
      return 1;
    }),
  };

  return query;
}

function createAdapterHarness() {
  const calls: Call[] = [];
  let completed = false;

  const transactionExecutor = Object.assign(
    vi.fn((_table: string) => createQueryExecutor("transaction", calls)),
    {
      raw: vi.fn(async (query: string) => {
        calls.push({ executor: "transaction", operation: "raw", value: query });
        return { source: "transaction" };
      }),
      isCompleted: vi.fn(() => completed),
      commit: vi.fn(async () => {
        completed = true;
      }),
      rollback: vi.fn(async () => {
        completed = true;
      }),
    }
  );

  const rootExecutor = Object.assign(
    vi.fn((_table: string) => createQueryExecutor("root", calls)),
    {
      raw: vi.fn(async () => ({ source: "root" })),
      transaction: vi.fn(async (callback: (trx: typeof transactionExecutor) => Promise<unknown>) =>
        callback(transactionExecutor)
      ),
    }
  );

  const adapter = new KnexAdapter({
    client: "pg",
    host: "localhost",
    port: 5432,
    user: "test",
    password: "test",
    database: "test",
  });

  Object.assign(adapter as unknown as { db: unknown }, { db: rootExecutor });
  (adapter as unknown as { tableColumns: Map<string, Set<string>> }).tableColumns.set(
    "reviews",
    new Set(["id", "created_at", "updated_at"])
  );

  return { adapter, calls, rootExecutor, transactionExecutor };
}

describe("KnexAdapter transaction context", () => {
  it("binds reads, writes, and raw queries to the Knex transaction", async () => {
    const { adapter, calls, rootExecutor, transactionExecutor } = createAdapterHarness();

    const result = await adapter.transaction(async (trx) => {
      const found = await trx.findOne<{ source: string }>("reviews", { id: "review-1" });
      await trx.create("reviews", { id: "review-1", score: 4 });
      await trx.updateMany("reviews", { id: "review-1" }, { score: 5 });
      const raw = await trx.raw<{ source: string }>("select 1");

      return { found, raw };
    });

    expect(result).toEqual({
      found: { id: "review-1", source: "transaction" },
      raw: { source: "transaction" },
    });
    expect(rootExecutor.transaction).toHaveBeenCalledOnce();
    expect(rootExecutor).not.toHaveBeenCalled();
    expect(transactionExecutor).toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.executor === "transaction")).toBe(true);
  });

  it("keeps explicit commit and rollback idempotent after completion", async () => {
    const { adapter, transactionExecutor } = createAdapterHarness();

    await adapter.transaction(async (trx) => {
      await trx.commit();
      await trx.commit();
      await trx.rollback();
    });

    expect(transactionExecutor.commit).toHaveBeenCalledOnce();
    expect(transactionExecutor.rollback).not.toHaveBeenCalled();
  });
});
