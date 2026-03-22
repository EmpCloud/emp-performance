import { initDB, closeDB } from "./adapters";
import { initEmpCloudDB, closeEmpCloudDB } from "./empcloud";
import { logger } from "../utils/logger";

async function run() {
  await initEmpCloudDB();
  const db = await initDB();
  logger.info("Running seeds...");
  await db.seed();
  logger.info("Seeds complete");
  await closeDB();
  await closeEmpCloudDB();
  process.exit(0);
}

run().catch((err) => {
  logger.error("Seed failed:", err);
  process.exit(1);
});
