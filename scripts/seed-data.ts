import { MeiliSearch } from "meilisearch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const client = new MeiliSearch({
  host: `${process.env.MEILISEARCH_HOST}`,
  apiKey: process.env.MEILISEARCH_KEY,
});

const LOGS_INDEX = "logs";
const ALERTS_INDEX = "alerts";
const ALERT_RULES_INDEX = "alert_rules";

// Sample data generators
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

  // Define endpoint characteristics for more realistic data
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
    const hour = new Date(logTime).getHours();

    // Reduce weekend and night traffic
    const dayOfWeek = new Date(logTime).getDay();
    const isBusinessHour = hour >= 8 && hour <= 18;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isBusinessHour || isWeekend) {
      if (Math.random() > 0.3) {
        // 70% chance to skip non-business entries, making business hours more dense
        logTime = now - Math.random() * 2 * 24 * 60 * 60 * 1000; // Focus on last 2 days
        const newHour = 8 + Math.random() * 10; // 8 AM to 6 PM
        logTime =
          logTime -
          (logTime % (24 * 60 * 60 * 1000)) +
          newHour * 60 * 60 * 1000;
      }
    }

    const timestamp = new Date(logTime).toISOString();

    // Check if this log falls within an error incident
    const duringIncident = errorIncidents.some(
      (incident) =>
        logTime >= incident.startTime &&
        logTime <= incident.startTime + incident.duration,
    );

    // Determine log level with realistic distribution
    let level: "info" | "warning" | "error";
    const endpointProfile =
      endpointProfiles[path as keyof typeof endpointProfiles];
    const baseErrorRate = endpointProfile?.errorRate || 0.02;
    const errorRate = duringIncident ? baseErrorRate * 10 : baseErrorRate;

    const rand = Math.random();
    if (rand < errorRate) {
      level = "error";
    } else if (rand < errorRate + 0.08) {
      level = "warning";
    } else {
      level = "info";
    }

    // Generate realistic status codes based on log level and endpoint
    let statusCode;
    if (level === "error") {
      if (path === "/api/auth/login") {
        statusCode = [401, 403][Math.floor(Math.random() * 2)];
      } else if (path === "/api/files/upload") {
        statusCode = [413, 400, 500][Math.floor(Math.random() * 3)];
      } else {
        statusCode = [400, 404, 500, 502, 503][Math.floor(Math.random() * 5)];
      }
    } else if (level === "warning") {
      statusCode = [200, 201, 202, 429][Math.floor(Math.random() * 4)];
    } else {
      statusCode = method === "POST" ? 201 : method === "DELETE" ? 204 : 200;
    }

    // Generate realistic response times based on endpoint and level
    const baseTime = endpointProfile?.baseTime || 150;
    let duration = baseTime;

    if (level === "error") {
      duration = baseTime * (2 + Math.random() * 3); // 2-5x slower
    } else if (level === "warning") {
      duration = baseTime * (1.5 + Math.random() * 1); // 1.5-2.5x slower
    } else {
      duration = baseTime * (0.7 + Math.random() * 0.6); // 0.7-1.3x normal
    }

    // Add some random variation
    duration = duration + Math.random() * 100 - 50;

    const log = {
      id: i + 1,
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
    };

    logs.push(log);
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
      "Service is down and not responding",
      "Database connection pool exhausted",
      "Memory usage critical at 95%",
      "SSL certificate has expired",
      "Disk space critical - 95% full",
      "Multiple service failures detected",
      "Authentication service completely down",
    ],
    warning: [
      "High error rate detected ({}%)",
      "Response time above threshold ({}ms)",
      "Memory usage high at {}%",
      "Disk space warning - {}% full",
      "CPU usage above 80%",
      "Database slow query detected",
      "Cache hit ratio below threshold",
      "SSL certificate expires in {} days",
    ],
    info: [
      "New deployment completed successfully",
      "Scheduled maintenance window started",
      "Configuration updated successfully",
      "Backup completed successfully",
      "Health check passed",
      "Auto-scaling triggered",
      "Log rotation completed",
      "Security scan completed",
    ],
  };

  const alerts = [];
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Generate alerts with more realistic severity distribution
  const severityDistribution = [
    ...Array(2).fill("critical"), // 2/15 = ~13%
    ...Array(8).fill("warning"), // 8/15 = ~53%
    ...Array(5).fill("info"), // 5/15 = ~33%
  ];

  for (let i = 0; i < count; i++) {
    const severity = severityDistribution[
      Math.floor(Math.random() * severityDistribution.length)
    ] as "critical" | "warning" | "info";
    const source = sources[Math.floor(Math.random() * sources.length)];

    // Recent alerts are more likely to be unacknowledged
    const ageInDays = Math.random() * 5; // 0-5 days old
    const timestamp = new Date(now - ageInDays * dayInMs).toISOString();

    let message =
      messageTemplates[severity][
        Math.floor(Math.random() * messageTemplates[severity].length)
      ];

    // Replace placeholders with realistic values
    if (severity === "warning") {
      if (message.includes("error rate")) {
        message = message.replace("{}", (Math.random() * 8 + 3).toFixed(1));
      } else if (message.includes("Response time")) {
        message = message.replace(
          "{}",
          Math.floor(Math.random() * 1500 + 800).toString(),
        );
      } else if (message.includes("Memory usage")) {
        message = message.replace(
          "{}",
          Math.floor(Math.random() * 15 + 80).toString(),
        );
      } else if (message.includes("Disk space")) {
        message = message.replace(
          "{}",
          Math.floor(Math.random() * 10 + 80).toString(),
        );
      } else if (message.includes("expires in")) {
        message = message.replace(
          "{}",
          Math.floor(Math.random() * 25 + 5).toString(),
        );
      }
    }

    // Acknowledgment logic: newer critical alerts less likely to be acknowledged
    let acknowledgmentRate = 0.4; // Base 40% acknowledgment rate
    if (severity === "critical") {
      acknowledgmentRate = ageInDays < 1 ? 0.1 : 0.6; // Recent critical alerts rarely acknowledged
    } else if (severity === "info") {
      acknowledgmentRate = 0.8; // Info alerts often acknowledged quickly
    }

    const alert = {
      id: i + 1,
      message,
      timestamp,
      severity,
      source,
      acknowledged: Math.random() < acknowledgmentRate,
    };

    alerts.push(alert);
  }

  return alerts;
};

const generateAlertRules = () => {
  const rules = [
    {
      id: 1,
      name: "High Error Rate",
      condition: "greater than",
      threshold: "5%",
      metric: "error_rate",
      notify: "admin@company.com",
      channel: "email" as const,
      enabled: true,
    },
    {
      id: 2,
      name: "Response Time Alert",
      condition: "greater than",
      threshold: "1000ms",
      metric: "response_time",
      notify: "+1234567890",
      channel: "sms" as const,
      enabled: true,
    },
    {
      id: 3,
      name: "High CPU Usage",
      condition: "greater than",
      threshold: "85%",
      metric: "cpu_usage",
      notify: "ops-team@company.com",
      channel: "email" as const,
      enabled: true,
    },
    {
      id: 4,
      name: "Memory Usage Warning",
      condition: "greater than",
      threshold: "90%",
      metric: "memory_usage",
      notify: "+1234567891",
      channel: "sms" as const,
      enabled: false,
    },
    {
      id: 5,
      name: "Database Connection Issues",
      condition: "greater than",
      threshold: "10",
      metric: "db_connection_errors",
      notify: "dba@company.com",
      channel: "email" as const,
      enabled: true,
    },
    {
      id: 6,
      name: "Disk Space Alert",
      condition: "greater than",
      threshold: "85%",
      metric: "disk_usage",
      notify: "+1234567892",
      channel: "sms" as const,
      enabled: true,
    },
  ];

  return rules;
};

const generateSystemMetrics = (count: number) => {
  const servers = [
    "web-server-1",
    "api-server-1",
    "db-server-1",
    "cache-server-1",
  ];
  const projects = ["web-app", "api-service", "mobile-app", "admin-dashboard"];

  const metrics = [];
  const now = Date.now();
  const weekInMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const server = servers[Math.floor(Math.random() * servers.length)];
    const project = projects[Math.floor(Math.random() * projects.length)];

    // Generate a timestamp within the last week, with business hours bias
    let logTime = now - Math.random() * weekInMs;
    const hour = new Date(logTime).getHours();
    const dayOfWeek = new Date(logTime).getDay();
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

    const timestamp = new Date(logTime).toISOString();

    // Generate realistic system metrics
    const cpuUsage = Math.max(5, Math.min(95, 20 + Math.random() * 75));
    const memoryUsage = Math.max(10, Math.min(90, 30 + Math.random() * 60));
    const diskUsage = Math.max(20, Math.min(95, 40 + Math.random() * 50));
    const networkRx = Math.max(100, Math.random() * 5000);
    const networkTx = Math.max(100, Math.random() * 3000);

    const metric = {
      id: `system_metric_${i + 1}`,
      timestamp,
      project,
      source: "system_metrics",
      server,
      cpu: {
        usage: cpuUsage,
        cores: 4 + Math.floor(Math.random() * 8),
      },
      memory: {
        usage_percent: memoryUsage,
        total: `${Math.floor(Math.random() * 8 + 8)}GB`,
        free: `${Math.floor((100 - memoryUsage) * 0.01 * (8 + Math.random() * 8))}GB`,
      },
      disk: {
        usage: {
          "/": {
            usage_percent: diskUsage,
            total: "500GB",
            free: `${Math.floor((100 - diskUsage) * 5)}GB`,
          },
        },
      },
      network: {
        eth0: {
          rx_bytes: networkRx,
          tx_bytes: networkTx,
          rx_rate_bytes_per_sec: networkRx / 60,
          tx_rate_bytes_per_sec: networkTx / 60,
        },
      },
    };

    metrics.push(metric);
  }

  return metrics;
};

const seedData = async () => {
  try {
    console.log("🌱 Starting data seeding...");

    // Generate sample data
    console.log("📊 Generating log entries...");
    const logEntries = generateLogEntries(1000); // More logs for better metrics

    console.log("🖥️ Generating system metrics...");
    const systemMetrics = generateSystemMetrics(500);

    console.log("🚨 Generating active alerts...");
    const activeAlerts = generateActiveAlerts(35); // More varied alerts

    console.log("⚙️ Generating alert rules...");
    const alertRules = generateAlertRules();

    // Get indexes
    const logsIndex = client.index(LOGS_INDEX);
    const alertsIndex = client.index(ALERTS_INDEX);
    const alertRulesIndex = client.index(ALERT_RULES_INDEX);

    // Clear existing data
    console.log("🧹 Clearing existing data...");
    await logsIndex.deleteAllDocuments();
    await alertsIndex.deleteAllDocuments();
    await alertRulesIndex.deleteAllDocuments();

    // Wait a bit for the deletion to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Seed logs
    console.log("📝 Seeding log entries...");
    await logsIndex.addDocuments([...logEntries, ...systemMetrics]);

    // Seed active alerts
    console.log("🚨 Seeding active alerts...");
    await alertsIndex.addDocuments(activeAlerts);

    // Seed alert rules
    console.log("⚙️ Seeding alert rules...");
    await alertRulesIndex.addDocuments(alertRules);

    console.log("✅ Data seeding completed successfully!");
    console.log(`   - ${logEntries.length} log entries`);
    console.log(`   - ${systemMetrics.length} system metrics`);
    console.log(`   - ${activeAlerts.length} active alerts`);
    console.log(`   - ${alertRules.length} alert rules`);
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
};

// Run the seed function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
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
