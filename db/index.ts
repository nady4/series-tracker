import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!isBuild && process.env.NODE_ENV === "production" && (!url || url.startsWith("file:"))) {
  throw new Error("Production requires a durable DATABASE_URL (for example, a Turso libsql URL).");
}
if (!isBuild && process.env.NODE_ENV === "production" && url?.startsWith("libsql:") && !process.env.DATABASE_AUTH_TOKEN) {
  throw new Error("DATABASE_AUTH_TOKEN is required for a production libsql database.");
}

export const client = createClient({
  url: url ?? "file:./data.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
