# SmartAssert — IT Asset Lifecycle & Software License Management

A modern, full-stack enterprise web application for managing hardware asset lifecycles, employee custody tracking, purchase invoice uploads, software license seat allocations, automated warranty/license expiry alerts, and compliance-ready CSV reporting.

---

## ⚡ Quick Start (Run in Under 2 Minutes)

### Prerequisites
- **Node.js** (v18+ or v20+ recommended)
- **npm** (v9+)
- **Windows PowerShell** or standard terminal

### 1. Install Dependencies
Run the install command from the `cloud` directory:

```powershell
Set-Location E:\smartAssert\cloud

# Install backend and frontend dependencies
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure Environment
Create your `.env` file from the provided example:

```powershell
Copy-Item backend\.env.example backend\.env
```

### 3. Initialize & Seed Database
```powershell
npm --prefix backend run db:setup
```
> This migrates the database schema and populates demonstration records (hardware assets, licenses, employees, and historical assignment logs). Safe to re-run anytime.

### 4. Provision Administrator (First Time Only)
```powershell
npm --prefix backend run admin:create
```
Follow the interactive prompt to create your admin credentials (e.g. username `admin` and a strong password).

### 5. Launch the Application
Open two terminal windows:

**Terminal 1 — Backend API Server (Port 5000):**
```powershell
Set-Location E:\smartAssert\cloud
npm run backend:dev
```

**Terminal 2 — Frontend UI (Port 5173):**
```powershell
Set-Location E:\smartAssert\cloud
npm run frontend:dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser and sign in with your administrator credentials.

---

## 🌟 Key Application Features

| Module | Navigation Route | Key Capabilities |
| :--- | :--- | :--- |
| 📊 **Dashboard** | `/dashboard` | Real-time KPI summaries for total assets, active employee custody, available inventory pool, license seat utilization, and upcoming expiry counters. |
| 💻 **Hardware Assets** | `/assets` | Full lifecycle management (`Available`, `Assigned`, `Under Maintenance`, `Retired`), serial/model tracking, employee custody assignment/return, and purchase invoice bill upload with in-app modal preview. |
| 👥 **Employee Directory** | `/employees` | Personnel directory, departmental assignments, and real-time tracking of hardware assets currently assigned to each employee. |
| 🔑 **Software Licenses** | `/licenses` | Software license catalog, seat capacity enforcement (`allocated` vs `purchased`), employee seat allocation/revocation, and license key management. |
| ⏰ **License Expiry** | `/license-expiry` | Dedicated alerts categorized into urgency buckets (`Expired`, `≤ 7 Days`, `≤ 30 Days`, `Valid`, `No Expiry`), days-remaining calculation, and search filtering. |
| 🛡️ **Warranty Expiry** | `/warranty-expiry` | Dedicated hardware warranty expiration tracking, renewal status, and device custody correlation. |
| 📑 **Reports & CSV Export** | `/reports` | 7 compliance audit reports with instant tabular in-browser preview and 1-click sanitized CSV export (protected against formula injection). |
| ⚙️ **Settings** | `/settings` | Authenticated administrator profile details and session status. |

---

## 🏗️ Architecture & Technology Stack

- **Frontend**:
  - React 18, Vite 8, React Router 6.
  - Custom Vanilla CSS design system with CSS custom properties (tokens) and responsive layouts.
  - Lucide React icons.
- **Backend**:
  - Node.js, Express.js REST API.
  - Cookie-Parser, strict CORS origin validation, Rate Limiting.
- **Database Flexibility**:
  - **Local Development**: SQLite (`cloud/data/asset_management.db`) via `sqlite3`.
  - **Cloud Deployment**: Google Cloud SQL (PostgreSQL) via `pg` connection pool with automatic placeholder translation.
- **Invoice & Bill Storage**:
  - **Local Development**: Local disk storage (`cloud/data/uploads/bills/`) served via Express static middleware.
  - **Cloud Deployment**: Google Cloud Storage (GCS) private bucket (`assert-bill-images`) with authenticated streaming and short-lived signed URLs.
  - **Resilient Fallback**: Automatically falls back to local storage if GCS credentials are not configured locally.
- **Security Invariants**:
  - Stateful server-managed sessions with cryptographically secure 256-bit tokens stored in `HttpOnly`, `SameSite` cookies.
  - Passwords hashed using `bcryptjs` with salt factor 10.
  - SQL injection defense using strict parameterized queries.
  - Formula injection defense on CSV export cells.

---

## ⚙️ Configuration Reference (`backend/.env`)

| Variable | Description | Default (Local) | Cloud Production |
| :--- | :--- | :--- | :--- |
| `PORT` | Backend HTTP listening port | `5000` | `8080` |
| `NODE_ENV` | Application environment mode | `development` | `production` |
| `CORS_ORIGIN` | Allowed client origin for credentialed requests | `http://localhost:5173` | `https://your-frontend-app.vercel.app` |
| `COOKIE_SAMESITE`| Session cookie SameSite policy | `lax` | `none` (for cross-site hosting) |
| `DB_ENGINE` | Database dialect (`sqlite` or `postgres`) | `sqlite` | `postgres` |
| `DB_PATH` | Path to local SQLite file | `../data/asset_management.db` | *N/A* |
| `DB_HOST` | Database host / Cloud SQL Proxy IP | *N/A* | `127.0.0.1` |
| `DB_PORT` | Database port | *N/A* | `5432` |
| `DB_NAME` | Database name | *N/A* | `asset_management` |
| `DB_USER` | Database application user | *N/A* | `asset_app_user` |
| `DB_PASSWORD` | Database password | *N/A* | *Secret Manager* |
| `STORAGE_PROVIDER`| Bill storage provider (`local` or `gcs`)| `local` | `gcs` |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | *N/A* | `assert-bill-images` |

---

## 🧪 Testing & Verification

Execute all test suites across the stack:

```powershell
Set-Location E:\smartAssert\cloud

# Run both backend and frontend test suites
npm test

# Run frontend test suite (Vitest + React Testing Library)
npm run frontend:test

# Run backend test suite (Jest)
npm run backend:test

# Verify production build compilation
npm run frontend:build
```

---

## 📂 Project Directory Structure

```text
smartAssert/
└── cloud/
    ├── backend/                 # Express REST API Server
    │   ├── src/
    │   │   ├── config/          # Database configuration (SQLite & Postgres Pool)
    │   │   ├── controllers/     # Request handlers (Assets, Auth, Expiry, Reports)
    │   │   ├── db/              # Schema SQL and database seed scripts
    │   │   ├── middleware/      # Auth verification, CORS & global error handling
    │   │   ├── repositories/    # Database query abstraction layer
    │   │   ├── routes/          # Express route definitions
    │   │   ├── scripts/         # Admin creation CLI script
    │   │   └── services/        # Business logic & bill storage service
    │   ├── tests/               # Backend integration and security tests
    │   ├── .env.example         # Environment template
    │   └── server.js            # Express server bootstrap
    ├── frontend/                # React 18 + Vite Web Application
    │   ├── src/
    │   │   ├── api/             # Centralized API client (HttpOnly cookie enabled)
    │   │   ├── context/         # AuthContext provider
    │   │   ├── layouts/         # MainLayout with responsive sidebar & topbar
    │   │   ├── pages/           # Dashboard, Assets, Employees, Licenses, Expiry, Reports, Settings
    │   │   ├── routes/          # Protected and public route configuration
    │   │   ├── styles/          # Vanilla CSS design system tokens
    │   │   └── test/            # Vitest UI tests
    │   ├── index.html           # HTML entry point
    │   └── vite.config.js       # Vite build config & /api proxy
    ├── data/                    # Persistent storage (excluded from git)
    │   ├── asset_management.db  # Local SQLite database
    │   └── uploads/bills/       # Uploaded asset purchase invoice images
    ├── docs/                    # Architecture, data model & deployment docs
    ├── package.json             # Root helper scripts
    └── README.md                # Project documentation
```

---

## ❓ Frequently Asked Questions & Troubleshooting

### The frontend cannot connect to the backend
Verify the backend process is running on port `5000` by visiting `http://localhost:5000/api/health` in your browser. It should respond with `{"status":"UP","healthy":true}`.

### CORS error when logging in
Ensure that `CORS_ORIGIN` in `backend/.env` exactly matches your frontend address, typically `http://localhost:5173`. Restart the backend after editing `.env`.

### Uploaded invoice bill shows "No bill" or fails to load
When uploading purchase bills (JPEG, PNG, WebP), the system saves the image to `cloud/data/uploads/bills/`. If `STORAGE_PROVIDER=gcs` is set without cloud credentials, the backend automatically and safely falls back to local disk storage.

### Resetting sample data
To reset the demonstration data back to default:
```powershell
npm --prefix backend run db:setup
```
