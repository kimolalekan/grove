import { createAlertService } from "./alertService";
import { db } from "../db";
import { logs, alertRules, alertRuleStates } from "../db/schema";
import { eq, and, gt, gte, desc, sql } from "drizzle-orm";

interface LogEntry {
  id: number;
  project: string;
  timestamp: Date;
  source: string;
  message: string;
  level: "info" | "warning" | "error";
  details?: Record<string, any>;
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

interface AlertRuleState {
  ruleId: string;
  lastTriggered: Date | null;
  currentValue: number;
  triggerCount: number;
  windowStart: Date;
  isActive: boolean;
}

interface MonitoringConfig {
  checkIntervalMs?: number;
  windowSizeMs?: number;
}

export class AlertRuleMonitoringService {
  private alertService: ReturnType<typeof createAlertService>;
  private checkInterval: NodeJS.Timeout | null = null;
  private windowSizeMs: number;
  private isMonitoring = false;

  // In-memory state cache for performance
  private ruleStatesCache = new Map<string, AlertRuleState>();
  private lastProcessedLogTimestamp: Date | null = null;

  constructor(config: MonitoringConfig = {}) {
    this.alertService = createAlertService();
    this.windowSizeMs = config.windowSizeMs || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Start monitoring alert rules
   */
  public async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      console.warn("Alert rule monitoring is already running");
      return;
    }

    console.log(
      `🚨 Starting alert rule monitoring (interval: ${intervalMs}ms)`,
    );
    this.isMonitoring = true;

    // Load existing rule states
    await this.loadRuleStatesFromDatabase();

    // Start monitoring loop
    this.checkInterval = setInterval(async () => {
      try {
        await this.processAlertRules();
      } catch (error) {
        console.error("Error in alert rule monitoring loop:", error);
      }
    }, intervalMs);

    // Initial check
    await this.processAlertRules();
  }

  /**
   * Stop monitoring alert rules
   */
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isMonitoring = false;
    console.log("🔴 Alert rule monitoring stopped");
  }

  /**
   * Load existing rule states from database
   */
  private async loadRuleStatesFromDatabase(): Promise<void> {
    try {
      const results = await db.select().from(alertRuleStates);

      for (const row of results) {
        this.ruleStatesCache.set(row.ruleId, {
          ruleId: row.ruleId,
          lastTriggered: row.lastTriggered,
          currentValue: Number(row.currentValue),
          triggerCount: row.triggerCount,
          windowStart: row.windowStart,
          isActive: row.isActive,
        });
      }

      console.log(
        `Loaded ${this.ruleStatesCache.size} rule states from database`,
      );
    } catch (error) {
      console.error("Failed to load rule states from database:", error);
    }
  }

  /**
   * Main processing loop for alert rules
   */
  private async processAlertRules(): Promise<void> {
    try {
      // Get all enabled alert rules
      const enabledRules = await db
        .select()
        .from(alertRules)
        .where(eq(alertRules.enabled, true));

      if (enabledRules.length === 0) {
        return;
      }

      console.log(`Processing ${enabledRules.length} alert rules...`);

      // Get new log entries since last check
      const newLogs = await this.getNewLogEntries();

      // Process each rule
      for (const rule of enabledRules) {
        await this.evaluateRule(rule as AlertRule, newLogs);
      }

      // Update last processed log timestamp if needed
      // Actually calculated inside evaluateRule or handled by getting logs in window
      if (newLogs.length > 0) {
        const latest = newLogs.reduce(
          (prev, curr) =>
            prev.getTime() > curr.timestamp.getTime() ? prev : curr.timestamp,
          new Date(0),
        );
        this.lastProcessedLogTimestamp = latest;
      }
    } catch (error) {
      console.error("Failed to process alert rules:", error);
    }
  }

  /**
   * Get new log entries since last processed timestamp
   */
  private async getNewLogEntries(): Promise<LogEntry[]> {
    try {
      const condition = this.lastProcessedLogTimestamp
        ? gt(logs.timestamp, this.lastProcessedLogTimestamp)
        : undefined;

      const results = await db
        .select()
        .from(logs)
        .where(condition)
        .orderBy(desc(logs.timestamp))
        .limit(1000);

      return results.map((r) => ({
        ...r,
        level: r.level as "info" | "warning" | "error",
        details: r.details as Record<string, any>,
      }));
    } catch (error) {
      console.error("Failed to fetch new log entries:", error);
      return [];
    }
  }

  /**
   * Evaluate a single alert rule against log entries
   */
  private async evaluateRule(
    rule: AlertRule,
    newLogs: LogEntry[],
  ): Promise<void> {
    try {
      const currentValue = await this.calculateMetricValue(rule, newLogs);
      const thresholdValue = this.parseThreshold(rule.threshold);

      // Get or create rule state
      let ruleState = this.getRuleState(rule.id);
      const now = new Date();

      // Update current value
      ruleState.currentValue = currentValue;

      // Check if threshold is exceeded
      const thresholdExceeded = this.evaluateCondition(
        rule.condition,
        currentValue,
        thresholdValue,
      );

      if (thresholdExceeded && !ruleState.isActive) {
        // Trigger alert
        await this.triggerAlert(rule, ruleState, currentValue, thresholdValue);
        ruleState.isActive = true;
        ruleState.lastTriggered = now;
        ruleState.triggerCount++;
      } else if (!thresholdExceeded && ruleState.isActive) {
        // Reset state when condition is no longer met
        ruleState.isActive = false;
      }

      // Update rule state
      this.ruleStatesCache.set(rule.id, ruleState);
      await this.saveRuleState(ruleState);
    } catch (error) {
      console.error(`Failed to evaluate rule ${rule.name}:`, error);
    }
  }

  /**
   * Calculate metric value based on rule configuration
   */
  private async calculateMetricValue(
    rule: AlertRule,
    newLogs: LogEntry[],
  ): Promise<number> {
    const now = Date.now();
    const windowStart = new Date(now - this.windowSizeMs);

    // Combine new logs with recent logs from database to cover the full window
    const recentLogs = await this.getLogsInWindow(windowStart);

    // De-duplicate if needed, though they shouldn't overlap much if lastProcessedLogTimestamp is used
    const allLogs = [...newLogs, ...recentLogs];

    switch (rule.metric.toLowerCase()) {
      case "error_rate":
        return this.calculateErrorRate(allLogs);

      case "error_count":
        return this.calculateErrorCount(allLogs);

      case "log_count":
        return this.calculateLogCount(allLogs);

      case "avg_response_time":
        return this.calculateAverageResponseTime(allLogs);

      case "max_response_time":
        return this.calculateMaxResponseTime(allLogs);

      case "4xx_rate":
        return this.calculate4xxRate(allLogs);

      case "5xx_rate":
        return this.calculate5xxRate(allLogs);

      case "unique_errors":
        return this.calculateUniqueErrors(allLogs);

      default:
        console.warn(`Unknown metric: ${rule.metric}`);
        return 0;
    }
  }

  /**
   * Get logs within a specific time window
   */
  private async getLogsInWindow(windowStart: Date): Promise<LogEntry[]> {
    try {
      const results = await db
        .select()
        .from(logs)
        .where(gte(logs.timestamp, windowStart))
        .limit(5000);

      return results.map((r) => ({
        ...r,
        level: r.level as "info" | "warning" | "error",
        details: r.details as Record<string, any>,
      }));
    } catch (error) {
      console.error("Failed to get logs in window:", error);
      return [];
    }
  }

  // Metric calculation methods
  private calculateErrorRate(logsList: LogEntry[]): number {
    const totalLogs = logsList.length;
    if (totalLogs === 0) return 0;

    const errorLogs = logsList.filter((log) => log.level === "error").length;
    return (errorLogs / totalLogs) * 100;
  }

  private calculateErrorCount(logsList: LogEntry[]): number {
    return logsList.filter((log) => log.level === "error").length;
  }

  private calculateLogCount(logsList: LogEntry[]): number {
    return logsList.length;
  }

  private calculateAverageResponseTime(logsList: LogEntry[]): number {
    const logsWithDuration = logsList.filter((log) => log.details?.duration);
    if (logsWithDuration.length === 0) return 0;

    const totalDuration = logsWithDuration.reduce(
      (sum, log) => sum + (Number(log.details?.duration) || 0),
      0,
    );
    return totalDuration / logsWithDuration.length;
  }

  private calculateMaxResponseTime(logsList: LogEntry[]): number {
    const durations = logsList
      .filter((log) => log.details?.duration)
      .map((log) => Number(log.details!.duration!));

    return durations.length > 0 ? Math.max(...durations) : 0;
  }

  private calculate4xxRate(logsList: LogEntry[]): number {
    const httpLogs = logsList.filter((log) => log.details?.statusCode);
    if (httpLogs.length === 0) return 0;

    const count4xx = httpLogs.filter((log) => {
      const status = Number(log.details?.statusCode);
      return status && status >= 400 && status < 500;
    }).length;

    return (count4xx / httpLogs.length) * 100;
  }

  private calculate5xxRate(logsList: LogEntry[]): number {
    const httpLogs = logsList.filter((log) => log.details?.statusCode);
    if (httpLogs.length === 0) return 0;

    const count5xx = httpLogs.filter((log) => {
      const status = Number(log.details?.statusCode);
      return status && status >= 500 && status < 600;
    }).length;

    return (count5xx / httpLogs.length) * 100;
  }

  private calculateUniqueErrors(logsList: LogEntry[]): number {
    const errorLogs = logsList.filter((log) => log.level === "error");
    const uniqueMessages = new Set(errorLogs.map((log) => log.message));
    return uniqueMessages.size;
  }

  private parseThreshold(threshold: string): number {
    const numericThreshold = parseFloat(threshold.replace(/[^\d.-]/g, ""));
    return isNaN(numericThreshold) ? 0 : numericThreshold;
  }

  private evaluateCondition(
    condition: string,
    currentValue: number,
    threshold: number,
  ): boolean {
    switch (condition.toLowerCase()) {
      case "greater_than":
      case ">":
        return currentValue > threshold;

      case "greater_than_or_equal":
      case ">=":
        return currentValue >= threshold;

      case "less_than":
      case "<":
        return currentValue < threshold;

      case "less_than_or_equal":
      case "<=":
        return currentValue <= threshold;

      case "equal":
      case "==":
        return currentValue === threshold;

      case "not_equal":
      case "!=":
        return currentValue !== threshold;

      default:
        console.warn(`Unknown condition: ${condition}`);
        return false;
    }
  }

  private getRuleState(ruleId: string): AlertRuleState {
    let state = this.ruleStatesCache.get(ruleId);

    if (!state) {
      state = {
        ruleId,
        lastTriggered: null,
        currentValue: 0,
        triggerCount: 0,
        windowStart: new Date(),
        isActive: false,
      };
    }

    return state;
  }

  private async saveRuleState(state: AlertRuleState): Promise<void> {
    try {
      await db
        .insert(alertRuleStates)
        .values({
          ruleId: state.ruleId,
          lastTriggered: state.lastTriggered,
          currentValue: sql`${state.currentValue}`,
          triggerCount: state.triggerCount,
          windowStart: state.windowStart,
          isActive: state.isActive,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: alertRuleStates.ruleId,
          set: {
            lastTriggered: state.lastTriggered,
            currentValue: sql`${state.currentValue}`,
            triggerCount: state.triggerCount,
            isActive: state.isActive,
          },
        });
    } catch (error) {
      console.error("Failed to save rule state:", error);
    }
  }

  private async triggerAlert(
    rule: AlertRule,
    state: AlertRuleState,
    currentValue: number,
    threshold: number,
  ): Promise<void> {
    try {
      const alertTitle = `Alert: ${rule.name}`;
      const alertMessage = this.generateAlertMessage(
        rule,
        currentValue,
        threshold,
      );
      const severity = this.determineSeverity(rule, currentValue, threshold);

      const sendEmail = rule.channel === "email";
      const recipients = this.parseEmailRecipients(rule.notify);

      console.log(`🚨 Triggering alert: ${alertTitle}`);

      await this.alertService.createAlert({
        title: alertTitle,
        message: alertMessage,
        severity,
        source: `alert-rule:${rule.id}`,
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          metric: rule.metric,
          condition: rule.condition,
          threshold: threshold,
          currentValue: currentValue,
          triggerCount: state.triggerCount + 1,
          windowSizeMinutes: this.windowSizeMs / (1000 * 60),
        },
        sendEmail,
        emailRecipients: recipients,
      });
    } catch (error) {
      console.error(`Failed to trigger alert for rule ${rule.name}:`, error);
    }
  }

  private generateAlertMessage(
    rule: AlertRule,
    currentValue: number,
    threshold: number,
  ): string {
    const valueStr =
      rule.metric.includes("rate") || rule.metric.includes("percent")
        ? `${currentValue.toFixed(2)}%`
        : currentValue.toString();

    const thresholdStr =
      rule.metric.includes("rate") || rule.metric.includes("percent")
        ? `${threshold}%`
        : threshold.toString();

    return `Alert rule "${rule.name}" has been triggered.

Metric: ${rule.metric}
Current Value: ${valueStr}
Condition: ${rule.condition}
Threshold: ${thresholdStr}

The ${rule.metric} has ${this.getConditionDescription(rule.condition)} ${thresholdStr}.

Time Window: ${this.windowSizeMs / (1000 * 60)} minutes
Notification: ${rule.notify}`;
  }

  private getConditionDescription(condition: string): string {
    switch (condition.toLowerCase()) {
      case "greater_than":
      case ">":
        return "exceeded";
      case "greater_than_or_equal":
      case ">=":
        return "met or exceeded";
      case "less_than":
      case "<":
        return "fallen below";
      case "less_than_or_equal":
      case "<=":
        return "fallen to or below";
      case "equal":
      case "==":
        return "reached exactly";
      case "not_equal":
      case "!=":
        return "deviated from";
      default:
        return "triggered the condition for";
    }
  }

  private determineSeverity(
    rule: AlertRule,
    currentValue: number,
    threshold: number,
  ): "critical" | "warning" | "info" {
    const ratio = currentValue / threshold;

    if (rule.metric.includes("error") || rule.metric.includes("5xx")) {
      if (ratio >= 3) return "critical";
      if (ratio >= 1.5) return "warning";
      return "info";
    }

    if (rule.metric.includes("response_time")) {
      if (currentValue >= threshold * 2) return "critical";
      if (currentValue >= threshold * 1.5) return "warning";
      return "info";
    }

    if (rule.metric.includes("4xx")) {
      if (ratio >= 2) return "warning";
      return "info";
    }

    if (ratio >= 2) return "critical";
    if (ratio >= 1.5) return "warning";
    return "info";
  }

  private parseEmailRecipients(notify: string): string[] {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = notify.match(emailRegex);
    return matches || [];
  }

  public getMonitoringStats(): {
    isRunning: boolean;
    rulesMonitored: number;
    activeAlerts: number;
    totalTriggers: number;
    lastProcessedLogTimestamp: Date | null;
  } {
    const activeAlerts = Array.from(this.ruleStatesCache.values()).filter(
      (state) => state.isActive,
    ).length;
    const totalTriggers = Array.from(this.ruleStatesCache.values()).reduce(
      (sum, state) => sum + state.triggerCount,
      0,
    );

    return {
      isRunning: this.isMonitoring,
      rulesMonitored: this.ruleStatesCache.size,
      activeAlerts,
      totalTriggers,
      lastProcessedLogTimestamp: this.lastProcessedLogTimestamp,
    };
  }

  public async getRuleStates(): Promise<AlertRuleState[]> {
    return Array.from(this.ruleStatesCache.values());
  }

  public async resetRuleState(ruleId: string): Promise<void> {
    try {
      const state: AlertRuleState = {
        ruleId,
        lastTriggered: null,
        currentValue: 0,
        triggerCount: 0,
        windowStart: new Date(),
        isActive: false,
      };

      this.ruleStatesCache.set(ruleId, state);
      await this.saveRuleState(state);

      console.log(`Rule state reset for rule: ${ruleId}`);
    } catch (error) {
      console.error(`Failed to reset rule state for ${ruleId}:`, error);
      throw error;
    }
  }

  public destroy(): void {
    this.stopMonitoring();
    this.ruleStatesCache.clear();
  }
}

export function createAlertRuleMonitoringService(
  config?: MonitoringConfig,
): AlertRuleMonitoringService {
  return new AlertRuleMonitoringService(config);
}
