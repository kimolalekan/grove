import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import "../env";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "Database connection string is required. Please set DATABASE_URL or POSTGRES_URL environment variable.",
  );
}

/**
 * PostgreSQL connection client (postgres.js — lightweight, fast).
 */
const queryClient = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

/**
 * Drizzle ORM instance.
 */
export const db = drizzle(queryClient, { schema });

export type Db = typeof db;
