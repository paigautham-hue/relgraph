import { getDb } from "../db";

async function seed() {
  const db = getDb();

  if (!db) {
    throw new Error("Database connection is not available.");
  }

  console.log("RelGraph seed scaffold is ready.");
  console.log(
    "Full seeding is temporarily deferred while the MySQL/TiDB migration repair is completed. The next step is to reintroduce deterministic seed routines for Apify sources and the Indian bank leadership dataset on top of the stabilized schema.",
  );
}

seed()
  .then(() => {
    console.log("Seed script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed script failed:", error);
    process.exit(1);
  });
