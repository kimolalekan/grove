import "dotenv/config";
import express, { Express, Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import { MeiliSearch, Index, SearchParams } from "meilisearch";
import bcrypt from "bcryptjs";
import * as fs from "fs/promises";
import * as path from "path";

// Define TypeScript interfaces
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
  id: number;
  name: string;
  condition: string;
  threshold: string;
  metric: string;
  notify: string;
  channel: "email" | "sms";
  enabled: boolean;
}

interface ActiveAlert {
  id: number;
  message: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  source: string;
  acknowledged: boolean;
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

interface SearchQueryParams {
  search?: string;
  status?: string;
  role?: string;
  sortBy?: string;
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

// Extend Express Request to include our custom types
declare global {
  namespace Express {
    interface Request {
      searchParams?: SearchQueryParams;
      userSearchParams?: SearchQueryParams;
      logSearchParams?: {
        search?: string;
        source?: string;
        level?: string;
        project?: string;
        sortBy?: string;
        limit?: number;
        offset?: number;
        timeRange?: string;
        from?: string;
        to?: string;
      };
      alertSearchParams?: {
        search?: string;
        severity?: string;
        source?: string;
        acknowledged?: string;
        sortBy?: string;
        limit?: number;
        offset?: number;
      };
    }
  }
}

const app: Express = express();
app.use(express.json());

// Initialize Meilisearch client
const client: MeiliSearch = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_KEY || "",
});

// Index names
const API_KEYS_INDEX: string = "api_keys";
const USERS_INDEX: string = "users";
const LOGS_INDEX = "logs";
const ALERTS_INDEX = "alerts";
const ALERT_RULES_INDEX = "alert_rules";

// Password salt rounds for bcrypt
const SALT_ROUNDS = 12;

/**
 * API Key Authentication Middleware
 *
 * This middleware validates API keys for all routes except the login route.
 * API keys can be provided in two ways:
 * 1. Authorization header as 'Bearer <api-key>'
 * 2. x-api-key header with the API key value
 *
 * The middleware:
 * - Skips authentication for /api/users/login
 * - Validates the API key exists in MeiliSearch
 * - Checks if the API key status is 'active'
 * - Updates the lastUsed timestamp for valid API keys
 * - Returns 401 for missing, invalid, or revoked API keys
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Skip authentication for login route
    if (req.path === "/api/users/login") {
      console.log(
        `[AUTH] Skipping authentication for login route: ${req.method} ${req.path}`,
      );
      return next();
    }

    console.log(`[AUTH] Authenticating request: ${req.method} ${req.path}`);

    // Get API key from Authorization header or x-api-key header
    const apiKey =
      req.headers.authorization?.replace(/^Bearer\s+/, "") ||
      (req.headers["x-api-key"] as string);

    if (!apiKey) {
      console.log(
        `[AUTH] Missing API key for route: ${req.method} ${req.path}`,
      );
      const errorResponse: ErrorResponse = {
        success: false,
        message:
          "API key is required. Please provide it in Authorization header as 'Bearer <key>' or in x-api-key header",
      };
      return res.status(401).json(errorResponse);
    }

    // Validate API key against MeiliSearch
    const index: Index = client.index(API_KEYS_INDEX);
    try {
      const apiKeyDoc: ApiKey = await index.getDocument(apiKey);

      // Check if API key is active
      if (apiKeyDoc.status !== "active") {
        console.log(
          `[AUTH] API key is ${apiKeyDoc.status} for route: ${req.method} ${req.path}`,
        );
        const errorResponse: ErrorResponse = {
          success: false,
          message: "API key is revoked or inactive",
        };
        return res.status(401).json(errorResponse);
      }

      // Update last used timestamp
      await index.updateDocuments([
        {
          key: apiKey,
          lastUsed: new Date().toISOString(),
        },
      ]);

      console.log(
        `[AUTH] Successfully authenticated route: ${req.method} ${req.path} with API key: ${apiKeyDoc.name}`,
      );
      next();
    } catch (error: any) {
      if (error.code === "document_not_found") {
        console.log(
          `[AUTH] Invalid API key provided for route: ${req.method} ${req.path}`,
        );
        const errorResponse: ErrorResponse = {
          success: false,
          message: "Invalid API key",
        };
        return res.status(401).json(errorResponse);
      }
      throw error;
    }
  } catch (error: any) {
    next(error);
  }
};

// Middleware to parse search query parameters
const parseSearchParams = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { search, status, sortBy } = req.query;
  req.searchParams = {
    search: search as string | undefined,
    status: status as string | undefined,
    sortBy: sortBy as string | undefined,
  };
  next();
};

// Middleware to parse user search query parameters
const parseUserSearchParams = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { search, status, role, sortBy } = req.query;
  req.userSearchParams = {
    search: search as string | undefined,
    status: status as string | undefined,
    role: role as string | undefined,
    sortBy: sortBy as string | undefined,
  };
  next();
};

const parseLogSearchParams = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const {
    search,
    source,
    level,
    project,
    sortBy,
    limit,
    offset,
    timeRange,
    from,
    to,
  } = req.query;
  req.logSearchParams = {
    search: search as string | undefined,
    source: source as string | undefined,
    level: level as string | undefined,
    project: project as string | undefined,
    sortBy: sortBy as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    timeRange: timeRange as string | undefined,
    from: from as string | undefined,
    to: to as string | undefined,
  };
  next();
};

const parseAlertSearchParams = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { search, severity, source, acknowledged, sortBy, limit, offset } =
    req.query;
  req.alertSearchParams = {
    search: search as string | undefined,
    severity: severity as string | undefined,
    source: source as string | undefined,
    acknowledged: acknowledged as string | undefined,
    sortBy: sortBy as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
  };
  next();
};
const logErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error("Log Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

// Error handling middleware
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

// Generate a unique ID for users
const generateUserId = (): string => {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Hash password using bcrypt
const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Validate password against hash
const validatePassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// Email validation function
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation function
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

// Helper function to check MeiliSearch connectivity
const checkMeiliSearchConnection = async (): Promise<void> => {
  try {
    console.log("Checking MeiliSearch connectivity...");
    await client.health();
    console.log("MeiliSearch is healthy and accessible");
  } catch (error: any) {
    console.error("MeiliSearch is not accessible:", error);
    throw new Error(`Failed to connect to MeiliSearch: ${error.message}`);
  }
};

// Helper function to wait for index creation
const waitForIndex = async (
  indexName: string,
  maxRetries: number = 20,
): Promise<Index> => {
  console.log(`Waiting for index ${indexName} to become available...`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const index = await client.getIndex(indexName);
      console.log(`Index ${indexName} is available after ${i + 1} attempt(s)`);
      return index;
    } catch (error: any) {
      if (
        (error.code === "index_not_found" ||
          error.cause?.code === "index_not_found") &&
        i < maxRetries - 1
      ) {
        console.log(
          `Index ${indexName} not ready, retrying in 1 second... (attempt ${i + 1}/${maxRetries})`,
        );
        // Wait 1 second before retrying (increased from 500ms)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      console.error(
        `Failed to get index ${indexName} after ${i + 1} attempts:`,
        error,
      );
      throw error;
    }
  }
  throw new Error(
    `Index ${indexName} not available after ${maxRetries} retries`,
  );
};

async function initializeDefaults() {
  try {
    // First, check if grove.json exists
    let configExists = true;
    try {
      const currentDir = process.cwd();
      const filePath = path.join(currentDir, "grove.json");
      await fs.access(filePath);
    } catch {
      configExists = false;
    }

    // If file doesn't exist, create it with defaults
    if (!configExists) {
      const apiKeyData: ApiKey = {
        key: generateApiKey(),
        name: "Grove API Key",
        status: "active",
        created: new Date().toISOString(),
        lastUsed: null,
      };

      const hashedPassword = await hashPassword("Grove12345");
      const now = new Date().toISOString();
      const userData: User = {
        id: generateUserId(),
        name: "Grove Admin",
        email: "admin@grove.dev",
        password: hashedPassword,
        role: "admin",
        status: "active",
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
      };

      // Add to Meilisearch
      await client.index(API_KEYS_INDEX).addDocuments([apiKeyData]);
      await client.index(USERS_INDEX).addDocuments([userData]);

      // Create config file
      const _config: ApiConfig = { user: 1, api_key: 1 };
      const _data = JSON.stringify(_config, null, 2);
      const currentDir = process.cwd();
      const filePath = path.join(currentDir, "grove.json");
      await fs.writeFile(filePath, _data, "utf-8");

      // Update .env file with the new API key
      const envPath = path.join(currentDir, ".env");
      let envContent = await fs.readFile(envPath, "utf-8");
      envContent = envContent.replace(
        /VITE_PUBLIC_API_KEY=".*"/,
        `VITE_PUBLIC_API_KEY="${apiKeyData.key}"`,
      );
      await fs.writeFile(envPath, envContent, "utf-8");

      console.log("Default user and API key created successfully");
    } else {
      console.log("grove.json already exists, skipping initialization");
    }
  } catch (error) {
    console.error("Error initializing defaults:", error);
    throw error;
  }
}

// Initialize index settings with proper sortable and filterable attributes
const initializeIndexSettings = async (): Promise<void> => {
  console.log("Starting Meilisearch index initialization...");

  try {
    // First check MeiliSearch connectivity
    await checkMeiliSearchConnection();

    // API Keys index settings
    console.log(`Initializing ${API_KEYS_INDEX} index...`);
    let apiKeysIndex: Index;
    try {
      apiKeysIndex = await client.getIndex(API_KEYS_INDEX);
      console.log(`${API_KEYS_INDEX} index found`);
    } catch (error: any) {
      if (
        error.code === "index_not_found" ||
        error.cause?.code === "index_not_found"
      ) {
        console.log(`${API_KEYS_INDEX} index not found, creating...`);
        await client.createIndex(API_KEYS_INDEX, {
          primaryKey: "key",
        });
        console.log(
          `${API_KEYS_INDEX} index created, waiting for availability...`,
        );
        apiKeysIndex = await waitForIndex(API_KEYS_INDEX);
        console.log(`${API_KEYS_INDEX} index is now available`);
      } else {
        console.error(`Error getting ${API_KEYS_INDEX} index:`, error);
        throw error;
      }
    }
    // Configure settings for API keys index
    await apiKeysIndex.updateSettings({
      sortableAttributes: ["created", "lastUsed", "name", "status"],
      filterableAttributes: ["name", "status", "created", "lastUsed"],
      searchableAttributes: ["name", "key"],
    });
    console.log(`Meilisearch index '${API_KEYS_INDEX}' settings configured`);

    // Users index settings
    console.log(`Initializing ${USERS_INDEX} index...`);
    let usersIndex: Index;
    try {
      usersIndex = await client.getIndex(USERS_INDEX);
      console.log(`${USERS_INDEX} index found`);
    } catch (error: any) {
      if (
        error.code === "index_not_found" ||
        error.cause?.code === "index_not_found"
      ) {
        console.log(`${USERS_INDEX} index not found, creating...`);
        await client.createIndex(USERS_INDEX, {
          primaryKey: "id",
        });
        console.log(
          `${USERS_INDEX} index created, waiting for availability...`,
        );
        usersIndex = await waitForIndex(USERS_INDEX);
        console.log(`${USERS_INDEX} index is now available`);
      } else {
        console.error(`Error getting ${USERS_INDEX} index:`, error);
        throw error;
      }
    }
    // Configure settings for users index
    await usersIndex.updateSettings({
      sortableAttributes: [
        "createdAt",
        "updatedAt",
        "lastLogin",
        "name",
        "email",
        "role",
        "status",
      ],
      filterableAttributes: [
        "name",
        "email",
        "role",
        "status",
        "lastLogin",
        "createdAt",
        "updatedAt",
      ],
      searchableAttributes: ["name", "email"],
    });
    console.log(`Meilisearch index '${USERS_INDEX}' settings configured`);

    // Logs index settings
    console.log(`Initializing ${LOGS_INDEX} index...`);
    let logIndex: Index;
    try {
      logIndex = await client.getIndex(LOGS_INDEX);
      console.log(`${LOGS_INDEX} index found`);
    } catch (error: any) {
      if (
        error.code === "index_not_found" ||
        error.cause?.code === "index_not_found"
      ) {
        console.log(`${LOGS_INDEX} index not found, creating...`);
        await client.createIndex(LOGS_INDEX, {
          primaryKey: "id",
        });
        console.log(`${LOGS_INDEX} index created, waiting for availability...`);
        logIndex = await waitForIndex(LOGS_INDEX);
        console.log(`${LOGS_INDEX} index is now available`);
      } else {
        console.error(`Error getting ${LOGS_INDEX} index:`, error);
        throw error;
      }
    }
    // Configure settings for logs index
    await logIndex.updateSettings({
      sortableAttributes: ["id", "timestamp", "source", "level", "project"],
      filterableAttributes: ["id", "source", "level", "timestamp", "project"],
      searchableAttributes: ["message", "source"],
    });
    console.log(`Meilisearch index '${LOGS_INDEX}' settings configured`);

    // Alerts index settings
    console.log(`Initializing ${ALERTS_INDEX} index...`);
    let alertsIndex: Index;
    try {
      alertsIndex = await client.getIndex(ALERTS_INDEX);
      console.log(`${ALERTS_INDEX} index found`);
    } catch (error: any) {
      if (
        error.code === "index_not_found" ||
        error.cause?.code === "index_not_found"
      ) {
        console.log(`${ALERTS_INDEX} index not found, creating...`);
        await client.createIndex(ALERTS_INDEX, {
          primaryKey: "id",
        });
        console.log(
          `${ALERTS_INDEX} index created, waiting for availability...`,
        );
        alertsIndex = await waitForIndex(ALERTS_INDEX);
        console.log(`${ALERTS_INDEX} index is now available`);
      } else {
        console.error(`Error getting ${ALERTS_INDEX} index:`, error);
        throw error;
      }
    }
    // Configure settings for alerts index
    await alertsIndex.updateSettings({
      sortableAttributes: [
        "id",
        "timestamp",
        "severity",
        "source",
        "acknowledged",
      ],
      filterableAttributes: [
        "id",
        "severity",
        "source",
        "acknowledged",
        "timestamp",
      ],
      searchableAttributes: ["message", "source"],
    });
    console.log(`Meilisearch index '${ALERTS_INDEX}' settings configured`);

    // Alert Rules index settings
    console.log(`Initializing ${ALERT_RULES_INDEX} index...`);
    let alertRulesIndex: Index;
    try {
      alertRulesIndex = await client.getIndex(ALERT_RULES_INDEX);
      console.log(`${ALERT_RULES_INDEX} index found`);
    } catch (error: any) {
      if (
        error.code === "index_not_found" ||
        error.cause?.code === "index_not_found"
      ) {
        console.log(`${ALERT_RULES_INDEX} index not found, creating...`);
        await client.createIndex(ALERT_RULES_INDEX, {
          primaryKey: "id",
        });
        console.log(
          `${ALERT_RULES_INDEX} index created, waiting for availability...`,
        );
        alertRulesIndex = await waitForIndex(ALERT_RULES_INDEX);
        console.log(`${ALERT_RULES_INDEX} index is now available`);
      } else {
        console.error(`Error getting ${ALERT_RULES_INDEX} index:`, error);
        throw error;
      }
    }
    // Configure settings for alert rules index
    await alertRulesIndex.updateSettings({
      sortableAttributes: ["id", "name", "metric", "channel", "enabled"],
      filterableAttributes: ["id", "name", "metric", "channel", "enabled"],
      searchableAttributes: ["name", "condition", "metric", "notify"],
    });
    console.log(`Meilisearch index '${ALERT_RULES_INDEX}' settings configured`);

    console.log("All Meilisearch indexes initialized successfully!");
  } catch (error: any) {
    console.error("Error initializing index settings:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code || error.cause?.code,
      type: error.type || error.cause?.type,
      stack: error.stack,
    });
    throw error; // Re-throw to let caller know initialization failed
  }

  try {
    await initializeDefaults();
  } catch (error: any) {
    console.error("Failed to initialize indexes:", error);
    throw error;
  }
};

const registerRoutes = async (app: Express): Promise<Server> => {
  // Initialize index settings with proper attributes
  try {
    await initializeIndexSettings();
    console.log("All indexes initialized successfully");
  } catch (error: any) {
    console.error("Failed to initialize indexes:", error);
    throw error;
  }

  // API Key routes
  // GET /api/apikeys - Retrieve all API keys with optional search/filter
  app.get(
    "/api/apikeys",
    authenticateApiKey,
    parseSearchParams,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          status,
          sortBy = "created:desc",
        } = req.searchParams || {};
        const index: Index = client.index(API_KEYS_INDEX);
        let filters: string[] = [];
        if (status) {
          filters.push(`status = "${status}"`);
        }
        const searchParams: SearchParams = {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort: [sortBy],
        };
        let results: any;
        if (search) {
          const searchResults = await index.search(search, searchParams);
          results = {
            hits: searchResults.hits,
            estimatedTotalHits: searchResults.estimatedTotalHits,
          };
        } else {
          // Use the correct method for getting all documents with filters
          const searchResults = await index.search("", {
            ...searchParams,
            limit: 1000,
          });
          results = {
            hits: searchResults.hits,
            estimatedTotalHits: searchResults.estimatedTotalHits,
          };
        }
        const response: SuccessResponse<ApiKey[]> = {
          success: true,
          data: results.hits,
          total: results.estimatedTotalHits,
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
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Name and key are required",
          };
          return res.status(400).json(errorResponse);
        }
        const index: Index = client.index(API_KEYS_INDEX);
        try {
          // Check if key already exists by trying to get it
          await index.getDocument(key);
          // If we get here, the document exists
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key already exists",
          };
          return res.status(409).json(errorResponse);
        } catch (error: any) {
          // Document doesn't exist, which is what we want
          if (error.code !== "document_not_found") {
            // throw error;
          }
        }
        const apiKeyData: ApiKey = {
          key,
          name,
          status,
          created: new Date().toISOString(),
          lastUsed: null,
        };
        await index.addDocuments([apiKeyData]);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: apiKeyData,
        };
        res.status(201).json(response);
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
        const index: Index = client.index(API_KEYS_INDEX);
        const apiKey: ApiKey = await index.getDocument(key);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: apiKey,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const updates: ApiKeyUpdateRequest = req.body;
        const index: Index = client.index(API_KEYS_INDEX);
        // Get the current document
        const currentDoc: ApiKey = await index.getDocument(key);
        // Merge updates with current document
        const updatedDoc: ApiKey = { ...currentDoc, ...updates };
        // Update the document
        await index.updateDocuments([updatedDoc]);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: updatedDoc,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(API_KEYS_INDEX);
        // Get the current document
        const currentDoc: ApiKey = await index.getDocument(key);
        // Update status to revoked
        const updatedDoc: ApiKey = { ...currentDoc, status: "revoked" };
        // Update the document
        await index.updateDocuments([updatedDoc]);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: updatedDoc,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(API_KEYS_INDEX);
        // Get the current document
        const currentDoc: ApiKey = await index.getDocument(key);
        // Update status to active
        const updatedDoc: ApiKey = { ...currentDoc, status: "active" };
        // Update the document
        await index.updateDocuments([updatedDoc]);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: updatedDoc,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(API_KEYS_INDEX);
        // Delete the document
        await index.deleteDocument(key);
        const response: SuccessResponse<{ message: string }> = {
          success: true,
          data: { message: "API key deleted successfully" },
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(API_KEYS_INDEX);
        // Get the current document
        const currentDoc: ApiKey = await index.getDocument(key);
        // Update last used timestamp
        const updatedDoc: ApiKey = {
          ...currentDoc,
          lastUsed: new Date().toISOString(),
        };
        // Update the document
        await index.updateDocuments([updatedDoc]);
        const response: SuccessResponse<ApiKey> = {
          success: true,
          data: updatedDoc,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "API key not found",
          };
          return res.status(404).json(errorResponse);
        }
        next(error);
      }
    },
  );

  // USER ROUTES
  // GET /api/users - Retrieve all users with optional search/filter
  app.get(
    "/api/users",
    authenticateApiKey,
    parseUserSearchParams,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          status,
          role,
          sortBy = "createdAt:desc",
        } = req.userSearchParams || {};
        const index: Index = client.index(USERS_INDEX);
        let filters: string[] = [];
        if (status) {
          filters.push(`status = "${status}"`);
        }
        if (role) {
          filters.push(`role = "${role}"`);
        }
        const searchParams: SearchParams = {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort: [sortBy],
          limit: 1000,
        };
        // Use search for both searching and filtering
        const searchResults = await index.search(search || "", searchParams);
        // Remove passwords from response
        const usersWithoutPasswords = searchResults.hits.map((user: any) => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
        const response: SuccessResponse<any[]> = {
          success: true,
          data: usersWithoutPasswords,
          total: searchResults.estimatedTotalHits,
        };
        res.json(response);
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
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Name, email, and password are required",
          };
          return res.status(400).json(errorResponse);
        }
        // Validate email
        if (!isValidEmail(email)) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Invalid email format",
          };
          return res.status(400).json(errorResponse);
        }
        // Validate password
        const passwordValidation = isValidPassword(password);
        if (!passwordValidation.valid) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: passwordValidation.message || "Invalid password",
          };
          return res.status(400).json(errorResponse);
        }
        const index: Index = client.index(USERS_INDEX);
        // Check if email already exists using search
        const existingUsers = await index.search("", {
          filter: `email = "${email}"`,
          limit: 1,
        });
        if (existingUsers.hits.length > 0) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "User with this email already exists",
          };
          return res.status(409).json(errorResponse);
        }
        // Hash password
        const hashedPassword = await hashPassword(password);
        const now = new Date().toISOString();
        const userData: User = {
          id: generateUserId(),
          name,
          email,
          password: hashedPassword,
          role,
          status,
          lastLogin: null,
          createdAt: now,
          updatedAt: now,
        };
        await index.addDocuments([userData]);
        // Remove password from response
        const { password: _, ...userWithoutPassword } = userData;
        const response: SuccessResponse<Omit<User, "password">> = {
          success: true,
          data: userWithoutPassword,
        };
        res.status(201).json(response);
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
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Email and password are required",
          };
          return res.status(400).json(errorResponse);
        }
        const index: Index = client.index(USERS_INDEX);
        // Find user by email using search
        const users = await index.search("", {
          filter: `email = "${email}"`,
          limit: 1,
        });
        if (users.hits.length === 0) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Invalid email or password",
          };
          return res.status(401).json(errorResponse);
        }
        const user = users.hits[0] as User;
        // Check if user is active
        if (user.status !== "active") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Account is not active",
          };
          return res.status(401).json(errorResponse);
        }
        // Validate password
        const isValid = await validatePassword(password, user.password);
        if (!isValid) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "Invalid email or password",
          };
          return res.status(401).json(errorResponse);
        }
        // Update last login
        const updatedDoc: User = {
          ...user,
          lastLogin: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await index.updateDocuments([updatedDoc]);
        // Remove password from response
        const { password: _, ...userWithoutPassword } = updatedDoc;
        const response: SuccessResponse<Omit<User, "password">> = {
          success: true,
          data: userWithoutPassword,
        };
        res.json(response);
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
        const index: Index = client.index(USERS_INDEX);
        const user: User = await index.getDocument(id);
        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        const response: SuccessResponse<Omit<User, "password">> = {
          success: true,
          data: userWithoutPassword,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "User not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(USERS_INDEX);
        // Get the current document
        const currentDoc: User = await index.getDocument(id);
        // Check if email is being changed and if it already exists
        if (updates.email && updates.email !== currentDoc.email) {
          if (!isValidEmail(updates.email)) {
            const errorResponse: ErrorResponse = {
              success: false,
              message: "Invalid email format",
            };
            return res.status(400).json(errorResponse);
          }
          const existingUsers = await index.search("", {
            filter: `email = "${updates.email}"`,
            limit: 1,
          });
          if (existingUsers.hits.length > 0) {
            const errorResponse: ErrorResponse = {
              success: false,
              message: "User with this email already exists",
            };
            return res.status(409).json(errorResponse);
          }
        }
        // Merge updates with current document
        const updatedDoc: User = {
          ...currentDoc,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        // Update the document
        await index.updateDocuments([updatedDoc]);
        // Remove password from response
        const { password, ...userWithoutPassword } = updatedDoc;
        const response: SuccessResponse<Omit<User, "password">> = {
          success: true,
          data: userWithoutPassword,
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "User not found",
          };
          return res.status(404).json(errorResponse);
        }
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
          const errorResponse: ErrorResponse = {
            success: false,
            message: "New password is required",
          };
          return res.status(400).json(errorResponse);
        }

        const index: Index = client.index(USERS_INDEX);

        // Validate new password
        const passwordValidation = isValidPassword(newPassword);
        if (!passwordValidation.valid) {
          const errorResponse: ErrorResponse = {
            success: false,
            message: passwordValidation.message || "Invalid password",
          };
          return res.status(400).json(errorResponse);
        }

        // Get the current document
        const currentDoc: User = await index.getDocument(id);

        // Hash new password
        const hashedPassword = await hashPassword(newPassword);

        // Update password
        const updatedDoc: User = {
          ...currentDoc,
          password: hashedPassword,
          updatedAt: new Date().toISOString(),
        };

        // Update the document
        await index.updateDocuments([updatedDoc]);

        const response: SuccessResponse<{ message: string }> = {
          success: true,
          data: { message: "Password updated successfully" },
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "User not found",
          };
          return res.status(404).json(errorResponse);
        }
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
        const index: Index = client.index(USERS_INDEX);
        // Delete the document
        await index.deleteDocument(id);
        const response: SuccessResponse<{ message: string }> = {
          success: true,
          data: { message: "User deleted successfully" },
        };
        res.json(response);
      } catch (error: any) {
        if (error.code === "document_not_found") {
          const errorResponse: ErrorResponse = {
            success: false,
            message: "User not found",
          };
          return res.status(404).json(errorResponse);
        }
        next(error);
      }
    },
  );

  app.get(
    "/api/logs",
    authenticateApiKey,
    parseLogSearchParams,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          source,
          level,
          project,
          sortBy = "timestamp:desc",
          limit = 100,
          offset = 0,
          timeRange,
          from,
          to,
        } = req.logSearchParams || {};

        // Validate sortBy parameter
        const validSortFields = ["timestamp", "source", "level", "project"];
        const validSortDirections = ["asc", "desc"];
        const [sortField, sortDirection = "desc"] = sortBy.split(":");

        if (!validSortFields.includes(sortField)) {
          return res.status(400).json({
            success: false,
            message: `Invalid sort field. Must be one of: ${validSortFields.join(", ")}`,
          });
        }

        if (!validSortDirections.includes(sortDirection)) {
          return res.status(400).json({
            success: false,
            message: `Invalid sort direction. Must be one of: ${validSortDirections.join(", ")}`,
          });
        }

        // Validate level parameter if provided
        if (level) {
          const validLevels = ["info", "warning", "error"];
          if (!validLevels.includes(level)) {
            return res.status(400).json({
              success: false,
              message: `Invalid level. Must be one of: ${validLevels.join(", ")}`,
            });
          }
        }

        const index: Index = client.index(LOGS_INDEX);
        let filters: string[] = [];
        if (source) {
          filters.push(`source = "${source}"`);
        }
        if (level) {
          filters.push(`level = "${level}"`);
        }
        if (project) {
          filters.push(`project = "${project}"`);
        }

        // Handle time filtering
        if (timeRange && timeRange !== "custom") {
          const now = new Date();
          let fromDate = new Date();

          switch (timeRange) {
            case "1":
              fromDate.setHours(now.getHours() - 1);
              break;
            case "6":
              fromDate.setHours(now.getHours() - 6);
              break;
            case "12":
              fromDate.setHours(now.getHours() - 12);
              break;
            case "24":
              fromDate.setDate(now.getDate() - 1);
              break;
            case "72":
              fromDate.setDate(now.getDate() - 3);
              break;
            case "168":
              fromDate.setDate(now.getDate() - 7);
              break;
            default:
              fromDate.setDate(now.getDate() - 1);
          }

          filters.push(`timestamp >= "${fromDate.toISOString()}"`);
          filters.push(`timestamp <= "${now.toISOString()}"`);
        } else if (timeRange === "custom" && (from || to)) {
          if (from) {
            const fromDate = new Date(from);
            if (!isNaN(fromDate.getTime())) {
              filters.push(`timestamp >= "${fromDate.toISOString()}"`);
            }
          }
          if (to) {
            const toDate = new Date(to);
            if (!isNaN(toDate.getTime())) {
              // Add 23:59:59 to the end of the day for the "to" date
              toDate.setHours(23, 59, 59, 999);
              filters.push(`timestamp <= "${toDate.toISOString()}"`);
            }
          }
        }

        // Validate and sanitize limit and offset
        const sanitizedLimit = Math.min(Math.max(1, limit), 1000);
        const sanitizedOffset = Math.max(0, offset);

        const searchParams: any = {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort: [`${sortField}:${sortDirection}`],
          limit: sanitizedLimit,
          offset: sanitizedOffset,
        };

        let results;
        if (search) {
          results = await index.search(search, searchParams);
        } else {
          results = await index.search("", searchParams);
        }

        const response = {
          success: true,
          data: results.hits,
          total: results.estimatedTotalHits,
          pagination: {
            limit: sanitizedLimit,
            offset: sanitizedOffset,
            hasMore: results.hits.length === sanitizedLimit,
          },
        };
        res.json(response);
      } catch (error: any) {
        console.error("Error fetching logs:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch logs",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );
  app.post(
    "/api/logs",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { source, message, level, details, project } = req.body;

        // Validate required fields
        if (!source || typeof source !== "string") {
          return res.status(400).json({
            success: false,
            message: "Source is required and must be a string",
          });
        }

        if (!message || typeof message !== "string") {
          return res.status(400).json({
            success: false,
            message: "Message is required and must be a string",
          });
        }

        // Validate level enum
        const validLevels = ["info", "warning", "error"];
        if (!level || !validLevels.includes(level)) {
          return res.status(400).json({
            success: false,
            message:
              "Level is required and must be one of: info, warning, error",
          });
        }

        // Generate timestamp and ID if not provided
        const newLog: LogEntry = {
          id: req.body.id || Date.now(),
          project: project || "default",
          timestamp: req.body.timestamp || new Date().toISOString(),
          source,
          message,
          level,
          details: details || {},
        };

        const index: Index = client.index(LOGS_INDEX);
        await index.addDocuments([newLog]);
        res.status(201).json({ success: true, data: newLog });
      } catch (error: any) {
        console.error("Error creating log entry:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create log entry",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // GET /api/logs/projects - Get distinct projects (must come before /:id route)
  app.get(
    "/api/logs/projects",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const index: Index = client.index(LOGS_INDEX);

        // Get a large sample of documents to extract unique projects
        const results = await index.search("", {
          limit: 100,
          attributesToRetrieve: ["project"],
        });

        // Extract unique projects
        const projectsSet = new Set<string>();
        results.hits.forEach((hit: any) => {
          if (hit.project) {
            projectsSet.add(hit.project);
          }
        });

        const projects = Array.from(projectsSet).sort();

        res.json({
          success: true,
          data: projects,
        });
      } catch (error: any) {
        console.error("Error fetching projects:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch projects",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // GET /api/logs/sources - Get distinct sources (must come before /:id route)
  app.get(
    "/api/logs/sources",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const index: Index = client.index(LOGS_INDEX);

        // Get a large sample of documents to extract unique sources
        const results = await index.search("", {
          limit: 1000,
          attributesToRetrieve: ["source"],
        });

        // Extract unique sources
        const sourcesSet = new Set<string>();
        results.hits.forEach((hit: any) => {
          if (hit.source) {
            sourcesSet.add(hit.source);
          }
        });

        const sources = Array.from(sourcesSet).sort();

        res.json({
          success: true,
          data: sources,
        });
      } catch (error: any) {
        console.error("Error fetching sources:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch sources",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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
        const now = new Date();
        const timeRangeMs = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };
        const fromDate = new Date(
          now.getTime() -
            (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
              timeRangeMs["24h"]),
        );

        console.log("Date range:", {
          from: fromDate.toISOString(),
          to: now.toISOString(),
        });

        const index: Index = client.index(LOGS_INDEX);
        const levels = ["info", "warning", "error"];
        const counts: { [key: string]: number } = {};

        const baseFilters: string[] = [];
        if (project && project !== "all") {
          baseFilters.push(`project = "${project}"`);
        }
        if (source && source !== "all") {
          baseFilters.push(`source = "${source}"`);
        }
        // Use ISO strings for timestamp filters
        baseFilters.push(`timestamp >= "${fromDate.toISOString()}"`);
        baseFilters.push(`timestamp <= "${now.toISOString()}"`);

        console.log("Base filters:", baseFilters);

        // Get counts for each level
        for (const level of levels) {
          const filters: string[] = [...baseFilters, `level = "${level}"`];
          const searchOptions = {
            filter: filters.join(" AND "),
            limit: 0,
          };
          console.log(
            `Searching for level ${level} with filter:`,
            filters.join(" AND "),
          );
          try {
            const results = await index.search("", searchOptions);
            counts[level] = results.estimatedTotalHits || 0;
            console.log(`Level ${level} count:`, counts[level]);
          } catch (levelError) {
            console.error(`Error searching for level ${level}:`, levelError);
            counts[level] = 0;
          }
        }

        // Get total count
        const totalSearchOptions = {
          filter: baseFilters.join(" AND "),
          limit: 0,
        };
        console.log("Total search filter:", baseFilters.join(" AND "));
        try {
          const totalResults = await index.search("", totalSearchOptions);
          counts.total = totalResults.estimatedTotalHits || 0;
          console.log("Total count:", counts.total);
        } catch (totalError) {
          console.error("Error getting total count:", totalError);
          counts.total = 0;
        }

        res.json({
          success: true,
          data: counts,
          debug: {
            dateRange: {
              from: fromDate.toISOString(),
              to: now.toISOString(),
            },
            filters: baseFilters,
          },
        });
      } catch (error: any) {
        console.error("Error in /api/logs/stats:", error);
        next(error);
      }
    },
  );

  // GET /api/logs/:id - Get a specific log entry by ID
  // ALERT ROUTES
  // GET /api/alerts - Retrieve all alerts with optional search/filter
  app.get(
    "/api/alerts",
    authenticateApiKey,
    parseAlertSearchParams,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          search,
          severity,
          source,
          acknowledged,
          sortBy,
          limit = 20,
          offset = 0,
        } = req.alertSearchParams || {};

        const index: Index = client.index(ALERTS_INDEX);

        // Build filter array
        const filters: string[] = [];
        if (severity) {
          filters.push(`severity = "${severity}"`);
        }
        if (source) {
          filters.push(`source = "${source}"`);
        }
        if (acknowledged !== undefined) {
          filters.push(`acknowledged = ${acknowledged === "true"}`);
        }

        // Build sort array
        const sort: string[] = [];
        if (sortBy) {
          sort.push(`${sortBy}:desc`);
        } else {
          sort.push("timestamp:desc");
        }

        const searchOptions: any = {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort,
          limit,
          offset,
        };

        const results = await index.search(search || "", searchOptions);

        res.json({
          success: true,
          data: results.hits,
          total: results.estimatedTotalHits,
          pagination: {
            limit,
            offset,
            total: results.estimatedTotalHits,
          },
        });
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

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid log ID is required",
          });
        }

        const index: Index = client.index(LOGS_INDEX);
        const results = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (results.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Log entry not found",
          });
        }

        res.json({
          success: true,
          data: results.hits[0],
        });
      } catch (error: any) {
        console.error("Error fetching log entry:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch log entry",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // POST /api/alerts - Create a new alert
  app.post(
    "/api/alerts",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { message, severity, source, acknowledged = false } = req.body;

        if (!message || !severity || !source) {
          return res.status(400).json({
            success: false,
            message: "Message, severity, and source are required",
          });
        }

        if (!["critical", "warning", "info"].includes(severity)) {
          return res.status(400).json({
            success: false,
            message: "Severity must be critical, warning, or info",
          });
        }

        const newAlert: ActiveAlert = {
          id: Date.now(),
          message,
          timestamp: new Date().toISOString(),
          severity,
          source,
          acknowledged,
        };

        const index: Index = client.index(ALERTS_INDEX);
        await index.addDocuments([newAlert]);

        res.status(201).json({
          success: true,
          data: newAlert,
        });
      } catch (error: any) {
        console.error("Error creating alert:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create alert",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        const index: Index = client.index(ALERTS_INDEX);
        const results = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (results.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }

        res.json({
          success: true,
          data: results.hits[0],
        });
      } catch (error: any) {
        console.error("Error fetching alert:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch alert",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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
        const { message, severity, source, acknowledged } = req.body;

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        const index: Index = client.index(ALERTS_INDEX);

        // First, check if the alert exists
        const existingResults = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (existingResults.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }

        const existingAlert = existingResults.hits[0] as ActiveAlert;

        // Validate severity if provided
        if (severity && !["critical", "warning", "info"].includes(severity)) {
          return res.status(400).json({
            success: false,
            message: "Severity must be critical, warning, or info",
          });
        }

        // Build updated alert
        const updatedAlert: ActiveAlert = {
          ...existingAlert,
          ...(message !== undefined && { message }),
          ...(severity !== undefined && { severity }),
          ...(source !== undefined && { source }),
          ...(acknowledged !== undefined && { acknowledged }),
        };

        await index.addDocuments([updatedAlert]);

        res.json({
          success: true,
          data: updatedAlert,
        });
      } catch (error: any) {
        console.error("Error updating alert:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update alert",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert ID is required",
          });
        }

        const index: Index = client.index(ALERTS_INDEX);

        // First, check if the alert exists
        const existingResults = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (existingResults.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert not found",
          });
        }

        await index.deleteDocument(parseInt(id, 10));

        res.json({
          success: true,
          message: "Alert deleted successfully",
        });
      } catch (error: any) {
        console.error("Error deleting alert:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete alert",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // ALERT RULES ROUTES
  // GET /api/alert-rules - Retrieve all alert rules with optional search/filter
  app.get(
    "/api/alert-rules",
    authenticateApiKey,
    parseSearchParams,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { search, sortBy } = req.searchParams || {};

        const index: Index = client.index(ALERT_RULES_INDEX);

        // Build sort array
        const sort: string[] = [];
        if (sortBy) {
          sort.push(`${sortBy}:asc`);
        } else {
          sort.push("name:asc");
        }

        const searchOptions: any = {
          sort,
          limit: 100, // Show all alert rules by default
        };

        const results = await index.search(search || "", searchOptions);

        res.json({
          success: true,
          data: results.hits,
          total: results.estimatedTotalHits,
        });
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
          return res.status(400).json({
            success: false,
            message:
              "Name, condition, threshold, metric, notify, and channel are required",
          });
        }

        if (!["email", "sms"].includes(channel)) {
          return res.status(400).json({
            success: false,
            message: "Channel must be email or sms",
          });
        }

        const newAlertRule: AlertRule = {
          id: Date.now(), // Simple ID generation, could use UUID in production
          name,
          condition,
          threshold,
          metric,
          notify,
          channel,
          enabled,
        };

        const index: Index = client.index(ALERT_RULES_INDEX);
        await index.addDocuments([newAlertRule]);

        res.status(201).json({
          success: true,
          data: newAlertRule,
        });
      } catch (error: any) {
        console.error("Error creating alert rule:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create alert rule",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // GET /api/alert-rules/:id - Get a specific alert rule by ID
  app.get(
    "/api/alert-rules/:id",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert rule ID is required",
          });
        }

        const index: Index = client.index(ALERT_RULES_INDEX);
        const results = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (results.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert rule not found",
          });
        }

        res.json({
          success: true,
          data: results.hits[0],
        });
      } catch (error: any) {
        console.error("Error fetching alert rule:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch alert rule",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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
        const { name, condition, threshold, metric, notify, channel, enabled } =
          req.body;

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert rule ID is required",
          });
        }

        const index: Index = client.index(ALERT_RULES_INDEX);

        // First, check if the alert rule exists
        const existingResults = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (existingResults.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert rule not found",
          });
        }

        const existingRule = existingResults.hits[0] as AlertRule;

        // Validate channel if provided
        if (channel && !["email", "sms"].includes(channel)) {
          return res.status(400).json({
            success: false,
            message: "Channel must be email or sms",
          });
        }

        // Build updated alert rule
        const updatedRule: AlertRule = {
          ...existingRule,
          ...(name !== undefined && { name }),
          ...(condition !== undefined && { condition }),
          ...(threshold !== undefined && { threshold }),
          ...(metric !== undefined && { metric }),
          ...(notify !== undefined && { notify }),
          ...(channel !== undefined && { channel }),
          ...(enabled !== undefined && { enabled }),
        };

        await index.addDocuments([updatedRule]);

        res.json({
          success: true,
          data: updatedRule,
        });
      } catch (error: any) {
        console.error("Error updating alert rule:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update alert rule",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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

        if (!id || isNaN(parseInt(id, 10))) {
          return res.status(400).json({
            success: false,
            message: "Valid alert rule ID is required",
          });
        }

        const index: Index = client.index(ALERT_RULES_INDEX);

        // First, check if the alert rule exists
        const existingResults = await index.search("", {
          filter: `id = ${parseInt(id, 10)}`,
          limit: 1,
        });

        if (existingResults.hits.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Alert rule not found",
          });
        }

        await index.deleteDocument(parseInt(id, 10));

        res.json({
          success: true,
          message: "Alert rule deleted successfully",
        });
      } catch (error: any) {
        console.error("Error deleting alert rule:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete alert rule",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // SYSTEM METRICS INGESTION ROUTES
  // POST /api/metrics/system - Receive system metrics from Ubuntu collectors
  app.post(
    "/api/metrics/system",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const metrics = req.body;

        // Validate required fields
        if (!metrics.timestamp || !metrics.project || !metrics.server) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields: timestamp, project, server",
          });
        }

        // Create system metrics index if it doesn't exist
        let systemIndex: Index;
        try {
          systemIndex = client.index("system_metrics");
        } catch (error) {
          // Index doesn't exist, create it
          await client.createIndex("system_metrics", { primaryKey: "id" });
          systemIndex = client.index("system_metrics");

          // Configure index settings
          await systemIndex.updateSettings({
            searchableAttributes: ["project", "server", "timestamp"],
            filterableAttributes: ["project", "server", "timestamp", "type"],
            sortableAttributes: ["timestamp"],
          });
        }

        // Add unique ID and type
        const systemMetric = {
          ...metrics,
          id: `${metrics.server}-${Date.now()}`,
          type: "system_metrics",
        };

        // Store metrics in MeiliSearch
        await systemIndex.addDocuments([systemMetric]);

        console.log(
          `Stored system metrics from ${metrics.server} for project ${metrics.project}`,
        );

        res.json({
          success: true,
          message: "System metrics stored successfully",
        });
      } catch (error: any) {
        console.error("Error storing system metrics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to store system metrics",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // GET /api/metrics/servers - List monitored servers with system metrics
  app.get(
    "/api/metrics/servers",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        let servers: string[] = [];
        let projects: string[] = [];
        let totalMetrics = 0;

        try {
          const systemIndex = client.index("system_metrics");

          // Get distinct servers and projects
          const results = await systemIndex.search("", {
            facets: ["server", "project"],
            limit: 0,
          });

          servers = Object.keys(results.facetDistribution?.server || {});
          projects = Object.keys(results.facetDistribution?.project || {});
          totalMetrics = results.estimatedTotalHits || 0;
        } catch (indexError) {
          // System metrics index might not exist yet
          console.log(
            "System metrics index not found, returning empty server list",
          );
        }

        // Also get servers from logs as fallback
        try {
          const logsIndex = client.index(LOGS_INDEX);
          const logResults = await logsIndex.search("", {
            facets: ["project"],
            limit: 0,
          });

          const logProjects = Object.keys(
            logResults.facetDistribution?.project || {},
          );
          projects = Array.from(new Set([...projects, ...logProjects]));
        } catch (logError) {
          console.log("Could not fetch projects from logs index");
        }

        res.json({
          success: true,
          data: {
            servers,
            projects,
            total_system_metrics: totalMetrics,
            has_system_data: servers.length > 0,
          },
        });
      } catch (error: any) {
        console.error("Error fetching servers:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch server list",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // METRICS ROUTES
  // GET /api/metrics/overview - Get overview metrics from logs
  app.get(
    "/api/metrics/overview",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project } = req.query;
        const index = client.index(LOGS_INDEX);
        const now = new Date();
        const timeRangeMs = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() -
            (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
              timeRangeMs["24h"]),
        );
        let filter = `timestamp >= "${startTime.toISOString()}"`;
        if (project && project !== "all") {
          filter += ` AND project = "${project}"`;
        }
        const results = await index.search("", {
          filter,
          limit: 10000,
        });
        const logs = results.hits as any[];
        const totalRequests = logs.length;
        const errorLogs = logs.filter(
          (log) =>
            log.level === "error" ||
            (log.details?.statusCode && log.details.statusCode >= 400),
        );
        const errorRate =
          totalRequests > 0 ? (errorLogs.length / totalRequests) * 100 : 0;
        const responseTimes = logs
          .filter((log) => log.details?.duration)
          .map((log) => log.details.duration);
        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) /
              responseTimes.length
            : 0;

        // Calculate requests per minute
        const timeRangeMinutes = Math.max(
          1,
          (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
            timeRangeMs["24h"]) /
            (1000 * 60),
        );
        const requestsPerMinute =
          timeRangeMinutes > 0 ? totalRequests / timeRangeMinutes : 0;

        // Generate time series data (simplified)
        const intervals = 20;
        const intervalMs =
          (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
            timeRangeMs["24h"]) / intervals;
        const requestData = [];
        const errorRateData = [];
        for (let i = 0; i < intervals; i++) {
          const intervalStart = new Date(startTime.getTime() + i * intervalMs);
          const intervalEnd = new Date(intervalStart.getTime() + intervalMs);
          const intervalLogs = logs.filter((log) => {
            const logTime = new Date(log.timestamp);
            return logTime >= intervalStart && logTime < intervalEnd;
          });
          const intervalErrors = intervalLogs.filter(
            (log) =>
              log.level === "error" ||
              (log.details?.statusCode && log.details.statusCode >= 400),
          );
          requestData.push(Math.max(0, intervalLogs.length));
          errorRateData.push(
            intervalLogs.length > 0
              ? (intervalErrors.length / intervalLogs.length) * 100
              : 0,
          );
        }

        res.json({
          success: true,
          data: {
            totalRequests: Math.round(totalRequests),
            requestsPerMinute: parseFloat(requestsPerMinute.toFixed(2)), // Return as float with 2 decimal places
            errorRate: Math.round(errorRate * 100) / 100,
            avgResponseTime: Math.round(avgResponseTime),
            uptime: 99.98,
            requestData,
            errorRateData,
          },
        });
      } catch (error: any) {
        console.error("Error fetching overview metrics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch overview metrics",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
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
        const index = client.index(LOGS_INDEX);

        // Calculate time range
        const now = new Date();
        const timeRangeMs = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() -
            (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
              timeRangeMs["24h"]),
        );

        // Get logs with response time data
        // Build filter for logs - use ISO string format for timestamp
        let filter = `timestamp >= "${startTime.toISOString()}"`;
        if (project && project !== "all") {
          filter += ` AND project = "${project}"`;
        }

        // Get all logs in time range for performance analysis
        const results = await index.search("", {
          filter,
          limit: 10000,
        });

        const logs = results.hits as any[];
        const logsWithDuration = logs.filter((log) => log.details?.duration);

        // Calculate response time metrics
        const responseTimes = logsWithDuration.map(
          (log) => log.details.duration,
        );
        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) /
              responseTimes.length
            : 0;
        const maxResponseTime =
          responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
        const minResponseTime =
          responseTimes.length > 0 ? Math.min(...responseTimes) : 0;

        // Generate time series data
        const intervals = 20;
        const intervalMs =
          (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
            timeRangeMs["24h"]) / intervals;
        const responseTimeData = [];
        const throughputData = [];

        for (let i = 0; i < intervals; i++) {
          const intervalStart = new Date(startTime.getTime() + i * intervalMs);
          const intervalEnd = new Date(intervalStart.getTime() + intervalMs);

          const intervalLogs = logs.filter((log) => {
            const logTime = new Date(log.timestamp);
            return logTime >= intervalStart && logTime < intervalEnd;
          });

          const intervalResponseTimes = intervalLogs
            .filter((log) => log.details?.duration)
            .map((log) => log.details.duration);

          const intervalAvgResponseTime =
            intervalResponseTimes.length > 0
              ? intervalResponseTimes.reduce((sum, time) => sum + time, 0) /
                intervalResponseTimes.length
              : 0;

          responseTimeData.push(Math.round(intervalAvgResponseTime));
          throughputData.push(intervalLogs.length);
        }

        res.json({
          success: true,
          data: {
            avgResponseTime: Math.round(avgResponseTime),
            maxResponseTime: Math.round(maxResponseTime),
            minResponseTime: Math.round(minResponseTime),
            totalRequests: logs.length,
            responseTimeData,
            throughputData,
          },
        });
      } catch (error: any) {
        console.error("Error fetching performance metrics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch performance metrics",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // GET /api/metrics/resources - Get resource metrics (real system data + log analysis)
  app.get(
    "/api/metrics/resources",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project, server } = req.query;

        // Calculate time range
        const now = new Date();
        const timeRangeMs = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };
        const startTime = new Date(
          now.getTime() -
            (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
              timeRangeMs["24h"]),
        );

        // Use the logs index and filter for source = "system_metrics"
        const logsIndex = client.index(LOGS_INDEX);
        let filter = `source = "system_metrics" AND timestamp >= "${startTime.toISOString()}"`;

        if (project && project !== "all") {
          filter += ` AND project = "${project}"`;
        }
        if (server && server !== "all") {
          filter += ` AND server = "${server}"`;
        }

        const results = await logsIndex.search("", {
          filter,
          limit: 1000,
          sort: ["timestamp:asc"],
        });

        const systemMetrics = results.hits as any[];
        const useRealData = systemMetrics.length > 0;

        let cpuUsageData: number[] = [];
        let memoryUsageData: number[] = [];
        let diskUsageData: number[] = [];
        let networkData: number[] = [];
        let currentCpuUsage = 0;
        let currentMemoryUsage = 0;
        let maxCpuUsage = 0;
        let maxMemoryUsage = 0;
        let avgCpuUsage = 0;
        let avgMemoryUsage = 0;

        const intervals = 20;
        const intervalMs =
          (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
            timeRangeMs["24h"]) / intervals;

        if (useRealData) {
          // Process real system metrics
          for (let i = 0; i < intervals; i++) {
            const intervalStart = new Date(
              startTime.getTime() + i * intervalMs,
            );
            const intervalEnd = new Date(intervalStart.getTime() + intervalMs);
            const intervalMetrics = systemMetrics.filter((metric) => {
              const metricTime = new Date(metric.timestamp);
              return metricTime >= intervalStart && metricTime < intervalEnd;
            });

            if (intervalMetrics.length > 0) {
              // Average metrics for this interval
              const avgCpu =
                intervalMetrics.reduce(
                  (sum, m) => sum + (m.cpu?.usage || 0),
                  0,
                ) / intervalMetrics.length;
              const avgMem =
                intervalMetrics.reduce(
                  (sum, m) => sum + (m.memory?.usage_percent || 0),
                  0,
                ) / intervalMetrics.length;

              cpuUsageData.push(Math.round(avgCpu * 100) / 100);
              memoryUsageData.push(Math.round(avgMem * 100) / 100);

              // Extract disk and network data if available
              const diskUsage =
                intervalMetrics[0]?.disk?.usage?.["/"]?.usage_percent || 0;
              const networkIn =
                intervalMetrics.reduce((sum, m) => {
                  const interfaces = Object.values(m.network || {});
                  return (
                    sum +
                    interfaces.reduce(
                      (netSum: number, iface: any) =>
                        netSum + (iface.rx_rate_bytes_per_sec || 0),
                      0,
                    )
                  );
                }, 0) / intervalMetrics.length;

              diskUsageData.push(diskUsage);
              networkData.push(Math.round(networkIn / 1024)); // Convert to KB/s
            } else {
              // No data for this interval, push 0
              cpuUsageData.push(0);
              memoryUsageData.push(0);
              diskUsageData.push(0);
              networkData.push(0);
            }
          }

          // Calculate current and aggregate values
          const latestMetric = systemMetrics[systemMetrics.length - 1];
          currentCpuUsage = latestMetric?.cpu?.usage || 0;
          currentMemoryUsage = latestMetric?.memory?.usage_percent || 0;
          maxCpuUsage = Math.max(...cpuUsageData);
          maxMemoryUsage = Math.max(...memoryUsageData);
          avgCpuUsage = Math.round(
            cpuUsageData.reduce((sum, val) => sum + val, 0) /
              cpuUsageData.length,
          );
          avgMemoryUsage = Math.round(
            memoryUsageData.reduce((sum, val) => sum + val, 0) /
              memoryUsageData.length,
          );
        }

        // If no real data, return zeroed values
        if (!useRealData) {
          cpuUsageData = Array(intervals).fill(0);
          memoryUsageData = Array(intervals).fill(0);
          diskUsageData = Array(intervals).fill(0);
          networkData = Array(intervals).fill(0);
          currentCpuUsage = 0;
          currentMemoryUsage = 0;
          maxCpuUsage = 0;
          maxMemoryUsage = 0;
          avgCpuUsage = 0;
          avgMemoryUsage = 0;
        }

        res.json({
          success: true,
          data: {
            // Current values
            currentCpuUsage: Math.round(currentCpuUsage * 100) / 100,
            maxCpuUsage: Math.round(maxCpuUsage * 100) / 100,
            avgCpuUsage: Math.round(avgCpuUsage * 100) / 100,
            currentMemoryUsage: Math.round(currentMemoryUsage * 100) / 100,
            maxMemoryUsage: Math.round(maxMemoryUsage * 100) / 100,
            avgMemoryUsage: Math.round(avgMemoryUsage * 100) / 100,
            // Time series data
            cpuUsageData,
            memoryUsageData,
            diskUsageData,
            networkData,
            // Metadata
            dataSource: useRealData ? "system_metrics" : "none",
            hasRealData: useRealData,
            totalDataPoints: useRealData ? systemMetrics?.length || 0 : 0,
          },
        });
      } catch (error: any) {
        console.error("Error fetching resource metrics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch resource metrics",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  app.get(
    "/api/metrics/alerts",
    authenticateApiKey,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { timeRange = "24h", project } = req.query;

        // Calculate time range
        const now = new Date();
        const timeRangeMs = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "60d": 60 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "180d": 180 * 24 * 60 * 60 * 1000,
          "365d": 365 * 24 * 60 * 60 * 1000,
        };

        const startTime = new Date(
          now.getTime() -
            (timeRangeMs[timeRange as keyof typeof timeRangeMs] ||
              timeRangeMs["24h"]),
        );

        // Log the time range for debugging
        console.log("Time range:", {
          from: startTime.toISOString(),
          to: now.toISOString(),
        });

        // Get the alerts index
        const alertsIndex = client.index(ALERTS_INDEX);

        // Log the index name for debugging
        console.log("Index:", ALERTS_INDEX);

        // Build the filter
        let filter = `timestamp >= "${startTime.toISOString()}" AND acknowledged = false`;

        if (project && project !== "all") {
          filter += ` AND project = "${project}"`;
        }

        // Log the filter for debugging
        console.log("Filter:", filter);

        // Search for active alerts
        const results = await alertsIndex.search("", {
          filter,
          limit: 0, // We only need the count
        });

        // Log the results for debugging
        console.log("Search results:", results);

        const totalActiveAlerts = results.estimatedTotalHits || 0;

        res.json({
          success: true,
          data: {
            totalActiveAlerts,
            timeRange: {
              from: startTime.toISOString(),
              to: now.toISOString(),
            },
          },
        });
      } catch (error: any) {
        console.error("Error fetching active alerts:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch active alerts",
          error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    },
  );

  // Add error handling middleware
  app.use(errorHandler);

  const httpServer: Server = createServer(app);
  return httpServer;
};

export { registerRoutes };
