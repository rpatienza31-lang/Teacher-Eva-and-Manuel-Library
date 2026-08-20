import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// Single long-lived postgres.js client. In dev, reuse across HMR reloads so we
// don't exhaust connections.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

// Neon's POOLED endpoint (PgBouncer — host contains "-pooler") can't use
// prepared statements, so they must be disabled there. On a DIRECT connection
// we KEEP prepared statements enabled: postgres.js relies on the server's
// parameter type info to serialize values, and with `prepare: false` on a
// direct connection it mis-handles Date params, throwing
// "The 'string' argument must be ... Received an instance of Date".
const usesPgBouncerPooler = /-pooler\./.test(env.DATABASE_URL);

const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, { max: 10, prepare: !usesPgBouncerPooler });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
