import { db } from "../server/db";
import {
  users as usersTable,
  logs as logsTable,
  alerts as alertsTable,
  alertRules as alertRulesTable,
  auditLogs as auditLogsTable,
  apiKeys as apiKeysTable,
} from "../server/db/schema";
import dotenv from "dotenv";
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

const generateLogEntries = (count: number) => {
  const sources = [
    "API Service",
    "Web Server",
    "Database",
    "Auth Service",
    "Cache Service",
    "File Service",
  ];
  const projects = ["web-app", "api-service", "mobile-app", "admin-dashboard"];
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
  const paths = [
    "/api/users",
    "/api/logs",
    "/api/alerts",
    "/api/metrics",
    "/api/auth/login",
    "/api/files/upload",
    "/health",
    "/status",
    "/api/reports",
    "/dashboard",
  ];
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "curl/7.68.0",
    "PostmanRuntime/7.28.4",
  ];

  const endpointProfiles = {
    "/api/users": { baseTime: 120, errorRate: 0.02 },
    "/api/logs": { baseTime: 80, errorRate: 0.01 },
    "/api/alerts": { baseTime: 90, errorRate: 0.015 },
    "/api/metrics": { baseTime: 200, errorRate: 0.05 },
    "/api/auth/login": { baseTime: 150, errorRate: 0.08 },
    "/api/files/upload": { baseTime: 800, errorRate: 0.12 },
    "/health": { baseTime: 10, errorRate: 0.001 },
    "/status": { baseTime: 15, errorRate: 0.001 },
    "/api/reports": { baseTime: 1500, errorRate: 0.03 },
    "/dashboard": { baseTime: 300, errorRate: 0.02 },
  };

  const messages = {
    info: [
      "Request processed successfully",
      "User authentication successful",
      "Database connection established",
      "Cache hit for key",
      "File uploaded successfully",
      "Health check passed",
      "Scheduled task completed",
      "Configuration loaded",
    ],
    warning: [
      "High response time detected",
      "Memory usage above 80%",
      "Rate limit approaching for IP",
      "SSL certificate expires soon",
      "Database connection pool nearly full",
      "Disk space running low",
      "Deprecated API endpoint used",
    ],
    error: [
      "Database connection failed",
      "Authentication failed for user",
      "File upload failed - file too large",
      "Internal server error occurred",
      "External API timeout",
      "Permission denied for resource",
      "Invalid request format",
      "Service temporarily unavailable",
    ],
  };

  const logs = [];
  const now = Date.now();
  const weekInMs = 7 * 24 * 60 * 60 * 1000;

  // Create some error incidents for more realistic clustering
  const errorIncidents = [];
  for (let i = 0; i < 3; i++) {
    errorIncidents.push({
      startTime: now - Math.random() * weekInMs,
      duration: Math.random() * 2 * 60 * 60 * 1000, // 0-2 hours
      severity: Math.random() < 0.3 ? "high" : "medium",
    });
  }

  for (let i = 0; i < count; i++) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    const project = projects[Math.floor(Math.random() * projects.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const path = paths[Math.floor(Math.random() * paths.length)];

    // Generate more realistic timestamps with business hours bias
    let logTime = now - Math.random() * weekInMs;
    const date = new Date(logTime);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const isBusinessHour = hour >= 8 && hour <= 18;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isBusinessHour || isWeekend) {
      if (Math.random() > 0.3) {
        logTime = now - Math.random() * 2 * 24 * 60 * 60 * 1000;
        const newHour = 8 + Math.random() * 10;
        logTime =
          logTime -
          (logTime % (24 * 60 * 60 * 1000)) +
          newHour * 60 * 60 * 1000;
      }
    }

    const timestamp = new Date(logTime);

    // Determine log level
    const endpointProfile =
      endpointProfiles[path as keyof typeof endpointProfiles];
    const baseErrorRate = endpointProfile?.errorRate || 0.02;
    const duringIncident = errorIncidents.some(
      (inc) =>
        logTime >= inc.startTime && logTime <= inc.startTime + inc.duration,
    );
    const errorRate = duringIncident ? baseErrorRate * 10 : baseErrorRate;

    const rand = Math.random();
    let level: "info" | "warning" | "error";
    if (rand < errorRate) level = "error";
    else if (rand < errorRate + 0.08) level = "warning";
    else level = "info";

    let statusCode;
    if (level === "error") {
      statusCode = [400, 401, 403, 404, 500, 502, 503][
        Math.floor(Math.random() * 7)
      ];
    } else if (level === "warning") {
      statusCode = [200, 201, 202, 429][Math.floor(Math.random() * 4)];
    } else {
      statusCode = method === "POST" ? 201 : method === "DELETE" ? 204 : 200;
    }

    const baseTime = endpointProfile?.baseTime || 150;
    let duration = baseTime;
    if (level === "error") duration *= 2 + Math.random() * 3;
    else if (level === "warning") duration *= 1.5 + Math.random() * 1;
    else duration *= 0.7 + Math.random() * 0.6;
    duration += Math.random() * 100 - 50;

    logs.push({
      timestamp,
      project,
      source,
      level,
      message:
        messages[level][Math.floor(Math.random() * messages[level].length)],
      details: {
        method,
        path,
        statusCode,
        duration: Math.max(10, Math.round(duration)),
        ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        userId:
          Math.random() < 0.6
            ? `user_${Math.floor(Math.random() * 1000)}`
            : undefined,
        size: `${Math.floor(Math.random() * 10000) + 100}B`,
      },
    });
  }
  return logs;
};

const generateActiveAlerts = (count: number) => {
  const sources = [
    "API Service",
    "Web Server",
    "Database",
    "Cache Service",
    "Load Balancer",
  ];
  const severities: ("critical" | "warning" | "info")[] = [
    "critical",
    "warning",
    "info",
  ];
  const messageTemplates = {
    critical: [
      "Service is down",
      "DB connection pool exhausted",
      "Memory usage critical at 95%",
    ],
    warning: [
      "High error rate detected ({}%)",
      "Response time above threshold ({}ms)",
    ],
    info: ["New deployment successful", "Health check passed"],
  };

  const alerts = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const ageInDays = Math.random() * 5;
    const timestamp = now - ageInDays * 24 * 60 * 60 * 1000;

    alerts.push({
      id: `alert_${i + 1}`,
      title: `${severity.toUpperCase()} Alert`,
      message:
        messageTemplates[severity][
          Math.floor(Math.random() * messageTemplates[severity].length)
        ],
      severity,
      source: sources[Math.floor(Math.random() * sources.length)],
      status: Math.random() < 0.4 ? "acknowledged" : "active",
      timestamp, // doublePrecision index field
      acknowledged: Math.random() < 0.4,
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    });
  }
  return alerts;
};

const generateAlertRules = () => {
  return [
    {
      id: "rule_1",
      name: "High Error Rate",
      condition: "greater than",
      threshold: "5%",
      metric: "error_rate",
      notify: "admin@grove.dev",
      channel: "email",
      enabled: true,
    },
    {
      id: "rule_2",
      name: "Response Time Alert",
      condition: "greater than",
      threshold: "1000ms",
      metric: "response_time",
      notify: "+1234567890",
      channel: "sms",
      enabled: true,
    },
    {
      id: "rule_3",
      name: "High CPU Usage",
      condition: "greater than",
      threshold: "85%",
      metric: "cpu_usage",
      notify: "ops@grove.dev",
      channel: "email",
      enabled: true,
    },
  ];
};

const generateSystemMetrics = (count: number) => {
  const metrics = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const logTime = now - Math.random() * 7 * 24 * 60 * 60 * 1000;
    const cpuUsage = Math.max(5, Math.min(95, 20 + Math.random() * 75));
    const memoryUsage = Math.max(10, Math.min(90, 30 + Math.random() * 60));

    metrics.push({
      timestamp: new Date(logTime),
      project: "infrastructure",
      source: "system_metrics",
      level: "info",
      message: "System health check",
      details: {
        cpu: { usage: cpuUsage / 100, cores: 8 },
        memory: { usage_percent: memoryUsage, total: "16GB" },
        server: `server-${Math.floor(Math.random() * 3) + 1}`,
      },
    });
  }
  return metrics;
};

const generateAuditLogs = (count: number) => {
  const actions = [
    "LOAN_CREATED",
    "LOAN_UPDATED",
    "CREDIT_SCORE_CREATED",
    "FINANCIAL_STATE_CREATED",
    "FINANCIAL_STATE_UPDATED",
    "USER_LOGIN",
    "USER_PROFILE_UPDATED",
    "USER_PROFILE_CREATED",
  ];
  const entityTypes = [
    "loan",
    "credit_score",
    "financial_state",
    "user",
    "system",
  ];
  const users = ["admin", "ops_lead", "dev_manager", "security_bot"];

  const logs = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    let entityType = "system";
    if (action.startsWith("LOAN")) entityType = "loan";
    else if (action.startsWith("CREDIT")) entityType = "credit_score";
    else if (action.startsWith("FINANCIAL")) entityType = "financial_state";
    else if (action.startsWith("USER")) entityType = "user";

    const timestamp = new Date(now - Math.random() * 5 * 24 * 60 * 60 * 1000);

    logs.push({
      action,
      entityType,
      entityId: `${entityType}_${Math.floor(Math.random() * 1000)}`,
      userId: users[Math.floor(Math.random() * users.length)],
      details: {
        message: `Action ${action} performed on ${entityType}`,
        browser: "Chrome",
        os: "macOS",
      },
      ipAddress: `10.0.0.${Math.floor(Math.random() * 255)}`,
      timestamp,
    });
  }
  return logs;
};

const seedData = async () => {
  try {
    console.log("🌱 Starting data seeding to PostgreSQL...");

    console.log("🧹 Clearing existing data...");
    await db.delete(auditLogsTable);
    await db.delete(apiKeysTable);
    await db.delete(logsTable);
    await db.delete(alertsTable);
    await db.delete(alertRulesTable);
    await db.delete(usersTable);

    console.log("📊 Generating entries...");
    const newApiKey = generateApiKey();
    console.log(`🔑 Generated API Key: ${newApiKey}`);

    // Update .env files
    const rootDir = path.resolve(process.cwd());
    updateEnvFile(path.join(rootDir, ".env"), "VITE_PUBLIC_API_KEY", newApiKey);
    updateEnvFile(
      path.join(rootDir, "server", ".env"),
      "VITE_PUBLIC_API_KEY",
      newApiKey,
    );

    const sampleUsers = [
      {
        id: "user_1",
        name: "User One",
        email: "user1@example.com",
        role: "user",
      },
      {
        id: "user_2",
        name: "User Two",
        email: "user2@example.com",
        role: "user",
      },
      {
        id: "user_3",
        name: "User Three",
        email: "user3@example.com",
        role: "user",
      },
      {
        id: "customer_1",
        name: "Customer One",
        email: "c1@example.com",
        role: "customer",
      },
      {
        id: "customer_2",
        name: "Customer Two",
        email: "c2@example.com",
        role: "customer",
      },
      {
        id: "provider_1",
        name: "Provider One",
        email: "p1@example.com",
        role: "provider",
      },
      { id: "admin", name: "Admin", email: "admin@grove.dev", role: "admin" },
    ];

    const hashedPassword = await bcrypt.hash("Grove12345", SALT_ROUNDS);
    const usersToInsert = sampleUsers.map((u) => ({
      ...u,
      password: hashedPassword,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await db.insert(usersTable).values(usersToInsert);

    const userIds = sampleUsers.map((u) => u.id);
    const logEntries = generateLogEntries(500);
    const systemMetrics = generateSystemMetrics(100);
    const activeAlerts = generateActiveAlerts(20);
    const alertRules = generateAlertRules();
    const auditLogs = generateAuditLogs(100);

    console.log("📝 Inserting log entries...");
    const allLogs = [...logEntries, ...systemMetrics];
    for (let i = 0; i < allLogs.length; i += 100) {
      await db.insert(logsTable).values(allLogs.slice(i, i + 100));
    }

    console.log("🚨 Inserting alerts...");
    await db.insert(alertsTable).values(activeAlerts);

    console.log("🔑 Inserting API keys...");
    await db.insert(apiKeysTable).values([
      {
        key: newApiKey,
        name: "Default Dev Key",
        status: "active",
        created: new Date(),
      },
    ]);

    console.log("⚙️ Inserting alert rules...");
    await db.insert(alertRulesTable).values(alertRules);

    console.log("📜 Inserting audit logs...");
    await db.insert(auditLogsTable).values(auditLogs);

    console.log("✅ Data seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
};

if (process.argv[1].endsWith("seed-data.ts")) {
  seedData()
    .then(() => {
      console.log("🎉 Seeding process completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Seeding failed:", error);
      process.exit(1);
    });
}

export { seedData };
