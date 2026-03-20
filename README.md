<p align="center">
  <a href="#">
    <img src="https://raw.githubusercontent.com/kimolalekan/grove/main/assets/grove-wordmark.png">
  </a>
</p>
<div align="center">
[![Build Pipeline](https://github.com/kimolalekan/grove/actions/workflows/build.yml/badge.svg)](https://github.com/kimolalekan/grove/actions/workflows/build.yml)
</div>

![image1](./assets/screenshot1.png)
![image2](./assets/screenshot2.png)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Audit Trails](#audit-trails)
6. [Dashboard Usage](#dashboard-usage)
7. [Troubleshooting](#troubleshooting)
8. [Contributing](#contributing)

---

## Introduction

**Grove** is a modern log management and audit trail dashboard. Originally designed for simple log aggregation, it has evolved into a comprehensive system for tracking system events, administrative actions, and business-specific audits (Loans, Financial States, etc.). It uses **React** for the frontend, **Express** for the backend, and **PostgreSQL** with **Drizzle ORM** for reliable, type-safe data management.

---

## Features

- **Real-time Log Aggregation**: Collect system and application logs from multiple sources.
- **Comprehensive Audit Trails**: Track administrative changes and user activity with detailed context.
- **External Audit Ingestion**: API endpoint to receive and visualize audits from external business systems.
- **Business Entity Visualization**: Dedicated views for tracking events related to `loan`, `financial_state`, `credit_score`, and `user`.
- **Flexible Search & Filtering**: Advanced filtering by action, entity type, user, and source.
- **Modern UI/UX**: Dark theme, interactive charts, and premium dashboard design.

---

## Architecture

- **Frontend**: React (Vite), TanStack Query, Shadcn UI, Lucide Icons.
- **Backend**: Node.js, Express, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM for schema management and migrations.
- **Transportation**: Bash-based log transport scripts for remote log collection.

---

## Installation

### Prerequisites

- Node.js (v20+)
- PostgreSQL (v15+)
- Yarn or NPM

### Steps

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/your-repo/grove.git
   cd grove
   ```

2. **Install Dependencies**:

   ```bash
   yarn install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory:

   ```env
   DATABASE_URL=postgres://user:password@localhost:5432/grove
   VITE_PUBLIC_API_KEY=your_development_key
   ```

4. **Initialize Database**:

   ```bash
   yarn drizzle-kit generate
   yarn drizzle-kit migrate
   yarn seed
   ```

5. **Start Development Server**:
   ```bash
   yarn dev
   ```

---

## Audit Trails

### Internal Auditing

Grove automatically tracks critical internal actions:

- API Key Lifecycle (Created, Revoked, Deleted)
- User Authentication & Profile Updates
- Alert Acknowledgment & Resolution

### External Ingestion API

You can push audits from external systems using a simple POST request:

**Endpoint**: `POST /api/audits/ingest`
**Auth**: Requires a valid ` Grove API Key` in the `Authorization` header.

**Payload Example**:

```json
{
  "action": "LOAN_APPROVED",
  "entityType": "loan",
  "entityId": "loan_8892",
  "userId": "customer_42",
  "details": {
    "amount": 5000,
    "interestRate": 0.05
  }
}
```


You can push logs from external systems using a simple POST request:

**Endpoint**: `POST /api/logs`
**Auth**: Requires a valid ` Grove API Key` in the `Authorization` header.

**Payload Example**:

```json
{
  "project": "Example",
  "source": "example-api",
  "message": "Order item",
  "level": "info",
  "details": {
   "method": "POST",
  "path": "/api/orders",
  "statusCode": 201,
  "duration": 10,
  "ip": "192.168.1.187",
  "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
  "size": "8923B"
  }
}
```

---

## Dashboard Usage

### Accessing the Dashboard

- Open `http://localhost:3211` (default port).

### Navigating Audits

- Click **Audits** in the sidebar to view the global audit trail.
- Use filters for **Action** or **Entity Type** (e.g., `loan`) to find specific events.
- Click the **Eye Icon** on any row to see full JSON metadata and IP address context.

---

## Troubleshooting

### Common Issues

- **Database Connection**: Verify your `DATABASE_URL` is correct and PostgreSQL is accepting connections.
- **Migrations**: If you see "table not found" errors, ensure you've run `yarn drizzle-kit migrate`.
- **API Key Required**: Ensure your frontend has `VITE_PUBLIC_API_KEY` set for development.

---

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request.
