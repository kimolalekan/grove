import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (identifier: string) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limiter for email notifications
 * Prevents spam and abuse of the email system
 */
export class EmailRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
    };

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if a request should be rate limited
   * @param identifier - Unique identifier (usually email address)
   * @returns true if request is allowed, false if rate limited
   */
  public isAllowed(identifier: string): boolean {
    const key = this.config.keyGenerator(identifier);
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetTime) {
      // First request or window has expired
      this.store.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return true;
    }

    if (entry.count >= this.config.maxRequests) {
      // Rate limit exceeded
      return false;
    }

    // Increment counter
    entry.count++;
    this.store.set(key, entry);
    return true;
  }

  /**
   * Get current usage stats for an identifier
   * @param identifier - Unique identifier
   * @returns usage stats or null if no data
   */
  public getUsage(identifier: string): {
    count: number;
    remaining: number;
    resetTime: number;
    resetIn: number;
  } | null {
    const key = this.config.keyGenerator(identifier);
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || now >= entry.resetTime) {
      return {
        count: 0,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        resetIn: this.config.windowMs,
      };
    }

    return {
      count: entry.count,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      resetIn: entry.resetTime - now,
    };
  }

  /**
   * Reset rate limit for a specific identifier
   * @param identifier - Unique identifier to reset
   */
  public reset(identifier: string): void {
    const key = this.config.keyGenerator(identifier);
    this.store.delete(key);
  }

  /**
   * Get all current rate limit entries (for debugging)
   */
  public getAll(): Array<{ key: string; count: number; resetTime: number }> {
    const entries: Array<{ key: string; count: number; resetTime: number }> =
      [];

    this.store.forEach((entry, key) => {
      entries.push({
        key,
        count: entry.count,
        resetTime: entry.resetTime,
      });
    });

    return entries;
  }

  /**
   * Clear all rate limit data
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.store.forEach((entry, key) => {
      if (now >= entry.resetTime) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.store.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.debug(
        `Rate limiter cleanup: removed ${keysToDelete.length} expired entries`,
      );
    }
  }

  /**
   * Default key generator - creates a hash of the identifier
   */
  private defaultKeyGenerator(identifier: string): string {
    return createHash("sha256").update(identifier).digest("hex");
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Predefined rate limit configurations
 */
export const EMAIL_RATE_LIMITS = {
  // Per recipient limits
  PER_RECIPIENT: {
    maxRequests: 10, // 10 emails per recipient
    windowMs: 5 * 60 * 1000, // per 5 minutes
  },

  // Per alert limits (same alert to same recipient)
  PER_ALERT_RECIPIENT: {
    maxRequests: 1, // 1 email per alert per recipient
    windowMs: 60 * 60 * 1000, // per hour
  },

  // Global system limits
  SYSTEM_WIDE: {
    maxRequests: 100, // 100 emails total
    windowMs: 60 * 60 * 1000, // per hour
  },

  // Test email limits
  TEST_EMAIL: {
    maxRequests: 5, // 5 test emails
    windowMs: 10 * 60 * 1000, // per 10 minutes
  },
} as const;

/**
 * Multi-tier rate limiter for comprehensive email rate limiting
 */
export class EmailRateLimiterService {
  private perRecipientLimiter: EmailRateLimiter;
  private perAlertRecipientLimiter: EmailRateLimiter;
  private systemWideLimiter: EmailRateLimiter;
  private testEmailLimiter: EmailRateLimiter;

  constructor() {
    this.perRecipientLimiter = new EmailRateLimiter(
      EMAIL_RATE_LIMITS.PER_RECIPIENT,
    );

    this.perAlertRecipientLimiter = new EmailRateLimiter({
      ...EMAIL_RATE_LIMITS.PER_ALERT_RECIPIENT,
      keyGenerator: (identifier: string) => {
        // identifier format: "alertId:recipient"
        return createHash("sha256").update(identifier).digest("hex");
      },
    });

    this.systemWideLimiter = new EmailRateLimiter({
      ...EMAIL_RATE_LIMITS.SYSTEM_WIDE,
      keyGenerator: () => "system", // Same key for all requests
    });

    this.testEmailLimiter = new EmailRateLimiter(EMAIL_RATE_LIMITS.TEST_EMAIL);
  }

  /**
   * Check if an email can be sent based on all rate limiting rules
   * @param recipient - Email recipient
   * @param alertId - Optional alert ID for alert-specific limiting
   * @param isTestEmail - Whether this is a test email
   * @returns Object with allowed status and reason if denied
   */
  public canSendEmail(
    recipient: string,
    alertId?: string,
    isTestEmail: boolean = false,
  ): {
    allowed: boolean;
    reason?: string;
    usage?: ReturnType<EmailRateLimiter["getUsage"]>;
  } {
    // Check system-wide limit first
    if (!this.systemWideLimiter.isAllowed("system")) {
      return {
        allowed: false,
        reason: "System-wide email rate limit exceeded",
        usage: this.systemWideLimiter.getUsage("system"),
      };
    }

    // Check test email limits
    if (isTestEmail && !this.testEmailLimiter.isAllowed(recipient)) {
      return {
        allowed: false,
        reason: "Test email rate limit exceeded",
        usage: this.testEmailLimiter.getUsage(recipient),
      };
    }

    // Check per-recipient limit
    if (!this.perRecipientLimiter.isAllowed(recipient)) {
      return {
        allowed: false,
        reason: "Per-recipient rate limit exceeded",
        usage: this.perRecipientLimiter.getUsage(recipient),
      };
    }

    // Check per-alert-recipient limit if alertId is provided
    if (alertId) {
      const alertRecipientKey = `${alertId}:${recipient}`;
      if (!this.perAlertRecipientLimiter.isAllowed(alertRecipientKey)) {
        return {
          allowed: false,
          reason: "Already sent email for this alert to this recipient",
          usage: this.perAlertRecipientLimiter.getUsage(alertRecipientKey),
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get comprehensive usage statistics
   * @param recipient - Email recipient
   * @param alertId - Optional alert ID
   */
  public getUsageStats(recipient: string, alertId?: string) {
    const stats = {
      perRecipient: this.perRecipientLimiter.getUsage(recipient),
      systemWide: this.systemWideLimiter.getUsage("system"),
      testEmail: this.testEmailLimiter.getUsage(recipient),
      perAlertRecipient: alertId
        ? this.perAlertRecipientLimiter.getUsage(`${alertId}:${recipient}`)
        : null,
    };

    return stats;
  }

  /**
   * Reset all rate limits for a recipient
   * @param recipient - Email recipient
   */
  public resetRecipient(recipient: string): void {
    this.perRecipientLimiter.reset(recipient);
    this.testEmailLimiter.reset(recipient);
  }

  /**
   * Reset system-wide rate limits (admin function)
   */
  public resetSystemWide(): void {
    this.systemWideLimiter.reset("system");
  }

  /**
   * Get all current rate limit data for monitoring
   */
  public getAllUsage() {
    return {
      perRecipient: this.perRecipientLimiter.getAll(),
      perAlertRecipient: this.perAlertRecipientLimiter.getAll(),
      systemWide: this.systemWideLimiter.getAll(),
      testEmail: this.testEmailLimiter.getAll(),
    };
  }

  /**
   * Clear all rate limit data
   */
  public clearAll(): void {
    this.perRecipientLimiter.clear();
    this.perAlertRecipientLimiter.clear();
    this.systemWideLimiter.clear();
    this.testEmailLimiter.clear();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.perRecipientLimiter.destroy();
    this.perAlertRecipientLimiter.destroy();
    this.systemWideLimiter.destroy();
    this.testEmailLimiter.destroy();
  }
}

// Singleton instance
let rateLimiterInstance: EmailRateLimiterService | null = null;

/**
 * Get the singleton rate limiter instance
 */
export function getEmailRateLimiter(): EmailRateLimiterService {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new EmailRateLimiterService();
  }
  return rateLimiterInstance;
}

/**
 * Express middleware for rate limiting API endpoints
 */
export function createRateLimitMiddleware(
  limiter: EmailRateLimiter,
  identifier: (req: Request) => string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = identifier(req);

    if (!limiter.isAllowed(id)) {
      const usage = limiter.getUsage(id);
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: "Too many requests. Please try again later.",
        usage,
      });
    }

    next();
  };
}
