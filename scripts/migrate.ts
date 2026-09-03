import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Load `.env` from the repo root regardless of the current working directory
// (same approach as server/env.ts). drizzle-kit connects through the `pg`
// driver with no connection timeout and hangs silently when the database is
// unreachable, so this script uses the same postgres.js client as the app
// (connect_timeout: 10) and fails fast with a real error instead.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL (or POSTGRES_URL) is not set in .env — aborting.",
  );
  process.exit(1);
}

// Log the target host only — never the full URL (contains credentials).
try {
  const target = new URL(connectionString);
  console.log(`Target database: ${target.hostname}:${target.port || "5432"}`);
} catch {
  console.log("Target database: (non-URL connection string)");
}

const migrationsFolder = path.join(rootDir, "drizzle");
const client = postgres(connectionString, {
  max: 1, // migrations run sequentially
  connect_timeout: 10,
  onnotice: () => {}, // silence "already exists, skipping" NOTICEs from the journal setup
});

async function inspectDatabase() {
  // Print the current state so a "relation already exists"-style failure is
  // self-explanatory instead of a bare SQL error.
  const tables = (await client.unsafe(
    `select schemaname, tablename from pg_tables where schemaname in ('public', 'drizzle') order by schemaname, tablename`,
  )) as Array<{ schemaname: string; tablename: string }>;
  console.log(
    "Existing tables:",
    tables.length
      ? tables.map((t) => `${t.schemaname}.${t.tablename}`).join(", ")
      : "(none)",
  );

  // drizzle records applied migrations in the `drizzle` schema.
  const journal = (await client
    .unsafe(`select hash from drizzle.__drizzle_migrations order by id`)
    .catch(() => [])) as Array<{ hash: string }>;
  console.log(
    "Recorded migrations:",
    journal.length ? journal.map((j) => j.hash).join(", ") : "(none)",
  );
}

async function main() {
  try {
    await inspectDatabase();
    console.log("Applying migrations...");
    await migrate(drizzle(client), { migrationsFolder });
    console.log("✅ Migrations applied successfully.");
  } catch (error) {
    // DrizzleQueryError keeps the real driver error in `cause` — surface it.
    const cause = (error as { cause?: unknown }).cause;
    const native = cause instanceof Error ? cause : error;
    console.error("\n❌ Migration failed:");
    console.error(`   ${(native as Error).message ?? String(native)}`);
    const sqlState = (native as { code?: string }).code;
    if (sqlState) console.error(`   SQLSTATE: ${sqlState}`);
    if (sqlState === "42P07") {
      console.error(
        "\n   This database already has tables that the migration journal does not\n   know about (the schema was likely created with 'drizzle-kit push', or\n   from an older migration history that was later squashed). Either\n   recreate the database before migrating, or keep the existing schema\n   and skip this migration.",
      );
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(() => process.exit(1));
