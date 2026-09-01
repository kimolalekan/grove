import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";

dotenv.config();

export interface EmailConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
  fromName: string;
  recipients: string[];
  testEmail?: string;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  email: EmailConfig | null;
  databaseUrl: string;
  apiKeys: string[];
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const DEFAULT_ZEPTOMAIL_API_URL = "https://api.zeptomail.com/v1.1/email";

// Parses a "Display Name <address@domain.com>" string into its parts.
// A bare "address@domain.com" works too.
function parseFromAddress(from: string): { address: string; name: string } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from.trim());
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { name: "", address: from.trim() };
}

function parseEmailConfig(): EmailConfig | null {
  const apiKey = process.env.ZEPTOMAIL_API_KEY;

  if (!apiKey) {
    console.warn(
      "Email configuration not found. Email notifications will be disabled.",
    );
    console.warn(
      "To enable email notifications, set ZEPTOMAIL_API_KEY and ZEPTOMAIL_API_URL environment variables.",
    );
    return null;
  }

  const apiUrl = process.env.ZEPTOMAIL_API_URL || DEFAULT_ZEPTOMAIL_API_URL;
  const { address: from, name: fromName } = parseFromAddress(
    process.env.ZEPTOMAIL_FROM || process.env.EMAIL_FROM || "",
  );

  if (!from) {
    console.warn(
      "Email sender address not configured. Email notifications will be disabled.",
    );
    console.warn(
      'To enable email notifications, set ZEPTOMAIL_FROM (e.g. "Grove Alerts <alerts@yourdomain.com>").',
    );
    return null;
  }

  const recipients = process.env.EMAIL_RECIPIENTS
    ? process.env.EMAIL_RECIPIENTS.split(",").map((email) => email.trim())
    : [];

  const testEmail = process.env.TEST_EMAIL;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const invalidRecipients = recipients.filter(
    (email) => !emailRegex.test(email),
  );
  if (invalidRecipients.length > 0) {
    throw new ConfigurationError(
      `Invalid email addresses in EMAIL_RECIPIENTS: ${invalidRecipients.join(", ")}`,
    );
  }

  if (testEmail && !emailRegex.test(testEmail)) {
    throw new ConfigurationError(`Invalid TEST_EMAIL format: ${testEmail}`);
  }

  return {
    apiUrl,
    apiKey,
    from,
    fromName,
    recipients,
    testEmail,
  };
}

function parseAppConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const portEnv = process.env.PORT || "3000";
  const port: number = parseInt(portEnv, 10);
  const databaseUrl = process.env.DATABASE_URL || "";

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new ConfigurationError(
      `Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`,
    );
  }

  if (!databaseUrl) {
    throw new ConfigurationError(
      "DATABASE_URL environment variable is required.",
    );
  }

  const apiKeys = process.env.API_KEYS
    ? process.env.API_KEYS.split(",").map((key) => key.trim())
    : [];

  if (nodeEnv === "production" && apiKeys.length === 0) {
    console.warn(
      "No API keys configured for production environment. Consider setting API_KEYS environment variable.",
    );
  }

  return {
    nodeEnv,
    port,
    email: parseEmailConfig(),
    databaseUrl,
    apiKeys,
  };
}

export function printConfigSummary(config: AppConfig): void {
  console.log("\n📋 Grove Dashboard Configuration Summary");
  console.log("=".repeat(45));

  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: Configured`);

  if (config.email) {
    console.log("\n📧 Email Configuration:");
    console.log(`  Provider: ZeptoMail`);
    console.log(`  API URL: ${config.email.apiUrl}`);
    console.log(`  From Address: ${config.email.from}`);
    console.log(
      `  Default Recipients: ${config.email.recipients.length} configured`,
    );
    console.log(`  Test Email: ${config.email.testEmail || "not set"}`);
  } else {
    console.log("\n📧 Email Configuration: ❌ Disabled");
    console.log("  Email notifications will not be sent");
  }

  console.log(
    `\nAPI Keys: ${config.apiKeys.length > 0 ? `${config.apiKeys.length} configured` : "⚠️ none configured"}`,
  );

  console.log("=".repeat(45) + "\n");
}

export function getConfig(): AppConfig {
  try {
    const config = parseAppConfig();

    if (process.env.NODE_ENV !== "test") {
      printConfigSummary(config);
    }

    return config;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`❌ Configuration Error: ${error.message}`);
      console.error("\nPlease check your environment variables and try again.");
      process.exit(1);
    }
    throw error;
  }
}

export function isEmailEnabled(config: AppConfig): boolean {
  return config.email !== null;
}

export function getEmailConfig(config: AppConfig): EmailConfig {
  if (!config.email) {
    throw new Error(
      "Email is not configured. Please set ZEPTOMAIL_API_KEY and ZEPTOMAIL_FROM environment variables.",
    );
  }
  return config.email;
}

export function generateEnvTemplate(): string {
  return `# Grove Dashboard Environment Configuration
# Copy this file to .env and update with your values

# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/grove_db

# Email Configuration (ZeptoMail - for alert notifications)
# https://www.zeptomail.com/
ZEPTOMAIL_API_URL=https://api.zeptomail.com/v1.1/email
ZEPTOMAIL_API_KEY=your-zeptomail-api-key
ZEPTOMAIL_FROM=Grove Alert System <alerts@yourdomain.com>

# Default email recipients for alerts (comma-separated)
EMAIL_RECIPIENTS=admin@company.com,alerts@company.com

# Test email address for testing notifications
TEST_EMAIL=test@company.com

# API Keys for authentication (comma-separated)
API_KEYS=your-api-key-1,your-api-key-2
`;
}

export async function validateEmailConnection(
  config: AppConfig,
): Promise<boolean> {
  // ZeptoMail has no lightweight health-check endpoint; the presence of a
  // configured API key and sender address is treated as "connected".
  return Boolean(config.email && config.email.apiKey && config.email.from);
}

export function validateConfig() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      (req as Request & { config?: AppConfig }).config = getConfig();
      next();
    } catch (error) {
      res.status(500).json({
        error: "Configuration Error",
        message:
          error instanceof Error
            ? error.message
            : "Unknown configuration error",
      });
    }
  };
}

export const config = getConfig();
