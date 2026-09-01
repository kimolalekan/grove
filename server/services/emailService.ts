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
  /** Sender address (e.g. "alerts@yourdomain.com"). */
  from: string;
  /** Optional display name for the sender. */
  fromName?: string;
  /** ZeptoMail API endpoint (ZEPTOMAIL_API_URL). */
  apiUrl: string;
  /** ZeptoMail API key used as the Authorization header (ZEPTOMAIL_API_KEY). */
  apiKey: string;
}

const DEFAULT_ZEPTOMAIL_API_URL = "https://api.zeptomail.com/v1.1/email";

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
  private apiUrl: string;
  private apiKey: string;
  private from: string;
  private fromName: string;

  constructor(options: EmailServiceOptions) {
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.fromName = options.fromName || "";
  }

  async sendEmail(
    options: SendEmailOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: {
            address: this.from,
            name: this.fromName,
          },
          to: recipients.map((address) => ({
            email_address: { address, name: "" },
          })),
          subject: options.subject,
          htmlbody: options.html,
          textbody: options.text || this.htmlToText(options.html),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Zeptomail API error (${response.status}): ${errorBody}`,
        );
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data?.message_id || `zeptomail-${Date.now()}`,
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
    // ZeptoMail has no lightweight health-check endpoint; the presence of a
    // configured API key and sender address is treated as "connected".
    return Boolean(this.apiUrl && this.apiKey && this.from);
  }
}

// Factory function to create email service instance
export function createEmailService(): EmailService | null {
  const apiUrl = process.env.ZEPTOMAIL_API_URL || DEFAULT_ZEPTOMAIL_API_URL;
  const apiKey = process.env.ZEPTOMAIL_API_KEY;
  const { address: from, name: fromName } = parseFromAddress(
    process.env.ZEPTOMAIL_FROM || process.env.EMAIL_FROM || "",
  );

  if (!apiKey) {
    console.warn(
      "Email service not configured. ZEPTOMAIL_API_KEY is required.",
    );
    return null;
  }

  if (!from) {
    console.warn(
      'Email service sender not configured. Set ZEPTOMAIL_FROM (e.g. "Grove Alerts <alerts@yourdomain.com>").',
    );
    return null;
  }

  return new EmailService({ from, fromName, apiUrl, apiKey });
}

export { EmailService };
export type { SendEmailOptions, EmailServiceOptions, EmailTemplate, Alert };
