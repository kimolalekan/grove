import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  doublePrecision,
  varchar,
  serial,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"), // enum ["admin", "customer", "provider", "moderator"]
  status: text("status").notNull().default("active"), // enum ["active", "inactive", "suspended"]
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"), // enum ["active", "revoked"]
  created: timestamp("created").defaultNow().notNull(),
  lastUsed: timestamp("last_used"),
});

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull(), // enum ["critical", "warning", "info"]
  status: text("status").notNull().default("active"), // enum ["active", "acknowledged", "resolved"]
  source: text("source").notNull(),
  metadata: jsonb("metadata").default({}),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  timestamp: doublePrecision("timestamp_val").notNull(), // using double for epoch ms if we want to query ranges easily numerically
  acknowledged: boolean("acknowledged").default(false),
});

export const emailLogs = pgTable("email_logs", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").references(() => alerts.id, {
    onDelete: "cascade",
  }),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(), // enum ["sent", "failed", "pending"]
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  project: text("project").notNull(),
  timestamp: timestamp("timestamp").notNull(), // ISO Date object
  source: text("source").notNull(),
  message: text("message").notNull(),
  level: text("level").notNull(), // enum ["info", "warning", "error"]
  details: jsonb("details").default({}),
});

export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  condition: text("condition").notNull(),
  threshold: text("threshold").notNull(),
  metric: text("metric").notNull(),
  notify: text("notify").notNull(),
  channel: text("channel").notNull(), // enum ["email", "sms"]
  enabled: boolean("enabled").notNull().default(true),
});

export const alertRuleStates = pgTable("alert_rule_states", {
  ruleId: text("rule_id")
    .primaryKey()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  lastTriggered: timestamp("last_triggered"),
  currentValue: doublePrecision("current_value").notNull().default(0),
  triggerCount: integer("trigger_count").notNull().default(0),
  windowStart: timestamp("window_start").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  userId: text("user_id"),
  details: jsonb("details").default({}),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});
