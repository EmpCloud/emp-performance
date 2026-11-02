// ============================================================================
// DATABASE ADAPTER INTERFACE
// Core abstraction that lets you switch between MySQL, PostgreSQL,
// or any future DB without changing business logic.
// ============================================================================

export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: { field: string; order: "asc" | "desc" };
  filters?: Record<string, any>;
  /**
   * Free-text search term. When provided together with `searchFields`, the
   * adapter applies a case-insensitive `LIKE %term%` across each listed column,
   * OR-ed together and AND-ed with the rest of the filters. Parameterized — the
   * term is always bound, never interpolated.
   */
  search?: string;
  searchFields?: string[];
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Data operations that can run either on the root connection or on a
 * transaction-bound connection. Keeping this contract separate from
 * connection lifecycle/migration concerns lets services pass a transaction
 * context to repositories without accidentally escaping the transaction.
 */
export interface IDataContext {
  findById<T>(table: string, id: string): Promise<T | null>;
  findOne<T>(table: string, where: Record<string, any>): Promise<T | null>;
  findMany<T>(table: string, options?: QueryOptions): Promise<QueryResult<T>>;
  create<T>(table: string, data: Partial<T>): Promise<T>;
  createMany<T>(table: string, data: Partial<T>[]): Promise<T[]>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>;
  updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number>;
  delete(table: string, id: string): Promise<boolean>;
  deleteMany(table: string, where: Record<string, any>): Promise<number>;
  count(table: string, where?: Record<string, any>): Promise<number>;
  sum(table: string, field: string, where?: Record<string, any>): Promise<number>;
  raw<T>(query: string, params?: any[]): Promise<T>;
}

export interface TransactionContext extends IDataContext {
  /**
   * Kept for backwards compatibility. Transaction callbacks normally commit
   * automatically when they return successfully.
   */
  commit(): Promise<void>;
  /**
   * Kept for backwards compatibility. Throwing from the callback is the
   * preferred way to trigger a rollback.
   */
  rollback(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Core DB Adapter Interface
// ---------------------------------------------------------------------------
export interface IDBAdapter extends IDataContext {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Migrations
  migrate(): Promise<void>;
  rollback(): Promise<void>;
  seed(seedName?: string): Promise<void>;

  // Transactions
  transaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Repository Base (uses the adapter)
// ---------------------------------------------------------------------------
export abstract class BaseRepository<T> {
  constructor(
    protected adapter: IDataContext,
    protected tableName: string
  ) {}

  async findById(id: string): Promise<T | null> {
    return this.adapter.findById<T>(this.tableName, id);
  }

  async findOne(where: Record<string, any>): Promise<T | null> {
    return this.adapter.findOne<T>(this.tableName, where);
  }

  async findMany(options?: QueryOptions): Promise<QueryResult<T>> {
    return this.adapter.findMany<T>(this.tableName, options);
  }

  async create(data: Partial<T>): Promise<T> {
    return this.adapter.create<T>(this.tableName, data);
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return this.adapter.update<T>(this.tableName, id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.adapter.delete(this.tableName, id);
  }

  async count(where?: Record<string, any>): Promise<number> {
    return this.adapter.count(this.tableName, where);
  }
}
