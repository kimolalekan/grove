import { createEmailService } from "./emailService";
import { getEmailRateLimiter } from "../utils/rateLimiter";
import { db } from "../db";
import { alerts, emailLogs } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  status: "active" | "acknowledged" | "resolved";
  source: string;
  metadata: Record<string, any>;
  acknowledgedBy?: string | null;
  acknowledgedAt?: Date | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  timestamp: number;
  acknowledged?: boolean | null;
}

interface CreateAlertOptions {
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  source: string;
  metadata?: Record<string, any>;
  sendEmail?: boolean;
  emailRecipients?: string[];
}

interface EmailLog {
  id: string;
  alert_id: string | null;
  recipient: string;
  subject: string;
  status: "sent" | "failed" | "pending";
  error_message?: string | null;
  sent_at?: Date | null;
  created_at: Date;
}

interface AlertServiceConfig {
  defaultEmailRecipients?: string[];
}

export class AlertService {
  private emailService: ReturnType<typeof createEmailService>;
  private defaultEmailRecipients: string[];
  private rateLimiter = getEmailRateLimiter();

  constructor(config: AlertServiceConfig = {}) {
    this.emailService = createEmailService();
    this.defaultEmailRecipients = config.defaultEmailRecipients || [];
  }

  async createAlert(options: CreateAlertOptions): Promise<Alert> {
    try {
      const now = new Date();
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newAlertData = {
        id: alertId,
        title: options.title,
        message: options.message,
        severity: options.severity,
        source: options.source,
        status: "active" as const,
        metadata: options.metadata || {},
        createdAt: now,
        updatedAt: now,
        timestamp: now.getTime(),
        acknowledged: false,
      };

      await db.insert(alerts).values(newAlertData);

      console.log(`Alert created: ${newAlertData.id} - ${newAlertData.title}`);

      const alertResponse: Alert = {
        ...newAlertData,
      };

      // Send email notification if requested and email service is available
      if (options.sendEmail !== false && this.emailService) {
        const recipients =
          options.emailRecipients || this.defaultEmailRecipients;
        if (recipients.length > 0) {
          await this.sendAlertEmail(alertResponse, recipients);
        }
      }

      return alertResponse;
    } catch (error) {
      console.error("Failed to create alert:", error);
      throw new Error(
        `Failed to create alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async sendAlertEmail(alert: Alert, recipients: string[]): Promise<void> {
    if (!this.emailService) {
      console.warn("Email service not available, skipping email notification");
      return;
    }

    try {
      // Use default template based on severity
      const template = this.getDefaultTemplate(alert.severity);

      // Send email to each recipient
      for (const recipient of recipients) {
        // Check rate limiting
        const rateLimitCheck = this.rateLimiter.canSendEmail(
          recipient,
          alert.id,
          false,
        );

        if (!rateLimitCheck.allowed) {
          console.warn(
            `Rate limit exceeded for ${recipient}: ${rateLimitCheck.reason}`,
          );

          // Log rate limit failure
          const logId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(emailLogs).values({
            id: logId,
            alertId: alert.id,
            recipient,
            subject: this.renderTemplate(template.subject, alert),
            status: "failed",
            errorMessage: `Rate limit exceeded: ${rateLimitCheck.reason}`,
            createdAt: new Date(),
          });
          continue;
        }

        const emailResult = await this.emailService.sendAlertEmail(
          alert,
          template,
          [recipient],
        );

        // Log email attempt
        const logId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(emailLogs).values({
          id: logId,
          alertId: alert.id,
          recipient,
          subject: this.renderTemplate(template.subject, alert),
          status: emailResult.success ? "sent" : "failed",
          errorMessage: emailResult.error || null,
          sentAt: emailResult.success ? new Date() : null,
          createdAt: new Date(),
        });

        if (emailResult.success) {
          console.log(`Alert email sent to ${recipient} for alert ${alert.id}`);
        } else {
          console.error(
            `Failed to send alert email to ${recipient}:`,
            emailResult.error,
          );
        }
      }
    } catch (error) {
      console.error("Error sending alert emails:", error);
    }
  }

  private getDefaultTemplate(severity: string) {
    const templates = {
      critical: {
        id: "default_critical",
        name: "Critical Alert",
        type: "alert_critical",
        subject: "🚨 CRITICAL ALERT: {{alert.title}}",
        html_body: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Critical Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; }
        .alert-info { background: white; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0; }
        .footer { background: #374151; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .severity { font-weight: bold; text-transform: uppercase; color: #dc2626; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Critical Alert</h1>
        </div>
        <div class="content">
            <div class="alert-info">
                <h2>{{alert.title}}</h2>
                <p><strong>Severity:</strong> <span class="severity">{{alert.severity}}</span></p>
                <p><strong>Source:</strong> {{alert.source}}</p>
                <p><strong>Time:</strong> {{alert.created_at}}</p>
                <div>
                    <strong>Message:</strong>
                    <p>{{alert.message}}</p>
                </div>
            </div>
            <p>This is a critical alert that requires immediate attention. Please investigate and take appropriate action.</p>
        </div>
        <div class="footer">
            Grove Alert System - {{datetime}}
        </div>
    </div>
</body>
</html>`,
        text_body: `CRITICAL ALERT: {{alert.title}}

Severity: {{alert.severity}}
Source: {{alert.source}}
Time: {{alert.created_at}}

Message:
{{alert.message}}

This is a critical alert that requires immediate attention.

Grove Alert System - {{datetime}}`,
        variables: [
          "alert.title",
          "alert.message",
          "alert.severity",
          "alert.source",
          "alert.created_at",
          "datetime",
        ],
      },
      warning: {
        id: "default_warning",
        name: "Warning Alert",
        type: "alert_warning",
        subject: "⚠️ WARNING: {{alert.title}}",
        html_body: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Warning Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; }
        .alert-info { background: white; padding: 15px; border-left: 4px solid #f59e0b; margin: 15px 0; }
        .footer { background: #374151; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .severity { font-weight: bold; text-transform: uppercase; color: #f59e0b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Warning Alert</h1>
        </div>
        <div class="content">
            <div class="alert-info">
                <h2>{{alert.title}}</h2>
                <p><strong>Severity:</strong> <span class="severity">{{alert.severity}}</span></p>
                <p><strong>Source:</strong> {{alert.source}}</p>
                <p><strong>Time:</strong> {{alert.created_at}}</p>
                <div>
                    <strong>Message:</strong>
                    <p>{{alert.message}}</p>
                </div>
            </div>
            <p>This is a warning alert. Please review and take action if necessary.</p>
        </div>
        <div class="footer">
            Grove Alert System - {{datetime}}
        </div>
    </div>
</body>
</html>`,
        text_body: `WARNING: {{alert.title}}

Severity: {{alert.severity}}
Source: {{alert.source}}
Time: {{alert.created_at}}

Message:
{{alert.message}}

This is a warning alert. Please review and take action if necessary.

Grove Alert System - {{datetime}}`,
        variables: [
          "alert.title",
          "alert.message",
          "alert.severity",
          "alert.source",
          "alert.created_at",
          "datetime",
        ],
      },
      info: {
        id: "default_info",
        name: "Info Alert",
        type: "alert_info",
        subject: "ℹ️ INFO: {{alert.title}}",
        html_body: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Info Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; }
        .alert-info { background: white; padding: 15px; border-left: 4px solid #2563eb; margin: 15px 0; }
        .footer { background: #374151; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .severity { font-weight: bold; text-transform: uppercase; color: #2563eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ℹ️ Information Alert</h1>
        </div>
        <div class="content">
            <div class="alert-info">
                <h2>{{alert.title}}</h2>
                <p><strong>Severity:</strong> <span class="severity">{{alert.severity}}</span></p>
                <p><strong>Source:</strong> {{alert.source}}</p>
                <p><strong>Time:</strong> {{alert.created_at}}</p>
                <div>
                    <strong>Message:</strong>
                    <p>{{alert.message}}</p>
                </div>
            </div>
            <p>This is an informational alert for your awareness.</p>
        </div>
        <div class="footer">
            Grove Alert System - {{datetime}}
        </div>
    </div>
</body>
</html>`,
        text_body: `INFO: {{alert.title}}

Severity: {{alert.severity}}
Source: {{alert.source}}
Time: {{alert.created_at}}

Message:
{{alert.message}}

This is an informational alert for your awareness.

Grove Alert System - {{datetime}}`,
        variables: [
          "alert.title",
          "alert.message",
          "alert.severity",
          "alert.source",
          "alert.created_at",
          "datetime",
        ],
      },
    };

    return templates[severity as keyof typeof templates] || templates.info;
  }

  private renderTemplate(template: string, alert: Alert): string {
    let rendered = template;

    // Replace alert variables
    rendered = rendered.replace(/\{\{alert\.title\}\}/g, alert.title);
    rendered = rendered.replace(/\{\{alert\.message\}\}/g, alert.message);
    rendered = rendered.replace(/\{\{alert\.severity\}\}/g, alert.severity);
    rendered = rendered.replace(/\{\{alert\.source\}\}/g, alert.source);
    rendered = rendered.replace(
      /\{\{alert\.created_at\}\}/g,
      alert.createdAt.toISOString(),
    );
    rendered = rendered.replace(/\{\{alert\.id\}\}/g, alert.id);

    // Replace datetime variables
    rendered = rendered.replace(/\{\{datetime\}\}/g, new Date().toISOString());
    rendered = rendered.replace(
      /\{\{date\}\}/g,
      new Date().toLocaleDateString(),
    );
    rendered = rendered.replace(
      /\{\{time\}\}/g,
      new Date().toLocaleTimeString(),
    );

    return rendered;
  }

  async getAlerts(filters?: {
    search?: string;
    severity?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      const {
        search,
        severity,
        status,
        limit = 50,
        offset = 0,
      } = filters || {};

      const whereConditions = [];

      if (severity) {
        whereConditions.push(eq(alerts.severity, severity));
      }
      if (status) {
        whereConditions.push(eq(alerts.status, status));
      }

      if (search) {
        whereConditions.push(
          sql`(${alerts.title} ILIKE ${`%${search}%`} OR ${alerts.message} ILIKE ${`%${search}%`})`,
        );
      }

      const results = await db
        .select()
        .from(alerts)
        .where(and(...whereConditions))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(alerts.createdAt));

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(alerts)
        .where(and(...whereConditions));

      const total = Number(countResult[0]?.count) || 0;

      const data: Alert[] = results.map((r) => ({
        ...r,
        metadata: r.metadata as Record<string, any>,
        status: r.status as "active" | "acknowledged" | "resolved",
        severity: r.severity as "critical" | "warning" | "info",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return {
        data,
        total,
      };
    } catch (error) {
      console.error("Failed to get alerts:", error);
      throw new Error(
        `Failed to get alerts: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getAlertById(alertId: string): Promise<Alert | null> {
    try {
      const result = await db
        .select()
        .from(alerts)
        .where(eq(alerts.id, alertId))
        .limit(1);

      if (result.length === 0) return null;

      const r = result[0];
      return {
        ...r,
        metadata: r.metadata as Record<string, any>,
        status: r.status as "active" | "acknowledged" | "resolved",
        severity: r.severity as "critical" | "warning" | "info",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    } catch (error) {
      console.error("Failed to get alert by ID:", error);
      throw new Error(
        `Failed to get alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string,
  ): Promise<Alert> {
    try {
      const now = new Date();
      const result = await db
        .update(alerts)
        .set({
          status: "acknowledged",
          acknowledgedBy,
          acknowledgedAt: now,
          updatedAt: now,
          acknowledged: true,
        })
        .where(eq(alerts.id, alertId))
        .returning();

      if (result.length === 0) {
        throw new Error("Alert not found");
      }

      console.log(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);

      const r = result[0];
      return {
        ...r,
        metadata: r.metadata as Record<string, any>,
        status: r.status as "active" | "acknowledged" | "resolved",
        severity: r.severity as "critical" | "warning" | "info",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    } catch (error) {
      console.error("Failed to acknowledge alert:", error);
      throw new Error(
        `Failed to acknowledge alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async resolveAlert(alertId: string): Promise<Alert> {
    try {
      const now = new Date();
      const result = await db
        .update(alerts)
        .set({
          status: "resolved",
          resolvedAt: now,
          updatedAt: now,
          acknowledged: true, // Auto acknowledge on resolve for consistency
        })
        .where(eq(alerts.id, alertId))
        .returning();

      if (result.length === 0) {
        throw new Error("Alert not found");
      }

      const updatedAlert = result[0];

      const mappedAlert: Alert = {
        ...updatedAlert,
        metadata: updatedAlert.metadata as Record<string, any>,
        status: updatedAlert.status as "active" | "acknowledged" | "resolved",
        severity: updatedAlert.severity as "critical" | "warning" | "info",
        createdAt: updatedAlert.createdAt,
        updatedAt: updatedAlert.updatedAt,
      };

      console.log(`Alert resolved: ${alertId}`);

      // Send resolution email if email service is available
      if (this.emailService && this.defaultEmailRecipients.length > 0) {
        await this.sendAlertResolvedEmail(
          mappedAlert,
          this.defaultEmailRecipients,
        );
      }

      return mappedAlert;
    } catch (error) {
      console.error("Failed to resolve alert:", error);
      throw new Error(
        `Failed to resolve alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async sendAlertResolvedEmail(
    alert: Alert,
    recipients: string[],
  ): Promise<void> {
    if (!this.emailService) return;

    try {
      const template = {
        id: "default_resolved",
        name: "Alert Resolved",
        type: "alert_resolved",
        subject: "✅ RESOLVED: {{alert.title}}",
        html_body: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alert Resolved</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #16a34a; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; }
        .alert-info { background: white; padding: 15px; border-left: 4px solid #16a34a; margin: 15px 0; }
        .footer { background: #374151; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .severity { font-weight: bold; text-transform: uppercase; color: #16a34a; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Alert Resolved</h1>
        </div>
        <div class="content">
            <div class="alert-info">
                <h2>{{alert.title}}</h2>
                <p><strong>Original Severity:</strong> <span class="severity">{{alert.severity}}</span></p>
                <p><strong>Source:</strong> {{alert.source}}</p>
                <p><strong>Original Time:</strong> {{alert.created_at}}</p>
                <p><strong>Resolved:</strong> {{datetime}}</p>
                <div>
                    <strong>Original Message:</strong>
                    <p>{{alert.message}}</p>
                </div>
            </div>
            <p>This alert has been resolved and no further action is required.</p>
        </div>
        <div class="footer">
            Grove Alert System - {{datetime}}
        </div>
    </div>
</body>
</html>`,
        text_body: `RESOLVED: {{alert.title}}

Original Severity: {{alert.severity}}
Source: {{alert.source}}
Original Time: {{alert.created_at}}
Resolved: {{datetime}}

Original Message:
{{alert.message}}

This alert has been resolved and no further action is required.

Grove Alert System - {{datetime}}`,
        variables: [
          "alert.title",
          "alert.message",
          "alert.severity",
          "alert.source",
          "alert.created_at",
          "datetime",
        ],
      };

      for (const recipient of recipients) {
        const emailResult = await this.emailService.sendAlertEmail(
          alert,
          template,
          [recipient],
        );

        const logId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(emailLogs).values({
          id: logId,
          alertId: alert.id,
          recipient,
          subject: this.renderTemplate(template.subject, alert),
          status: emailResult.success ? "sent" : "failed",
          errorMessage: emailResult.error || null,
          sentAt: emailResult.success ? new Date() : null,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error("Error sending alert resolved emails:", error);
    }
  }

  async deleteAlert(alertId: string): Promise<void> {
    try {
      await db.delete(alerts).where(eq(alerts.id, alertId));
      console.log(`Alert deleted: ${alertId}`);
    } catch (error) {
      console.error("Failed to delete alert:", error);
      throw new Error(
        `Failed to delete alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getEmailLogs(
    alertId?: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<EmailLog[]> {
    try {
      const conditions = [];
      if (alertId) {
        conditions.push(eq(emailLogs.alertId, alertId));
      }

      const results = await db
        .select()
        .from(emailLogs)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(emailLogs.createdAt));

      return results.map((r) => ({
        ...r,
        status: r.status as "sent" | "failed" | "pending",
        created_at: r.createdAt,
        sent_at: r.sentAt,
        alert_id: r.alertId,
      }));
    } catch (error) {
      console.error("Failed to get email logs:", error);
      throw new Error(
        `Failed to get email logs: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getRateLimitStats(): Promise<any> {
    return this.rateLimiter.getAllUsage();
  }

  async resetRateLimit(recipient: string): Promise<void> {
    this.rateLimiter.resetRecipient(recipient);
  }

  async sendTestEmail(
    recipient: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const rateLimitCheck = this.rateLimiter.canSendEmail(
        recipient,
        undefined,
        true,
      );

      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          message: `Test email rate limit exceeded: ${rateLimitCheck.reason}`,
          data: rateLimitCheck.usage,
        };
      }

      if (!this.emailService) {
        return {
          success: false,
          message: "Email service not configured",
        };
      }

      const now = new Date();
      const testAlert: Alert = {
        id: `test_${Date.now()}`,
        title: "Test Email - Grove Alert System",
        message:
          "This is a test email to verify the alert notification system is working correctly.",
        severity: "info",
        status: "active",
        source: "test-system",
        metadata: { test: true, timestamp: Date.now() },
        createdAt: now,
        updatedAt: now,
        timestamp: now.getTime(),
        acknowledged: false,
      };

      const template = this.getDefaultTemplate("info");
      const emailResult = await this.emailService.sendAlertEmail(
        testAlert,
        template,
        [recipient],
      );

      const logId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(emailLogs).values({
        id: logId,
        alertId: testAlert.id,
        recipient,
        subject: this.renderTemplate(template.subject, testAlert),
        status: emailResult.success ? "sent" : "failed",
        errorMessage: emailResult.error || null,
        sentAt: emailResult.success ? new Date() : null,
        createdAt: new Date(),
      });

      return {
        success: emailResult.success,
        message: emailResult.success
          ? `Test email sent to ${recipient}`
          : `Failed to send test email: ${emailResult.error}`,
      };
    } catch (error) {
      console.error("Failed to send test email:", error);
      return {
        success: false,
        message: `Internal error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

export function createAlertService(config?: AlertServiceConfig): AlertService {
  return new AlertService(config);
}

export type { CreateAlertOptions, Alert, EmailLog };
