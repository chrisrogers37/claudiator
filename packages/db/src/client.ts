import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  return drizzle({ connection: databaseUrl, schema });
}

export type Db = ReturnType<typeof createDb>;
