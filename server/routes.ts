import express, { Express, Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import bcrypt from "bcryptjs";
import * as fs from "fs/promises";
import * as path from "path";
import { createAlertService, AlertService } from "./services/alertService";
import { createEmailService } from "./services/emailService";
import { createAlertRuleMonitoringService } from "./services/alertRuleMonitoringService";
import { db } from "./db";
import {
  users,
  apiKeys,
  logs as logsTable,
  alertRules as alertRulesTable,
  alerts,
  auditLogs,
} from "./db/schema";
import { eq, and, sql, desc, gt } from "drizzle-orm";

interface ApiKey {
  key: string;
  name: string;
  created: string;
  lastUsed: string | null;
  status: "active" | "revoked";
}

interface ApiConfig {
  user: number;
  api_key: number;
}

interface ApiKeyCreateRequest {
  name: string;
  key: string;
  status?: "active" | "revoked";
}

interface ApiKeyUpdateRequest {
  name?: string;
  status?: "active" | "revoked";
  lastUsed?: string;
}

interface LogEntry {
  id: number;
  project: string;
  timestamp: string;
  source: string;
  message: string;
  level: "info" | "warning" | "error";
  details?: {
    ip?: string;
    userAgent?: string;
    userId?: string;
    duration?: number;
    statusCode?: number;
    method?: string;
    path?: string;
    size?: string;
  };
}

interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: string;
  metric: string;
  notify: string;
  channel: "email" | "sms";
  enabled: boolean;
}

interface ActiveAlert {
  id: string;
  title: string;
  message: string;
  created_at: string;
  severity: "critical" | "warning" | "info";
  source: string;
  status: "active" | "acknowledged" | "resolved";
}

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "user" | "moderator";
  status: "active" | "inactive" | "suspended";
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserCreateRequest {
  name: string;
  email: string;
  password: string;
  role?: "admin" | "user" | "moderator";
  status?: "active" | "inactive" | "suspended";
}

interface UserUpdateRequest {
  name?: string;
  email?: string;
  role?: "admin" | "user" | "moderator";
  status?: "active" | "inactive" | "suspended";
  lastLogin?: string;
}

interface UserLoginRequest {
  email: string;
  password: string;
}

interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
  total?: number;
}

const SALT_ROUNDS = 12;

const alertService: AlertService = createAlertService();
const emailService = createEmailService();
const alertMonitoringService = createAlertRuleMonitoringService();

/**
 * API Key Authentication Middleware
 */
const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const xApiKey = req.headers["x-api-key"];

    let apiKey = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7);
    } else if (xApiKey) {
      apiKey = xApiKey as string;
    }

    if (!apiKey) {
      if (req.path === "/api/users/login" || req.path === "/api/users/setup") {
        return next();
      }
      return res
        .status(401)
        .json({ success: false, message: "API key is required" });
    }

    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, apiKey))
      .limit(1);

    if (result.length === 0 || result[0].status !== "active") {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or revoked API key" });
    }

    // Update last used timestamp
    await db
      .update(apiKeys)
      .set({ lastUsed: new Date() })
      .where(eq(apiKeys.key, apiKey));

    next();
  } catch (error) {
    next(error);
  }
};

const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  } as ErrorResponse);
};

const generateUserId = (): string => {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

const validatePassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPassword = (
  password: string,
): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long",
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  }
  return { valid: true };
};

const generateApiKey = (): string => {
  const prefix = "sk_";
  const randomPart =
    Math.random().toString(36).substring(2, 20) +
    Math.random().toString(36).substring(2, 15);
  return prefix + randomPart;
};

const recordAuditLog = async (data: {
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  details?: any;
  ipAddress?: string;
}) => {
  try {
    await db.insert(auditLogs).values({
      ...data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Failed to record audit log:", error);
  }
};

async function initializeDefaults() {
  try {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length === 0) {
      console.log("No users found, initializing defaults...");
      const apiKeyVal = generateApiKey();
      const apiKeyData = {
        key: apiKeyVal,
        name: "Grove API Key",
        status: "active" as const,
        created: new Date(),
      };
      const hashedPassword = await hashPassword("Grove12345");
      const userData = {
        id: generateUserId(),
        name: "Grove Admin",
        email: "admin@grove.dev",
        password: hashedPassword,
        role: "admin",
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(apiKeys).values(apiKeyData);
      await db.insert(users).values(userData);
      await recordAuditLog({
        action: "SYSTEM_INITIALIZED",
        entityType: "system",
        details: { message: "Default admin user and API key created" },
      });
      console.log("Default user and API key created successfully");
      try {
        const currentDir = process.cwd();
        const envPath = path.join(currentDir, ".env");
        let envContent = await fs.readFile(envPath, "utf-8");
        if (envContent.includes("VITE_PUBLIC_API_KEY=")) {
          envContent = envContent.replace(
            /VITE_PUBLIC_API_KEY=".*"/,
            `VITE_PUBLIC_API_KEY="${apiKeyVal}"`,
          );
          await fs.writeFile(envPath, envContent, "utf-8");
        }
      } catch (e) {
        console.warn("Could not update .env file with new API key");
      }
    }
  } catch (error) {
    console.error("Error initializing defaults:", error);
    throw error;
  }
}

export const initializeDatabase = async (): Promise<void> => {
  try {
    await db.execute(sql`SELECT 1`);
    await initializeDefaults();
    console.log("PostgreSQL database initialized successfully!");
  } catch (error: any) {
    console.error("Error initializing Database:", error);
    throw error;
  }
};
const registerRoutes = async (app: Express): Promise<Server> => {
  // Ensure database is initialized with defaults
  await initializeDatabase();

  // AUDIT LOG ROUTES
  app.get(
    "/api/audits",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          action,
          entityType,
          userId,
          limit = 50,
          offset = 0,
        } = req.query as any;
        let conditions = [];
        if (action) conditions.push(eq(auditLogs.action, action));
        if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
        if (userId) conditions.push(eq(auditLogs.userId, userId));

        const results = await db
          .select()
          .from(auditLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .limit(Number(limit))
          .offset(Number(offset))
          .orderBy(desc(auditLogs.timestamp));

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(auditLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined);

        res.json({
          success: true,
          data: results,
          total: Number(totalCount.count),
          pagination: { limit: Number(limit), offset: Number(offset) },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  app.post(
    "/api/audits/ingest",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { action, entityType, entityId, userId, details, timestamp } =
          req.body;

        if (!action || !entityType) {
          return res.status(400).json({
            success: false,
            message: "action and entityType are required",
          });
        }

        const result = await db
          .insert(auditLogs)
          .values({
            action,
            entityType,
            entityId,
            userId,
            details,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            ipAddress: req.ip,
          })
          .returning();

        res.status(201).json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );
  // GET /api/apikeys - Retrieve all API keys with optional search/filter
  app.get(
    "/api/apikeys",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { search, status } = req.query as any;

        let conditions = [];
        if (status) {
          conditions.push(eq(apiKeys.status, status as any));
        }
        if (search) {
          conditions.push(sql`${apiKeys.name} ILIKE ${"%" + search + "%"}`);
        }

        const results = await db
          .select()
          .from(apiKeys)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(apiKeys.created));

        const response: SuccessResponse<ApiKey[]> = {
          success: true,
          data: results as any,
          total: results.length,
        };
        res.json(response);
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/apikeys - Create a new API key
  app.post(
    "/api/apikeys",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { name, key, status = "active" }: ApiKeyCreateRequest = req.body;
        if (!name || !key) {
          return res
            .status(400)
            .json({ success: false, message: "Name and key are required" });
        }

        const existing = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.key, key))
          .limit(1);

        if (existing.length > 0) {
          return res
            .status(409)
            .json({ success: false, message: "API key already exists" });
        }

        const apiKeyData = {
          key,
          name,
          status: status as any,
          created: new Date(),
        };

        await db.insert(apiKeys).values(apiKeyData);

        await recordAuditLog({
          action: "API_KEY_CREATED",
          entityType: "api_key",
          entityId: key,
          details: { name, status },
        });

        res.status(201).json({ success: true, data: apiKeyData });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/apikeys/:key - Get a specific API key
  app.get(
    "/api/apikeys/:key",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const result = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.key, key))
          .limit(1);

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PUT /api/apikeys/:key - Update an API key
  app.put(
    "/api/apikeys/:key",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const { name, status } = req.body;

        const result = await db
          .update(apiKeys)
          .set({
            name: name || undefined,
            status: status || undefined,
          })
          .where(eq(apiKeys.key, key))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        await recordAuditLog({
          action: "API_KEY_UPDATED",
          entityType: "api_key",
          entityId: key,
          details: { name, status },
        });

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PATCH /api/apikeys/:key/revoke - Revoke an API key
  app.patch(
    "/api/apikeys/:key/revoke",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const result = await db
          .update(apiKeys)
          .set({ status: "revoked" })
          .where(eq(apiKeys.key, key))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        await recordAuditLog({
          action: "API_KEY_REVOKED",
          entityType: "api_key",
          entityId: key,
        });

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PATCH /api/apikeys/:key/reactivate - Reactivate an API key
  app.patch(
    "/api/apikeys/:key/reactivate",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const result = await db
          .update(apiKeys)
          .set({ status: "active" })
          .where(eq(apiKeys.key, key))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        await recordAuditLog({
          action: "API_KEY_REACTIVATED",
          entityType: "api_key",
          entityId: key,
        });

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // DELETE /api/apikeys/:key - Delete an API key
  app.delete(
    "/api/apikeys/:key",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const result = await db
          .delete(apiKeys)
          .where(eq(apiKeys.key, key))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        await recordAuditLog({
          action: "API_KEY_DELETED",
          entityType: "api_key",
          entityId: key,
        });

        res.json({
          success: true,
          data: { message: "API key deleted successfully" },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PATCH /api/apikeys/:key/last-used - Update last used timestamp
  app.patch(
    "/api/apikeys/:key/last-used",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { key } = req.params;
        const result = await db
          .update(apiKeys)
          .set({ lastUsed: new Date() })
          .where(eq(apiKeys.key, key))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "API key not found" });
        }

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // USER ROUTES
  // GET /api/users - Retrieve all users with optional search/filter
  app.get(
    "/api/users",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { search, status, role } = req.query as any;

        let conditions = [];
        if (status) conditions.push(eq(users.status, status as any));
        if (role) conditions.push(eq(users.role, role as any));
        if (search) {
          conditions.push(
            sql`(${users.name} ILIKE ${"%" + search + "%"} OR ${users.email} ILIKE ${"%" + search + "%"})`,
          );
        }

        const results = await db
          .select()
          .from(users)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(users.createdAt));

        // Remove passwords from response
        const usersWithoutPasswords = results.map((user: any) => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });

        res.json({
          success: true,
          data: usersWithoutPasswords,
          total: results.length,
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/users - Create a new user
  app.post(
    "/api/users",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          name,
          email,
          password,
          role = "user",
          status = "active",
        }: UserCreateRequest = req.body;
        if (!name || !email || !password) {
          return res.status(400).json({
            success: false,
            message: "Name, email, and password are required",
          });
        }
        if (!isValidEmail(email)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid email format" });
        }
        const passwordValidation = isValidPassword(password);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ success: false, message: passwordValidation.message });
        }

        // Check if email already exists
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existing.length > 0) {
          return res.status(409).json({
            success: false,
            message: "User with this email already exists",
          });
        }

        const hashedPassword = await hashPassword(password);
        const userData = {
          id: generateUserId(),
          name,
          email,
          password: hashedPassword,
          role: role as any,
          status: status as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(users).values(userData);

        const { password: _, ...userWithoutPassword } = userData;
        res.status(201).json({ success: true, data: userWithoutPassword });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/users/login - User login
  app.post(
    "/api/users/login",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { email, password }: UserLoginRequest = req.body;
        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });
        }

        const result = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (result.length === 0) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });
        }

        const user = result[0];
        if (user.status !== "active") {
          return res
            .status(401)
            .json({ success: false, message: "Account is not active" });
        }

        const isValid = await validatePassword(password, user.password);
        if (!isValid) {
          return res
            .status(401)
            .json({ success: false, message: "Invalid email or password" });
        }

        // Update last login
        await db
          .update(users)
          .set({ lastLogin: new Date(), updatedAt: new Date() })
          .where(eq(users.id, user.id));

        const { password: _, ...userWithoutPassword } = user;

        await recordAuditLog({
          action: "USER_LOGIN",
          entityType: "user",
          entityId: user.id,
          userId: user.id,
        });

        res.json({
          success: true,
          data: { ...userWithoutPassword, lastLogin: new Date() },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/users/:id - Get a specific user
  app.get(
    "/api/users/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const result = await db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        const { password, ...userWithoutPassword } = result[0];
        res.json({ success: true, data: userWithoutPassword });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PUT /api/users/:id - Update a user
  app.put(
    "/api/users/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const updates: UserUpdateRequest = req.body;

        if (updates.email && !isValidEmail(updates.email)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid email format" });
        }

        const result = await db
          .update(users)
          .set({
            ...updates,
            updatedAt: new Date(),
          } as any)
          .where(eq(users.id, id))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        const { password, ...userWithoutPassword } = result[0];
        res.json({ success: true, data: userWithoutPassword });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PATCH /api/users/:id/password - Update user password
  app.patch(
    "/api/users/:id/password",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { newPassword } = req.body; // Only newPassword is required

        if (!newPassword) {
          return res
            .status(400)
            .json({ success: false, message: "New password is required" });
        }

        const passwordValidation = isValidPassword(newPassword);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ success: false, message: passwordValidation.message });
        }

        const hashedPassword = await hashPassword(newPassword);
        const result = await db
          .update(users)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        res.json({
          success: true,
          data: { message: "Password updated successfully" },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // DELETE /api/users/:id - Delete a user
  app.delete(
    "/api/users/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const result = await db
          .delete(users)
          .where(eq(users.id, id))
          .returning();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        res.json({
          success: true,
          data: { message: "User deleted successfully" },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/logs - Retrieve all logs with search and filtering
  app.get(
    "/api/logs",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          level,
          source,
          project,
          timeRange,
          from,
          to,
          limit = 50,
          offset = 0,
          sortField = "timestamp",
          sortDirection = "desc",
        } = req.query as any;

        let conditions = [];
        if (level && level !== "all")
          conditions.push(eq(logsTable.level, level as any));
        if (source && source !== "all")
          conditions.push(eq(logsTable.source, source as any));
        if (project && project !== "all")
          conditions.push(eq(logsTable.project, project as any));

        if (search) {
          conditions.push(
            sql`(${logsTable.message} ILIKE ${"%" + search + "%"} OR ${logsTable.source} ILIKE ${"%" + search + "%"})`,
          );
        }

        const now = new Date();
        let fromDate: Date | null = null;
        if (timeRange && timeRange !== "custom") {
          fromDate = new Date();
          const rangeMap: Record<string, number> = {
            "1h": 1 * 60 * 60 * 1000,
            "24h": 24 * 60 * 60 * 1000,
            "72h": 72 * 60 * 60 * 1000,
            "168h": 168 * 60 * 60 * 1000,
          };
          fromDate.setTime(
            now.getTime() - (rangeMap[timeRange as string] || rangeMap["24h"]),
          );
          conditions.push(sql`${logsTable.timestamp} >= ${fromDate}`);
        } else if (timeRange === "custom" && (from || to)) {
          if (from)
            conditions.push(
              sql`${logsTable.timestamp} >= ${new Date(from as string)}`,
            );
          if (to)
            conditions.push(
              sql`${logsTable.timestamp} <= ${new Date(to as string)}`,
            );
        }

        const validColumns: Record<string, any> = {
          timestamp: logsTable.timestamp,
          level: logsTable.level,
          source: logsTable.source,
          project: logsTable.project,
        };
        const sortColumn = validColumns[sortField] || logsTable.timestamp;

        const results = await db
          .select()
          .from(logsTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            sortDirection === "asc" ? sql`${sortColumn} ASC` : desc(sortColumn),
          )
          .limit(Number(limit))
          .offset(Number(offset));

        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(logsTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined);

        res.json({
          success: true,
          data: results,
          total: Number(totalResult[0].count),
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            hasMore: results.length === Number(limit),
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/logs - Create a new log entry
  app.post(
    "/api/logs",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { source, message, level, details, project } = req.body;
        if (!source || !message || !level) {
          return res.status(400).json({
            success: false,
            message: "Source, message, and level are required",
          });
        }

        const newLog = {
          project: project || "default",
          source,
          message,
          level: level as any,
          details: details || {},
          timestamp: new Date(req.body.timestamp || Date.now()),
        };

        const result = await db.insert(logsTable).values(newLog).returning();
        res.status(201).json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/logs/projects - Get distinct projects
  app.get(
    "/api/logs/projects",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const results = await db
          .selectDistinct({ project: logsTable.project })
          .from(logsTable);
        res.json({ success: true, data: results.map((r) => r.project).sort() });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/logs/sources - Get distinct sources
  app.get(
    "/api/logs/sources",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const results = await db
          .selectDistinct({ source: logsTable.source })
          .from(logsTable);
        res.json({ success: true, data: results.map((r) => r.source).sort() });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/logs/stats - Get log counts by level
  app.get(
    "/api/logs/stats",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { project, source, timeRange = "24h" } = req.query;
        let conditions = [];
        if (project && project !== "all")
          conditions.push(eq(logsTable.project, project as any));
        if (source && source !== "all")
          conditions.push(eq(logsTable.source, source as any));

        const now = new Date();
        const rangeMap: Record<string, number> = {
          "1h": 1 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };
        const fromDate = new Date(
          now.getTime() - (rangeMap[timeRange as string] || rangeMap["24h"]),
        );
        conditions.push(sql`${logsTable.timestamp} >= ${fromDate}`);

        const results = await db
          .select({
            level: logsTable.level,
            count: sql<number>`count(*)`,
          })
          .from(logsTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .groupBy(logsTable.level);

        const counts: Record<string, number> = {
          info: 0,
          warning: 0,
          error: 0,
          total: 0,
        };
        results.forEach((r) => {
          counts[r.level] = Number(r.count);
          counts.total += Number(r.count);
        });

        res.json({ success: true, data: counts });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/logs/:id - Get a specific log entry by ID
  app.get(
    "/api/logs/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const logId = parseInt(id, 10);
        if (isNaN(logId)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid log ID" });
        }

        const result = await db
          .select()
          .from(logsTable)
          .where(eq(logsTable.id, logId))
          .limit(1);

        if (result.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Log not found" });
        }

        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // ALERT ROUTES
  // GET /api/alerts - Retrieve all alerts with optional search/filter
  app.get(
    "/api/alerts",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          severity,
          acknowledged,
          limit = 20,
          offset = 0,
        } = req.query as any;
        let status: string | undefined = undefined;
        if (acknowledged === "true") status = "acknowledged";
        else if (acknowledged === "false") status = "active";

        const results = await alertService.getAlerts({
          search,
          severity,
          status,
          limit,
          offset,
        });
        res.json({
          success: true,
          data: results.data,
          total: results.total,
          pagination: { limit, offset, total: results.total },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/alerts - Create a new alert
  app.post(
    "/api/alerts",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          title,
          message,
          severity,
          source,
          sendEmail = true,
          emailRecipients,
        } = req.body;

        if (!title || !message || !severity || !source) {
          return res.status(400).json({
            success: false,
            message: "Title, message, severity, and source are required",
          });
        }

        if (!["critical", "warning", "info"].includes(severity)) {
          return res.status(400).json({
            success: false,
            message: "Severity must be critical, warning, or info",
          });
        }

        const newAlert = await alertService.createAlert({
          title,
          message,
          severity,
          source,
          sendEmail,
          emailRecipients: emailRecipients,
        });

        await recordAuditLog({
          action: "ALERT_CREATED",
          entityType: "alert",
          entityId: newAlert.id,
          details: { title, severity, source },
        });

        res.status(201).json({
          success: true,
          data: newAlert,
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/alerts/:id - Get a specific alert by ID
  app.get(
    "/api/alerts/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        if (!id) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        const alert = await alertService.getAlertById(id);

        if (!alert) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }

        res.json({
          success: true,
          data: alert,
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PUT /api/alerts/:id - Update an alert
  app.put(
    "/api/alerts/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { action, acknowledgedBy } = req.body;

        if (!id) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        let updatedAlert;

        if (action === "acknowledge") {
          if (!acknowledgedBy) {
            return res.status(400).json({
              success: false,
              message: "acknowledgedBy is required for acknowledge action",
            });
          }
          updatedAlert = await alertService.acknowledgeAlert(
            id,
            acknowledgedBy,
          );
          await recordAuditLog({
            action: "ALERT_ACKNOWLEDGED",
            entityType: "alert",
            entityId: id,
            userId: acknowledgedBy,
          });
        } else if (action === "resolve") {
          updatedAlert = await alertService.resolveAlert(id);
          await recordAuditLog({
            action: "ALERT_RESOLVED",
            entityType: "alert",
            entityId: id,
          });
        } else {
          return res.status(400).json({
            success: false,
            message: "Action must be 'acknowledge' or 'resolve'",
          });
        }

        res.json({
          success: true,
          data: updatedAlert,
        });
      } catch (error: any) {
        if (error.message.includes("not found")) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }
        next(error);
      }
    },
  );

  // DELETE /api/alerts/:id - Delete an alert
  app.delete(
    "/api/alerts/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        if (!id) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        await alertService.deleteAlert(id);

        res.json({
          success: true,
          message: "Alert deleted successfully",
        });
      } catch (error: any) {
        if (error.message.includes("not found")) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }
        next(error);
      }
    },
  );

  // GET /api/alerts/email-logs - Get email logs for alerts
  app.get(
    "/api/alerts/email-logs",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { alertId, limit = 50, offset = 0 } = req.query;
        const results = await alertService.getEmailLogs(
          alertId as string,
          parseInt(limit as string),
          parseInt(offset as string),
        );
        res.json({
          success: true,
          data: results,
          total: results.length,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: results.length,
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/alerts/rate-limits - Get rate limit statistics
  app.get(
    "/api/alerts/rate-limits",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = await alertService.getRateLimitStats();
        res.json({
          success: true,
          message: "Rate limit statistics retrieved",
          data: stats,
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/alerts/rate-limits/reset - Reset rate limits for a recipient
  app.post(
    "/api/alerts/rate-limits/reset",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { recipient } = req.body;
        if (!recipient)
          return res.status(400).json({
            success: false,
            message: "Recipient email address is required",
          });
        await alertService.resetRateLimit(recipient);
        res.json({
          success: true,
          message: `Rate limits reset for ${recipient}`,
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // ALERT RULE ROUTES
  // GET /api/alert-rules - Retrieve all alert rules
  app.get(
    "/api/alert-rules",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { search } = req.query as any;
        let conditions = [];
        if (search) {
          conditions.push(
            sql`${alertRulesTable.name} ILIKE ${"%" + search + "%"}`,
          );
        }

        const results = await db
          .select()
          .from(alertRulesTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(alertRulesTable.name));

        res.json({ success: true, data: results, total: results.length });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // POST /api/alert-rules - Create a new alert rule
  app.post(
    "/api/alert-rules",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          name,
          condition,
          threshold,
          metric,
          notify,
          channel,
          enabled = true,
        } = req.body;
        if (
          !name ||
          !condition ||
          !threshold ||
          !metric ||
          !notify ||
          !channel
        ) {
          return res
            .status(400)
            .json({ success: false, message: "Missing required fields" });
        }

        const newRule = {
          id: `rule_${Date.now()}`,
          name,
          condition,
          threshold,
          metric,
          notify,
          channel: channel as any,
          enabled,
        };

        await db.insert(alertRulesTable).values(newRule);
        res.status(201).json({ success: true, data: newRule });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/alert-rules/:id - Get a specific alert rule
  app.get(
    "/api/alert-rules/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const result = await db
          .select()
          .from(alertRulesTable)
          .where(eq(alertRulesTable.id, id))
          .limit(1);
        if (result.length === 0)
          return res
            .status(404)
            .json({ success: false, message: "Alert rule not found" });
        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // PUT /api/alert-rules/:id - Update an alert rule
  app.put(
    "/api/alert-rules/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        const result = await db
          .update(alertRulesTable)
          .set(updates)
          .where(eq(alertRulesTable.id, id))
          .returning();
        if (result.length === 0)
          return res
            .status(404)
            .json({ success: false, message: "Alert rule not found" });
        res.json({ success: true, data: result[0] });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // DELETE /api/alert-rules/:id - Delete an alert rule
  app.delete(
    "/api/alert-rules/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const result = await db
          .delete(alertRulesTable)
          .where(eq(alertRulesTable.id, id))
          .returning();
        if (result.length === 0)
          return res
            .status(404)
            .json({ success: false, message: "Alert rule not found" });
        res.json({ success: true, message: "Alert rule deleted successfully" });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // METRICS ROUTES
  // METRICS ROUTES
  // GET /api/metrics/overview - Get overview metrics from logs
  app.get(
    "/api/metrics/overview",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project } = req.query;
        const now = new Date();
        const rangeMap: Record<string, number> = {
          "1h": 1 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() - (rangeMap[timeRange as string] || rangeMap["24h"]),
        );

        let conditions = [sql`${logsTable.timestamp} >= ${startTime}`];
        if (project && project !== "all")
          conditions.push(eq(logsTable.project, project as any));

        const [totalResult, errorResult, durationResult] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)` })
            .from(logsTable)
            .where(and(...conditions)),
          db
            .select({ count: sql<number>`count(*)` })
            .from(logsTable)
            .where(and(...conditions, eq(logsTable.level, "error"))),
          db
            .select({
              avgDuration: sql<number>`avg(CAST(details->>'duration' AS FLOAT))`,
            })
            .from(logsTable)
            .where(and(...conditions, sql`details->>'duration' IS NOT NULL`)),
        ]);

        const totalRequests = Number(totalResult[0].count);
        const errorCount = Number(errorResult[0].count);
        const avgResponseTime = Math.round(
          Number(durationResult[0].avgDuration) || 0,
        );

        // Generate simplified time series (20 intervals)
        const intervals = 20;
        const intervalMs = (now.getTime() - startTime.getTime()) / intervals;
        const timeSeriesData = await Promise.all(
          Array.from({ length: intervals }).map(async (_, i) => {
            const start = new Date(startTime.getTime() + i * intervalMs);
            const end = new Date(start.getTime() + intervalMs);
            const [t, e] = await Promise.all([
              db
                .select({ count: sql<number>`count(*)` })
                .from(logsTable)
                .where(
                  and(
                    ...conditions,
                    sql`${logsTable.timestamp} >= ${start}`,
                    sql`${logsTable.timestamp} < ${end}`,
                  ),
                ),
              db
                .select({ count: sql<number>`count(*)` })
                .from(logsTable)
                .where(
                  and(
                    ...conditions,
                    eq(logsTable.level, "error"),
                    sql`${logsTable.timestamp} >= ${start}`,
                    sql`${logsTable.timestamp} < ${end}`,
                  ),
                ),
            ]);
            return { total: Number(t[0].count), errors: Number(e[0].count) };
          }),
        );

        res.json({
          success: true,
          data: {
            totalRequests,
            requestsPerMinute: parseFloat(
              (
                totalRequests /
                ((now.getTime() - startTime.getTime()) / 60000)
              ).toFixed(2),
            ),
            errorRate:
              totalRequests > 0
                ? parseFloat(((errorCount / totalRequests) * 100).toFixed(2))
                : 0,
            avgResponseTime,
            uptime: 99.98,
            requestData: timeSeriesData.map((d) => d.total),
            errorRateData: timeSeriesData.map((d) =>
              d.total > 0 ? (d.errors / d.total) * 100 : 0,
            ),
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/metrics/performance - Get performance metrics from logs
  app.get(
    "/api/metrics/performance",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project } = req.query;
        const now = new Date();
        const rangeMap: Record<string, number> = {
          "1h": 1 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() - (rangeMap[timeRange as string] || rangeMap["24h"]),
        );

        let conditions = [
          sql`${logsTable.timestamp} >= ${startTime}`,
          sql`details->>'duration' IS NOT NULL`,
        ];
        if (project && project !== "all")
          conditions.push(eq(logsTable.project, project as any));

        const statsResult = await db
          .select({
            avg: sql<number>`avg(CAST(details->>'duration' AS FLOAT))`,
            max: sql<number>`max(CAST(details->>'duration' AS FLOAT))`,
            min: sql<number>`min(CAST(details->>'duration' AS FLOAT))`,
            count: sql<number>`count(*)`,
          })
          .from(logsTable)
          .where(and(...conditions));

        res.json({
          success: true,
          data: {
            avgResponseTime: Math.round(Number(statsResult[0].avg) || 0),
            maxResponseTime: Math.round(Number(statsResult[0].max) || 0),
            minResponseTime: Math.round(Number(statsResult[0].min) || 0),
            totalRequests: Number(statsResult[0].count),
            responseTimeData: [], // Would need interval-based query for real chart
            throughputData: [],
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/metrics/resources - Get resource metrics
  app.get(
    "/api/metrics/resources",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project, server } = req.query;
        const now = new Date();
        const rangeMap: Record<string, number> = {
          "1h": 1 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() - (rangeMap[timeRange as string] || rangeMap["24h"]),
        );

        let conditions = [
          eq(logsTable.source, "system_metrics"),
          sql`${logsTable.timestamp} >= ${startTime}`,
        ];
        if (project && project !== "all")
          conditions.push(eq(logsTable.project, project as any));
        if (server && server !== "all")
          conditions.push(sql`details->>'server' = ${server}`);

        const results = await db
          .select()
          .from(logsTable)
          .where(and(...conditions))
          .orderBy(desc(logsTable.timestamp))
          .limit(100);

        const hasRealData = results.length > 0;
        const latest = results[0];

        res.json({
          success: true,
          data: {
            currentCpuUsage: hasRealData
              ? Number((latest.details as any).cpu?.usage || 0) * 100
              : 0,
            maxCpuUsage: hasRealData
              ? Math.max(
                  ...results.map((r) => (r.details as any).cpu?.usage || 0),
                ) * 100
              : 0,
            avgCpuUsage: hasRealData
              ? (results.reduce(
                  (sum, r) => sum + ((r.details as any).cpu?.usage || 0),
                  0,
                ) /
                  results.length) *
                100
              : 0,
            currentMemoryUsage: hasRealData
              ? Number((latest.details as any).memory?.usage_percent || 0)
              : 0,
            maxMemoryUsage: hasRealData
              ? Math.max(
                  ...results.map(
                    (r) => (r.details as any).memory?.usage_percent || 0,
                  ),
                )
              : 0,
            avgMemoryUsage: hasRealData
              ? results.reduce(
                  (sum, r) =>
                    sum + ((r.details as any).memory?.usage_percent || 0),
                  0,
                ) / results.length
              : 0,
            cpuUsageData: results
              .map((r) => Number((r.details as any).cpu?.usage || 0) * 100)
              .reverse(),
            memoryUsageData: results
              .map((r) => Number((r.details as any).memory?.usage_percent || 0))
              .reverse(),
            diskUsageData: [],
            networkData: [],
            dataSource: hasRealData ? "system_metrics" : "none",
            hasRealData,
            totalDataPoints: results.length,
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // ALERT TRIGGER ROUTES - Simplified implementations using Drizzle lookup
  const triggerAlertForMetric = async (
    metric: string,
    value: any,
    source: string,
  ) => {
    const rules = await db
      .select()
      .from(alertRulesTable)
      .where(
        and(
          eq(alertRulesTable.metric, metric),
          eq(alertRulesTable.enabled, true),
        ),
      );
    const triggered = [];
    for (const rule of rules) {
      const val = parseFloat(value.toString());
      const threshold = parseFloat(rule.threshold.replace(/[^\d.-]/g, ""));
      let shouldTrigger = false;
      if (rule.condition === "greater than") shouldTrigger = val > threshold;
      else if (rule.condition === "less than") shouldTrigger = val < threshold;
      else if (rule.condition === "equal to") shouldTrigger = val === threshold;

      if (shouldTrigger) {
        const alert = await alertService.createAlert({
          title: `${rule.name} Alert`,
          message: `${metric} value ${value} ${rule.condition} threshold ${rule.threshold}`,
          severity: metric.includes("error") ? "critical" : "warning",
          source,
          sendEmail: rule.channel === "email",
          emailRecipients: rule.channel === "email" ? [rule.notify] : undefined,
        });
        triggered.push({ ruleId: rule.id, alertId: alert.id });
      }
    }
    return triggered;
  };

  app.post(
    "/api/alerts/trigger",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { metric, value, source = "System" } = req.body;
        const triggered = await triggerAlertForMetric(metric, value, source);
        res.json({
          success: true,
          message: `Triggered ${triggered.length} alerts`,
          triggeredAlerts: triggered,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/alerts/trigger/error-rate",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { errorRate, source = "API Monitor" } = req.body;
        const triggered = await triggerAlertForMetric(
          "error_rate",
          errorRate,
          source,
        );
        res.json({ success: true, triggeredAlerts: triggered });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/alerts/trigger/response-time",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { responseTime, source = "API Monitor" } = req.body;
        const triggered = await triggerAlertForMetric(
          "response_time",
          responseTime,
          source,
        );
        res.json({ success: true, triggeredAlerts: triggered });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/alerts/trigger/cpu-usage",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { cpuUsage, source = "System Monitor" } = req.body;
        const triggered = await triggerAlertForMetric(
          "cpu_usage",
          cpuUsage,
          source,
        );
        res.json({ success: true, triggeredAlerts: triggered });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/alerts/health - Alert system health check
  app.get(
    "/api/alerts/health",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const [rulesCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(alertRulesTable);
        const [enabledRulesCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(alertRulesTable)
          .where(eq(alertRulesTable.enabled, true));
        const [recentAlerts] = await db
          .select({ count: sql<number>`count(*)` })
          .from(alerts)
          .where(
            sql`created_at >= ${new Date(Date.now() - 24 * 60 * 60 * 1000)}`,
          );

        res.json({
          success: true,
          data: {
            alertSystem: {
              status: "operational",
              totalRules: Number(rulesCount.count),
              enabledRules: Number(enabledRulesCount.count),
              recentAlerts24h: Number(recentAlerts.count),
              emailService: alertService ? "available" : "unavailable",
            },
            endpoints: {
              trigger: "/api/alerts/trigger",
              triggerErrorRate: "/api/alerts/trigger/error-rate",
              triggerResponseTime: "/api/alerts/trigger/response-time",
              triggerCpuUsage: "/api/alerts/trigger/cpu-usage",
            },
            lastChecked: new Date().toISOString(),
          },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // GET /api/metrics/alerts - Get active alerts count
  app.get(
    "/api/metrics/alerts",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { project } = req.query;
        let conditions = [eq(alerts.status, "active")];
        if (project && project !== "all")
          conditions.push(eq(alerts.source, project as string)); // Assuming source is project for now or mapping it

        const [result] = await db
          .select({ count: sql<number>`count(*)` })
          .from(alerts)
          .where(and(...conditions));
        res.json({
          success: true,
          data: { totalActiveAlerts: Number(result.count) },
        });
      } catch (error: any) {
        next(error);
      }
    },
  );

  // Add error handling middleware
  app.use(errorHandler);

  const httpServer: Server = createServer(app);
  return httpServer;
};

export { registerRoutes };
