import dotenv from "dotenv";

dotenv.config();

export interface EmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  from: string;
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

function parseEmailConfig(): EmailConfig | null {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    console.warn(
      "Email configuration not found. Email notifications will be disabled.",
    );
    console.warn(
      "To enable email notifications, set EMAIL_USER and EMAIL_PASSWORD environment variables.",
    );
    return null;
  }

  const emailHost = process.env.EMAIL_HOST || "smtp.gmail.com";
  const emailPort = parseInt(process.env.EMAIL_PORT || "587", 10);
  const emailFrom =
    process.env.EMAIL_FROM || `Grove Alert System <${emailUser}>`;

  const recipients = process.env.EMAIL_RECIPIENTS
    ? process.env.EMAIL_RECIPIENTS.split(",").map((email) => email.trim())
    : [];

  const testEmail = process.env.TEST_EMAIL;

  if (isNaN(emailPort) || emailPort <= 0 || emailPort > 65535) {
    throw new ConfigurationError(
      `Invalid EMAIL_PORT: ${process.env.EMAIL_PORT}. Must be a number between 1 and 65535.`,
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailUser)) {
    throw new ConfigurationError(`Invalid EMAIL_USER format: ${emailUser}`);
  }

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
    user: emailUser,
    password: emailPassword,
    host: emailHost,
    port: emailPort,
    from: emailFrom,
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
    console.log(`  SMTP Host: ${config.email.host}:${config.email.port}`);
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
      "Email is not configured. Please set EMAIL_USER and EMAIL_PASSWORD environment variables.",
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

# Email Configuration (Optional - for alert notifications)
# Gmail Example:
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_FROM=Grove Alert System <your-email@gmail.com>

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
  if (!config.email) {
    return false;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });

    await transporter.verify();
    return true;
  } catch (error) {
    console.error("Email connection validation failed:", error);
    return false;
  }
}

export function validateConfig() {
  return (req: any, res: any, next: any) => {
    try {
      req.config = getConfig();
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
