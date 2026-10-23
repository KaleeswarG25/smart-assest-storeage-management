# System Architecture Specification

## 1. Executive Summary & Project Overview

The **Cloud-Based IT Asset Lifecycle and Software License Management System** is an enterprise-grade administrative platform designed for small-to-medium enterprises (SMEs) and institutional IT departments. The system replaces error-prone spreadsheets with a centralized, auditable, and automated web solution that manages hardware assets across their entire lifecycle (procurement, assignment, maintenance, retirement) and monitors software licenses, allocations, compliance, and renewal deadlines.

This project is developed as a final-year Computer Science Capstone in **Cloud Computing**. It strictly adheres to a **controlled, modular development lifecycle** with an uncompromised **₹0 budget constraint**.

---

## 2. High-Level Architecture Overview

The system is architected across two distinct stages:
1. **Stage A: Local Development & Verification Environment** (Zero cloud footprint, self-contained, lightweight, fast feedback loop).
2. **Stage B: Cloud Deployment Target on AWS** (Subject to strict cost verification, account eligibility audits, and explicit authorization).

```
========================================================================================
STAGE A: LOCAL ARCHITECTURE (DEVELOPMENT & DEMONSTRATION)
========================================================================================

   +------------------------+
   |   React + Vite SPA     |  (Client Browser: http://localhost:5173)
   |  (Responsive Admin UI) |
   +-----------+------------+
               |
               | HTTP REST API (JSON)
               v
   +------------------------+
   |    Express.js Server   |  (Node.js Runtime: http://localhost:5000)
   |  - Auth & JWT Guard    |
   |  - Controllers         |
   |  - Domain Services     |
   |  - Repository Layer    |
   +-----------+------------+
               |
               | Parameterized SQL Queries (node:sqlite / sqlite3)
               v
   +------------------------+
   |  Local SQLite Database |  (data/asset_management.db - Zero cost, local disk)
   +------------------------+


========================================================================================
STAGE B: PROVISIONAL AWS CLOUD ARCHITECTURE (PENDING ELIGIBILITY AUDIT)
========================================================================================

   +------------------------------------+
   |   Amazon S3 + CloudFront / Amplify |  (Static Web Hosting / CDN)
   |       React Production Build       |
   +-----------------+------------------+
                     |
                     | HTTPS REST API (JSON)
                     v
   +------------------------------------+
   |           AWS App Runner           |  (Fully Managed Containerized Node.js Web Service)
   |     Express.js API Application     |
   |   (Stateless Container Instances)  |
   +--------+------------------+--------+
            |                  |
            | SQL Connection   | S3 SDK (Upload/Download)
            v                  v
   +-----------------+   +-----------------------------------+
   |   Amazon RDS    |   |             Amazon S3             |
   |  (PostgreSQL)   |   | (Asset Invoices, Warranties, Docs)|
   | Multi-AZ: None  |   +-----------------------------------+
   | db.t3/t4g.micro |
   +-----------------+
            ^
            | Monitored via
   +-----------------+
   | AWS CloudWatch  | (Health metrics, error logs, alarms at ₹0.01 threshold)
   +-----------------+
```

---

## 3. Stage A: Local Development Architecture

### 3.1 Technology Stack Rationale
- **Frontend**: **React 18 / 19 with Vite**. Fast HMR (Hot Module Replacement), modern ES module bundling, clean component tree.
- **Backend**: **Node.js (LTS v22) with Express.js**. Lightweight, industry-standard, unopinionated routing engine that mirrors cloud container environments.
- **Database**: **SQLite 3**. File-based relational database. No external database server or Docker daemon required. Perfect for development, unit testing, and offline defense viva demonstrations.
- **Communication Protocol**: Standard RESTful JSON endpoints over HTTP, accompanied by standardized HTTP status codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `500 Internal Server Error`).

### 3.2 Layered Backend Architecture (Separation of Concerns)
To guarantee database portability (transitioning from SQLite locally to PostgreSQL on AWS without rewriting business logic), the backend implements a strict 4-layer architecture:

```
[ HTTP Request ]
       |
       v
1. ROUTES LAYER (`/routes`)
   - Maps URL paths and HTTP verbs to controller actions
   - Attaches authentication/authorization middleware (`verifyToken`, `requireAdmin`)
   - Attaches request schema validation middleware (`validateAssetPayload`)
       |
       v
2. CONTROLLERS LAYER (`/controllers`)
   - Unpacks request parameters, query strings, and body
   - Calls the relevant Service functions
   - Formats uniform JSON responses: `{ success: true, data: ... }` or `{ success: false, error: ... }`
       |
       v
3. SERVICES / DOMAIN LOGIC LAYER (`/services`)
   - Pure business logic and workflow orchestration
   - Business rule enforcement:
     * Prevent assigning assets that are already "Assigned" or "Retired".
     * Prevent software license allocated quantity from exceeding total purchased seats.
     * Enforce status transition matrices (e.g., Available -> Assigned -> Maintenance -> Retired).
     * Calculate renewal urgency and 30-day expiry windows.
       |
       v
4. REPOSITORY / DATA ACCESS LAYER (`/repositories` & `/database`)
   - Houses all SQL execution and queries.
   - All SQL uses strict parameterized queries (prevention of SQL injection).
   - Abstracts dialect differences: isolates SQLite-specific functions so a PostgreSQL adapter can be swapped in via environment variable (`DB_CLIENT=sqlite` vs `DB_CLIENT=postgres`).
       |
       v
[ Database Engine (SQLite / PostgreSQL) ]
```

### 3.3 Layered Frontend Architecture (`frontend/`)
Module 3 establishes a clean, decoupled Single Page Application (SPA) using React 19 and Vite:

1. **API Client Layer (`src/api/`)**: Centralized `apiClient` using the native Fetch API. Configured with `credentials: 'include'` for secure `HttpOnly` cookie transfer. Handles network failures, parses standard error responses, and dispatches 401 unauthorized notifications without leaking sensitive tokens in browser code.
2. **Authentication Context (`src/context/`)**: `AuthContext` verifies session state on application mount by invoking `GET /api/auth/me`. Retains user profile metadata in memory without local/session storage persistence, strictly respecting server-side session truth.
3. **Protected Route Guards (`src/routes/`)**: `ProtectedRoute` checks authentication status, displays a fullscreen loading state during session resolution, and safely redirects unauthenticated visitors to `/login` preserving intended destination URLs.
4. **Enterprise Layout (`src/layouts/`)**: `MainLayout` provides an accessible, responsive sidebar navigation (deep slate `#0f172a`), active link indication, live backend health monitoring (`/api/health`), and an authenticated administrator greeting banner.
5. **Honest Staged Views (`src/pages/`)**: Dashboard renders real system health metrics alongside honest "Pending Module" states for unstaged business entities, rejecting fabricated or mock charts until backend CRUD endpoints are authorized.

---

## 4. Stage B: Provisional AWS Cloud Architecture

### 4.1 Candidate AWS Services
1. **AWS App Runner**:
   - *Role*: Managed container execution for the Node.js Express backend.
   - *Advantage*: No EC2 server management, automated HTTPS termination, zero Kubernetes overhead, automatic health checks.
   - *Provisional status*: Subject to cost verification (see Section 5 and `docs/COST_AND_DEPLOYMENT.md`).
2. **Amazon RDS (PostgreSQL)**:
   - *Role*: Managed ACID-compliant relational database.
   - *Advantage*: Automated backups, maintenance windows, native relational integrity.
   - *Provisional status*: Dependent on active 12-month Free Tier eligibility (db.t3.micro or db.t4g.micro).
3. **Amazon S3 (Simple Storage Service)**:
   - *Role*: Object store for optional document attachments (vendor invoices, warranty proof PDFs, hardware spec sheets).
   - *Advantage*: Durable, signed URL access, decoupled from web server filesystem.
4. **Frontend Hosting (AWS Amplify Hosting or S3 + CloudFront)**:
   - *Role*: Serving the static Vite build artifacts (`index.html`, JavaScript chunks, CSS bundles).
5. **Amazon CloudWatch**:
   - *Role*: Centralized logging for Express API container streams, request latency metrics, and billing alarms.
6. **Scheduled License Expiry Audits**:
   - *Role*: Daily cron execution to evaluate software license expiration dates and flag assets with expiring warranties.
   - *Architectural option*: Internal lightweight Node.js scheduler (e.g. `node-cron`) or Amazon EventBridge trigger calling a secured internal webhook.

---

## 5. The Ephemeral Container Reality: Why SQLite is Development-Only

A critical concept for cloud architects and students defending this project in a viva examination:

> **Fundamental Principle:** Modern cloud container platforms (such as AWS App Runner, AWS Fargate, and Google Cloud Run) operate on **ephemeral (stateless) filesystems**.

### Why SQLite cannot be copied into an App Runner container for production:
1. **Ephemeral Lifecycles**: When App Runner scales up, scales down, restarts during deployment, or experiences an instance crash, the container disk is wiped completely and replaced with a fresh image. Any SQLite `.db` file modified during execution would be permanently lost.
2. **Horizontal Scaling Hazards**: If App Runner launches 2 or more container instances to handle web traffic, each instance would possess its own local SQLite file. Instance A would not see data created on Instance B, resulting in data divergence, inconsistency, and database file locking errors over network volumes.
3. **Conclusion**: SQLite is strictly a **local development, testing, and offline demonstration database**. Cloud production demands a standalone, managed network-accessible database service such as Amazon RDS (PostgreSQL) or a managed cloud database.

---

## 6. Budget Risks & Cost Traps Analysis (The ₹0 Mandate)

| Component | Proposed Service | Potential Cost Trap / Risk | Mitigation & Free Alternative |
| :--- | :--- | :--- | :--- |
| **Backend API** | AWS App Runner | **Hidden Provisioned Memory Fee**: While compute scales down, App Runner charges for provisioned container memory (~$0.007/GB-hour) even when idle unless fully paused. Free tier only provides 300 vCPU-hours and memory hours for the first month, leaving 420+ hours uncovered in a standard 720-hour month! | Verify exact account tier. If cost risk exists, evaluate AWS Lambda (1M free requests/month always free) or keep backend demonstrated locally / on verified ₹0 platforms (Render free tier / Railway credits). |
| **Database** | Amazon RDS | **12-Month Expiration & Storage Charges**: Free Tier (750 hrs/month of db.t3.micro) is ONLY valid during the first 12 months of the AWS account. If the student account is older than 12 months, RDS costs ~$15–$18/month. | Verify AWS account creation date. If older than 12 months, DO NOT launch RDS. Fall back to local SQLite demonstration or free cloud databases (Neon.tech / Supabase PostgreSQL free tiers). |
| **Document Storage** | Amazon S3 | **PUT/GET Request Overages**: Free tier includes 5 GB storage and 2,000 PUT requests. Accidental infinite loops or public bucket scans can rack up charges. | Implement file size caps (max 2MB), restrict upload endpoints to authenticated admins only, or keep file storage local in `uploads/` for Stage A. |
| **Frontend Hosting** | AWS Amplify | Build minutes beyond 1,000 mins/month incur charges. | S3 static website hosting or free hosting providers (Vercel, Netlify, Cloudflare Pages) which offer perpetual $0 hobby tiers. |
| **Notifications** | Amazon SNS / SES | Amazon SES requires domain verification and costs $0.10 per 1,000 emails after free allowances; paid SMS is strictly prohibited. | **In-app Notification Dashboard Only**: No paid email APIs or SMS gateways. Expiry alerts are queried and displayed on the admin UI. |

---

## 7. Directory Structure Proposal

The repository will adhere to a clean, decoupled monorepo structure:

```
cloud/
├── .gitignore                      # Enforces exclusion of node_modules, secrets, *.db
├── README.md                       # Main project briefing, quickstart, viva summary
├── docs/                           # Technical documentation & audit artifacts
│   ├── ARCHITECTURE.md             # This document (System architecture)
│   ├── DATA_MODEL.md               # Complete schema, constraints, indexes
│   ├── IMPLEMENTATION_PROGRESS.md  # Module-by-module tracking & acceptance criteria
│   └── COST_AND_DEPLOYMENT.md      # AWS pricing verification, eligibility checks
├── backend/                        # Node.js + Express.js REST API (Stage A & Stage B)
│   ├── .env.example                # Template for environment variables (NO secrets)
│   ├── package.json                # Backend dependencies (express, sqlite3, bcrypt, jsonwebtoken, etc.)
│   ├── server.js                   # Application entry point & server listener
│   ├── src/
│   │   ├── app.js                  # Express app setup, CORS, middleware assembly
│   │   ├── config/                 # Environment and DB connection configuration
│   │   │   └── database.js         # SQLite connection manager & query helper
│   │   ├── middlewares/            # Auth guard, error handler, schema validation
│   │   │   ├── authMiddleware.js
│   │   │   └── errorHandler.js
│   │   ├── routes/                 # Express route definitions
│   │   │   ├── authRoutes.js
│   │   │   ├── assetRoutes.js
│   │   │   ├── employeeRoutes.js
│   │   │   ├── licenseRoutes.js
│   │   │   └── reportRoutes.js
│   │   ├── controllers/            # HTTP request/response controllers
│   │   ├── services/               # Core business logic & lifecycle rules
│   │   ├── repositories/           # Parameterized SQL database queries
│   │   └── db/                     # Migrations and seed scripts
│   │       ├── schema.sql          # DDL table creation statements
│   │       └── seed.sql            # Initial admin user & sample realistic data
│   └── tests/                      # Unit and integration test suite
│       ├── auth.test.js
│       ├── assets.test.js
│       └── licenses.test.js
├── frontend/                       # React + Vite Single Page Application
│   ├── package.json                # Frontend dependencies (react, lucide-react, etc.)
│   ├── vite.config.js              # Vite configuration (proxy to backend :5000)
│   ├── index.html                  # HTML5 semantic entry point
│   └── src/
│       ├── main.jsx                # Application bootstrap
│       ├── App.jsx                 # Routing and navigation shell
│       ├── api/                    # Axios/fetch API clients and endpoint helpers
│       ├── components/             # Reusable UI components (Navbar, Sidebar, Modal, Badge)
│       └── pages/                  # Page views
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── Assets.jsx
│           ├── Employees.jsx
│           ├── Licenses.jsx
│           └── Reports.jsx
└── data/                           # Local SQLite storage directory (ignored in git)
    └── .gitkeep
```

---

## 8. Module 4: Asset Inventory, Employee Custody & Assignment Architecture

### 8.1 Layered Endpoint Structure
- **Employee Subsystem**:
  - `GET /api/employees`: Paginated, filterable directory with search by code, name, email, department.
  - `GET /api/employees/:id`: Single employee profile query.
  - `POST /api/employees`: Validates unique code/email, trims strings, creates employee with audit log.
  - `PUT /api/employees/:id`: Updates employee metadata.
  - `DELETE /api/employees/:id`: Checks assignment history in `asset_assignment_history`; returns HTTP 409 Conflict if history exists to prevent audit destruction, allowing physical deletion only for zero-history records.
- **Hardware Asset Subsystem**:
  - `GET /api/assets`: Paginated inventory joined with `employees` for current custody details.
  - `GET /api/assets/:id`: Full asset specifications with joined active custodian.
  - `POST /api/assets`: Enforces unique asset tag, category validation, and non-negative purchase costs.
  - `PUT /api/assets/:id`: Updates device attributes while prohibiting silent assignment removal on assigned assets.
  - `DELETE /api/assets/:id`: Rejects deletion with 409 Conflict if historical custody records exist.
- **Custody Assignment & Return Subsystem**:
  - `GET /api/assets/:id/history`: Chronological assignment audit records with custodian details and notes.
  - `POST /api/assets/:id/assign`: Atomic transaction assigning available asset to active employee and recording history.
  - `POST /api/assets/:id/return`: Atomic transaction returning assigned asset to available pool and recording return history.

