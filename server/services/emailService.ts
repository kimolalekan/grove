import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface EmailTemplate {
  id?: string;
  name: string;
  type: string;
  subject: string;
  html_body: string;
  text_body?: string;
  variables: string[];
}

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  source: string;
  created_at?: string;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface EmailServiceOptions {
  /** SMTP server hostname (SMTP_HOST). */
  host: string;
  /** SMTP server port (SMTP_PORT, e.g. 587 or 465). */
  port: number;
  /** Use TLS when connecting (SMTP_SECURE — true for port 465). */
  secure: boolean;
  /** SMTP username for authentication (SMTP_USER), optional. */
  user?: string;
  /** SMTP password for authentication (SMTP_PASS), optional. */
  pass?: string;
  /** Sender address (e.g. "alerts@yourdomain.com"). */
  from: string;
  /** Optional display name for the sender. */
  fromName?: string;
}

const DEFAULT_SMTP_PORT = 587;

// Parses a "Display Name <address@domain.com>" string into its parts.
// A bare "address@domain.com" works too.
const parseFromAddress = (from: string): { address: string; name: string } => {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from.trim());
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { name: "", address: from.trim() };
};

class EmailService {
  private transporter: Transporter;
  private from: string;
  private fromName: string;

  constructor(options: EmailServiceOptions) {
    this.from = options.from;
    this.fromName = options.fromName || "";

    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth:
        options.user || options.pass
          ? { user: options.user || "", pass: options.pass || "" }
          : undefined,
    });
  }

  async sendEmail(
    options: SendEmailOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const fromAddress = this.fromName
        ? `"${this.fromName}" <${this.from}>`
        : this.from;

      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error("Email sending failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async sendAlertEmail(
    alert: Alert,
    template: EmailTemplate,
    recipients: string[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const subject = this.renderTemplate(template.subject, alert);
      const html = this.renderTemplate(template.html_body, alert);
      const text = template.text_body
        ? this.renderTemplate(template.text_body, alert)
        : undefined;

      return await this.sendEmail({
        to: recipients,
        subject,
        html,
        text,
      });
    } catch (error) {
      console.error("Alert email sending failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to send alert email",
      };
    }
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
      alert.created_at || "",
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

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim();
  }

  async verifyConnection(): Promise<boolean> {
    // Performs a real SMTP connection handshake to check the server is reachable.
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("SMTP connection verification failed:", error);
      return false;
    }
  }
}

// Factory function to create email service instance
export function createEmailService(): EmailService | null {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT), 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const { address: from, name: fromName } = parseFromAddress(
    process.env.EMAIL_FROM || "",
  );

  if (!host) {
    console.warn("Email service not configured. SMTP_HOST is required.");
    return null;
  }

  if (!from) {
    console.warn(
      'Email service sender not configured. Set EMAIL_FROM (e.g. "Grove Alerts <alerts@yourdomain.com>").',
    );
    return null;
  }

  return new EmailService({
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_SMTP_PORT,
    secure,
    user,
    pass,
    from,
    fromName,
  });
}

export { EmailService };
export type { SendEmailOptions, EmailServiceOptions, EmailTemplate, Alert };
