import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });

  globalForPrisma.prisma = client;

  return client;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    if (prop === "$transaction") {
      // Provide resilient timeouts for internet latency to managed Postgres (Neon)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (arg1: any, arg2?: any) => {
        if (typeof arg1 === "function") {
          const options = { maxWait: 15000, timeout: 30000, ...(arg2 || {}) };
          return client.$transaction(arg1, options);
        }
        return client.$transaction(arg1, arg2);
      };
    }
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const prisma = db;
export default db;
