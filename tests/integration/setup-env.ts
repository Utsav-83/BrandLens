import "dotenv/config";
import { afterAll, beforeEach } from "vitest";
import { integrationDb, truncateAllTables } from "./database";

const testUrl = process.env.TEST_DATABASE_URL?.trim();
const appUrl = process.env.DATABASE_URL?.trim();
if (!testUrl) throw new Error("Refusing integration tests: TEST_DATABASE_URL is not configured.");
if (appUrl && testUrl === appUrl) throw new Error("Refusing integration tests: TEST_DATABASE_URL equals DATABASE_URL.");
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await integrationDb.$disconnect();
});
