<div style="text-align: center; margin-bottom: 2rem;">
  <img src="https://raw.githubusercontent.com/kimolalekan/grove/refs/heads/main/assets/grove-wordmark.png" width="400" alt="Grove" />
  <br />
  <a href="https://github.com/kimolalekan/grove/actions/workflows/build.yml">
    <img src="https://github.com/kimolalekan/grove/actions/workflows/build.yml/badge.svg" alt="Build status" />
  </a>
</div>

![Grove dashboard 1](assets/screenshot1.png)

![Grove dashboard 2](assets/screenshot2.png)

![Grove dashboard 3](assets/screenshot3.png)

## Features

- **Metrics dashboard** — Overview (requests/min, error rate, uptime), Performance (response time, throughput), and Resources (CPU, memory, disk, network) with time-range filtering and charts.
- **Log explorer** — Search and filter logs by level, source, project, and time range, with pagination and a detail view showing request metadata (IP, method, path, status code, duration).
- **Alerting** — Define alert rules (metric + condition + threshold), let the built-in monitoring service evaluate them against incoming logs, or trigger them manually via the API. Alerts support acknowledge/resolve workflows.
- **Email notifications** — Alerts are delivered via SMTP (nodemailer) with HTML templates and a multi-tier rate limiter (per-recipient, per-alert, and system-wide) to prevent spam.
- **User management** — Role-based access (`user`, `moderator`, `admin`) with password auth (bcrypt) and session cookies.
- **API key management** — Create, revoke, reactivate, and rotate `sk_`-prefixed API keys used to authenticate log ingestion and API access.
- **Audit logs** — Ingest and review audit events (login, profile changes, loan/financial actions, etc.) with entity-level filtering.
- **Server log collector** — A systemd-managed bash agent (`pipeline/grove.sh`) that parses nginx, Apache, PM2, Uvicorn, and Laravel logs and streams them to the Grove API, plus a system metrics collector (CPU, memory, disk, network).

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm
- PostgreSQL 16+

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the template below to a `.env` file in the project root:

```bash
# Server
NODE_ENV=development
PORT=3211

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/grove

# Client-side public API key (written automatically by the init script)
VITE_PUBLIC_API_KEY=

# Email notifications (SMTP)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
EMAIL_FROM="Grove Alerts <alerts@yourdomain.com>"
EMAIL_RECIPIENTS=admin@company.com,alerts@company.com
TEST_EMAIL=test@company.com

```

> `server/db/index.ts` reads `DATABASE_URL` or `POSTGRES_URL`. The app refuses to start without one.

### 3. Create the database schema

```bash
pnpm drizzle-kit migrate   # applies migrations from /drizzle
# or push the schema directly:
pnpm drizzle-kit push
```

### 4. Initialize defaults and seed data

```bash
# Creates a default admin user + API key, and writes the key into .env
pnpm run seed:init

# Optional: seed sample users, logs, alerts, alert rules, and audit entries
pnpm run seed
```

Default credentials created by the scripts (change these before any real deployment):

| Script      | Email             | Password     | Role  |
| ----------- | ----------------- | ------------ | ----- |
| `seed:init` | `audit@grove.dev` | `Grove12345` | admin |
| `seed`      | `admin@grove.dev` | `Grove12345` | admin |

### 5. Run the dev server

```bash
pnpm dev
```

Open http://localhost:3211 — the Vite dev server is embedded in the Express app (HMR included). Log in with the admin credentials above.

## Scripts

| Script                          | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                      | Run the server + embedded Vite dev server (`server/index.ts`)       |
| `pnpm build`                    | Build the client (Vite) and bundle the server (esbuild) into `dist` |
| `pnpm start`                    | Run the production bundle (`node dist/index.js`)                    |
| `pnpm check` / `pnpm typecheck` | Type-check with `tsc`                                               |
| `pnpm lint`                     | ESLint over the project                                             |
| `pnpm prod`                     | Build and start under PM2 (process name `audit-dashboard`)          |
| `pnpm prod:restart`             | Rebuild and reload the PM2 process                                  |
| `pnpm seed`                     | Seed sample data                                                    |
| `pnpm seed:init`                | Create default admin + API key and update `.env`                    |

## Alert Rules & Email Notifications

Alert rules evaluate incoming log data on an interval. Log-derived metrics include `error_rate`, `error_count`, `log_count`, `avg_response_time`, `max_response_time`, `4xx_rate`, `5xx_rate`, and `unique_errors` (CPU, memory, and disk alerts are available through the manual trigger endpoints instead). Each rule has a condition (e.g. `greater than`, `less_than`, `>=`), a threshold (e.g. `5%`, `1000ms`, `85`), and a notify target.

When a rule fires, the `AlertRuleMonitoringService` creates an alert and — if email is configured — sends a templated message over SMTP via nodemailer. Emails are guarded by a multi-tier in-memory rate limiter:

- 10 emails per recipient per 5 minutes
- 1 email per alert per recipient per hour
- 100 emails system-wide per hour
- 5 test emails per 10 minutes

Rate-limit stats are exposed via `GET /api/alerts/rate-limits` and can be reset via `POST /api/alerts/rate-limits/reset`.

## Log Collector (`pipeline/`)

`grove.sh` is a bash agent meant to run on each server you want to monitor. It tails and parses:

- nginx access logs
- Apache access + error logs
- PM2 process logs
- Uvicorn/FastAPI logs (access, startup, stack traces)
- Laravel `laravel-*.log` files
- System metrics (CPU, memory, disk, network)

Parsed entries are POSTed to `POST /api/logs` (with retries, JSON validation, and local debug logging). To install it as a systemd service on a target server:

```bash
# 1. Copy grove.sh to the server, configure API_URL + API_TOKEN at the top
# 2. Run the installer:
bash pipeline/setup.sh
```

`setup.sh` installs the script to `/etc/grove/grove.sh`, registers the `grove.service` unit, and starts it. See `pipeline/grove.sh` and `pipeline/grove.service` for details.

## Production Deployment

1. **Build** — `pnpm build` produces the client bundle in `dist/public` and the bundled server at `dist/index.js`.
2. **Run** — `pnpm prod` starts it under PM2 as `audit-dashboard`; `pnpm prod:restart` rebuilds and reloads it.
3. **Reverse proxy** — `nginx.conf` provides a sample config proxying port `3211` behind a domain, with WebSocket support (used by Vite HMR in development).

Set `NODE_ENV=production` and point `DATABASE_URL` at your production PostgreSQL. In production the server also applies an IP-based rate limit of 1000 requests per 15 minutes to `/api/*` (see `server/vite.ts`).

## Demo Utilities

- **`example-monitor.js`** — a small endpoint monitor that checks a few public URLs, measures response times, and triggers Grove alerts (`error-rate` / `response-time`) when thresholds are exceeded:
  ```bash
  node example-monitor.js sk_your_api_key
  ```
- **`test-alerts.js`** — exercises the whole alert pipeline: creates test rules, triggers all alert scenarios (error rate, response time, CPU usage, custom metric), and prints a summary:
  ```bash
  node test-alerts.js sk_your_api_key
  ```

> Both scripts default to `http://localhost:3000` — adjust `GROVE_URL`/`BASE_URL` if your server runs on another port (e.g. `3211`).

## License

MIT
