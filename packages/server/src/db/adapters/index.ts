// ============================================================================
// DATABASE FACTORY
// Creates the correct adapter based on configuration.
// Usage: const db = await initDB();  // singleton
// ============================================================================

import { IDBAdapter } from "./interface";
import { KnexAdapter } from "./knex.adapter";
import { config } from "../../config";

export function createDBAdapter(): IDBAdapter {
  return new KnexAdapter({
    client: "mysql2",
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    pool: {
      min: config.db.poolMin,
      max: config.db.poolMax,
    },
  });
}

// Singleton instance for the app
let dbInstance: IDBAdapter | null = null;

export function getDB(): IDBAdapter {
  if (!dbInstance) {
    dbInstance = createDBAdapter();
  }
  return dbInstance;
}

export async function initDB(): Promise<IDBAdapter> {
  const db = getDB();
  await db.connect();
  return db;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.disconnect();
    dbInstance = null;
  }
}
