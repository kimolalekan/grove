import { db } from "../server/db";
import {
  users as usersTable,
  apiKeys as apiKeysTable,
} from "../server/db/schema";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

dotenv.config();

const SALT_ROUNDS = 10;

const generateApiKey = (): string => {
  const prefix = "sk_";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let randomPart = "";
  for (let i = 0; i < 24; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + randomPart;
};

const updateEnvFile = (envPath: string, key: string, value: string) => {
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, "utf-8");
  const regex = new RegExp(`^${key}=.*`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, content);
};

const initSetup = async () => {
  try {
    console.log("🚀 Starting Grove initialization...");

    // 1. Generate and Update API Key
    const newApiKey = generateApiKey();
    console.log(`🔑 Generated API Key: ${newApiKey}`);

    const rootDir = path.resolve(process.cwd());
    updateEnvFile(path.join(rootDir, ".env"), "VITE_PUBLIC_API_KEY", newApiKey);
    updateEnvFile(
      path.join(rootDir, "server", ".env"),
      "VITE_PUBLIC_API_KEY",
      newApiKey,
    );

    // 2. Insert API Key into DB
    await db
      .insert(apiKeysTable)
      .values({
        key: newApiKey,
        name: "Initialization Key",
        status: "active",
        created: new Date(),
      })
      .onConflictDoNothing();

    // 3. Create Default Admin
    const adminEmail = "admin@grove.dev";
    const existingAdmin = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, adminEmail))
      .limit(1);

    if (existingAdmin.length === 0) {
      console.log("👤 Creating default admin user (admin@grove.dev)...");
      const hashedPassword = await bcrypt.hash("Grove12345", SALT_ROUNDS);
      await db.insert(usersTable).values({
        id: `user_${Date.now()}`,
        name: "Grove Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      console.log("👤 Admin user already exists.");
    }

    console.log("✅ Initialization successful!");
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    // Don't exit with 1 if it's postinstall, it might break yarn install if DB isn't up
    // but here we want to know if it fails.
  }
};

initSetup()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
