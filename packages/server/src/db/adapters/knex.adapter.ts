// ============================================================================
// KNEX SQL ADAPTER — supports MySQL, PostgreSQL, SQLite
// ============================================================================

import knex from "knex";
import type { Knex } from "knex";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { IDBAdapter, QueryOptions, QueryResult, TransactionContext } from "./interface";

type DbExecutor = Knex | Knex.Transaction;

export class KnexAdapter implements IDBAdapter {
  private db: Knex | null = null;
  private config: Knex.Config;
  private tableColumns: Map<string, Set<string>> = new Map();

  constructor(config: {
    client: "mysql2" | "pg" | "sqlite3";
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    pool?: { min: number; max: number };
  }) {
    const runtimeExtension = path.extname(__filename).slice(1) || "js";
    this.config = {
      client: config.client,
      connection: {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      },
      pool: config.pool || { min: 2, max: 10 },
      migrations: {
        directory: path.resolve(__dirname, "../migrations/sql"),
        extension: runtimeExtension,
      },
      seeds: {
        directory: path.resolve(__dirname, "../seeds/sql"),
        extension: runtimeExtension,
      },
    };
  }

  async connect(): Promise<void> {
    this.db = knex(this.config);
    await this.db.raw("SELECT 1");
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
    }
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  private getDb(): Knex {
    if (!this.db) throw new Error("Database not connected. Call connect() first.");
    return this.db;
  }

  /** Check whether a table has a specific column (cached per table). */
  private async hasColumn(
    table: string,
    column: string,
    executor: DbExecutor = this.getDb()
  ): Promise<boolean> {
    if (!this.tableColumns.has(table)) {
      const cols = await executor(table).columnInfo();
      this.tableColumns.set(table, new Set(Object.keys(cols)));
    }
    return this.tableColumns.get(table)!.has(column);
  }

  // Migrations
  async migrate(): Promise<void> {
    await this.getDb().migrate.latest();
  }

  async rollback(): Promise<void> {
    await this.getDb().migrate.rollback();
  }

  async seed(seedName?: string): Promise<void> {
    await this.getDb().seed.run(seedName ? { specific: seedName } : undefined);
  }

  // CRUD
  async findById<T>(
    table: string,
    id: string,
    executor: DbExecutor = this.getDb()
  ): Promise<T | null> {
    const row = await executor(table).where({ id }).first();
    return (row as T) || null;
  }

  async findOne<T>(
    table: string,
    where: Record<string, any>,
    executor: DbExecutor = this.getDb()
  ): Promise<T | null> {
    const row = await executor(table).where(where).first();
    return (row as T) || null;
  }

  async findMany<T>(
    table: string,
    options?: QueryOptions,
    executor: DbExecutor = this.getDb()
  ): Promise<QueryResult<T>> {
    const db = executor;
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;

    let query = db(table);

    // Apply filters
    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value === null) {
          query = query.whereNull(key);
        } else if (Array.isArray(value)) {
          query = query.whereIn(key, value);
        } else if (typeof value === "object" && value.op) {
          query = query.where(key, value.op, value.value);
        } else {
          query = query.where(key, value);
        }
      }
    }

    // Apply free-text (case-insensitive) search across the requested columns.
    // Both sides are lowercased so it behaves like ILIKE regardless of the
    // column collation; the term is always bound (never interpolated).
    const searchTerm = options?.search?.trim();
    const searchFields = options?.searchFields ?? [];
    if (searchTerm && searchFields.length > 0) {
      const like = `%${searchTerm.toLowerCase()}%`;
      query = query.where((builder) => {
        searchFields.forEach((field, idx) => {
          const clause = (b: typeof builder) =>
            b.whereRaw("LOWER(??) LIKE ?", [field, like]);
          if (idx === 0) clause(builder);
          else builder.orWhere(clause);
        });
      });
    }

    // Get total count
    const [{ count: total }] = await query.clone().count("* as count");

    // Apply sort
    if (options?.sort) {
      query = query.orderBy(options.sort.field, options.sort.order);
    } else {
      query = query.orderBy("created_at", "desc");
    }

    // Apply pagination
    const data = await query.limit(limit).offset(offset);

    return {
      data: data as T[],
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    };
  }

  async create<T>(
    table: string,
    data: Partial<T>,
    executor: DbExecutor = this.getDb()
  ): Promise<T> {
    const id = (data as any).id || uuidv4();
    const now = new Date();
    const record: Record<string, any> = {
      ...data,
      id,
      created_at: now,
    };

    if (await this.hasColumn(table, "updated_at", executor)) {
      record.updated_at = now;
    }

    await executor(table).insert(record);
    return this.findById<T>(table, id, executor) as Promise<T>;
  }

  async createMany<T>(
    table: string,
    data: Partial<T>[],
    executor: DbExecutor = this.getDb()
  ): Promise<T[]> {
    const now = new Date();
    const hasUpdatedAt = await this.hasColumn(table, "updated_at", executor);
    const records = data.map((d) => {
      const rec: Record<string, any> = {
        ...d,
        id: (d as any).id || uuidv4(),
        created_at: now,
      };
      if (hasUpdatedAt) rec.updated_at = now;
      return rec;
    });

    await executor.batchInsert(table, records as any[], 500);
    const ids = records.map((r) => r.id);
    return executor(table).whereIn("id", ids);
  }

  async update<T>(
    table: string,
    id: string,
    data: Partial<T>,
    executor: DbExecutor = this.getDb()
  ): Promise<T> {
    const record: Record<string, any> = { ...data };
    delete record.id;
    delete record.created_at;

    if (await this.hasColumn(table, "updated_at", executor)) {
      record.updated_at = new Date();
    }

    await executor(table).where({ id }).update(record);
    return this.findById<T>(table, id, executor) as Promise<T>;
  }

  async updateMany(
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
    executor: DbExecutor = this.getDb()
  ): Promise<number> {
    const record: Record<string, any> = { ...data };
    if (await this.hasColumn(table, "updated_at", executor)) {
      record.updated_at = new Date();
    }
    return executor(table)
      .where(where)
      .update(record);
  }

  async delete(
    table: string,
    id: string,
    executor: DbExecutor = this.getDb()
  ): Promise<boolean> {
    const count = await executor(table).where({ id }).del();
    return count > 0;
  }

  async deleteMany(
    table: string,
    where: Record<string, any>,
    executor: DbExecutor = this.getDb()
  ): Promise<number> {
    return executor(table).where(where).del();
  }

  // Aggregations
  async count(
    table: string,
    where?: Record<string, any>,
    executor: DbExecutor = this.getDb()
  ): Promise<number> {
    let query = executor(table);
    if (where) query = query.where(where);
    const [{ count }] = await query.count("* as count");
    return Number(count);
  }

  async sum(
    table: string,
    field: string,
    where?: Record<string, any>,
    executor: DbExecutor = this.getDb()
  ): Promise<number> {
    let query = executor(table);
    if (where) query = query.where(where);
    const [{ total }] = await query.sum(`${field} as total`);
    return Number(total) || 0;
  }

  // Transactions
  async transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T> {
    const db = this.getDb();
    return db.transaction(async (trx) => {
      const ctx: TransactionContext = {
        findById: <R>(table: string, id: string) => this.findById<R>(table, id, trx),
        findOne: <R>(table: string, where: Record<string, any>) =>
          this.findOne<R>(table, where, trx),
        findMany: <R>(table: string, options?: QueryOptions) =>
          this.findMany<R>(table, options, trx),
        create: <R>(table: string, data: Partial<R>) => this.create<R>(table, data, trx),
        createMany: <R>(table: string, data: Partial<R>[]) =>
          this.createMany<R>(table, data, trx),
        update: <R>(table: string, id: string, data: Partial<R>) =>
          this.update<R>(table, id, data, trx),
        updateMany: (table: string, where: Record<string, any>, data: Record<string, any>) =>
          this.updateMany(table, where, data, trx),
        delete: (table: string, id: string) => this.delete(table, id, trx),
        deleteMany: (table: string, where: Record<string, any>) =>
          this.deleteMany(table, where, trx),
        count: (table: string, where?: Record<string, any>) => this.count(table, where, trx),
        sum: (table: string, field: string, where?: Record<string, any>) =>
          this.sum(table, field, where, trx),
        raw: <R>(query: string, params?: any[]) => this.raw<R>(query, params, trx),
        commit: async () => {
          if (!trx.isCompleted()) await trx.commit();
        },
        rollback: async () => {
          if (!trx.isCompleted()) await trx.rollback();
        },
      };
      return fn(ctx);
    });
  }

  // Raw
  async raw<T>(
    query: string,
    params?: any[],
    executor: DbExecutor = this.getDb()
  ): Promise<T> {
    const result = await executor.raw(query, params || []);
    return result as T;
  }
}
