# Google Cloud Platform (GCP) End-to-End Deployment Guide

This guide provides the complete, step-by-step instructions to deploy the **smartAssert** IT Asset Lifecycle & Software License Management backend to **Google Cloud Run**, database to **Google Cloud SQL (PostgreSQL)**, bill images to **Google Cloud Storage**, secrets to **Google Cloud Secret Manager**, and frontend to **Vercel**.

> [!IMPORTANT]
> **Zero-Risk Principle**: Do not run deployment commands until you have reviewed your Google Cloud Free Trial credits ($300 credit for 90 days) and eligible Always Free allowances. All cloud resource provisioning is executed manually by you; the codebase does not automatically create paid cloud resources.

---

## 1. Prerequisites & GCP Project Setup

### 1.1 Install the Google Cloud SDK
Ensure `gcloud` CLI is installed and authenticated:
```bash
gcloud auth login
gcloud auth application-default login
```

### 1.2 Select or Create Your GCP Project
```bash
# Set your active project ID (replace with your actual project ID)
export PROJECT_ID="smartassert-prod"
export REGION="us-central1"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

### 1.3 Enable Required Google Cloud APIs
Enable only the exact APIs needed by the application:
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

---

## 2. Service 2: Google Cloud SQL (PostgreSQL)

### 2.1 Provision Minimal Cloud SQL Instance
For trial credits and cost-consciousness, configure a shared-core instance (`db-f1-micro`) with minimal storage and single-zone availability.

> [!WARNING]
> Cloud SQL instances incur hourly compute and storage charges even at zero traffic (~$7 - $10/month for `db-f1-micro`). Ensure your billing account has active trial credits, or delete the instance when demonstration testing is complete.

```bash
export DB_INSTANCE_NAME="asset-db-instance"

# Create PostgreSQL 14 instance
gcloud sql instances create $DB_INSTANCE_NAME \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --availability-type=zonal \
  --backup-start-time=02:00 \
  --no-deletion-protection
```

### 2.2 Create Production Database & Application User
```bash
# 1. Create the application database
gcloud sql databases create asset_management \
  --instance=$DB_INSTANCE_NAME

# 2. Generate a strong random password for the application user
export DB_APP_PASSWORD=$(openssl rand -base64 24)

# 3. Create dedicated application user (least privilege, not postgres superuser)
gcloud sql users create asset_app_user \
  --instance=$DB_INSTANCE_NAME \
  --password="$DB_APP_PASSWORD"

# Note the Connection Name for Cloud Run
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME --format="value(connectionName)")
echo "Instance Connection Name: $INSTANCE_CONNECTION_NAME"
# Format: PROJECT_ID:REGION:INSTANCE_NAME
```

---

## 3. Database Migration: SQLite to Cloud SQL PostgreSQL

To migrate your local SQLite data (`data/asset_management.db`) into your new Cloud SQL PostgreSQL instance:

### 3.1 Start Cloud SQL Auth Proxy (Local Terminal)
Download and run the official [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy):
```bash
# In a separate terminal window:
cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5432
```

### 3.2 Execute Data Migration Utility
In your local repository root:
```bash
cd cloud/backend

# Configure target credentials for migration run
export DB_HOST="127.0.0.1"
export DB_PORT="5432"
export DB_NAME="asset_management"
export DB_USER="asset_app_user"
export DB_PASSWORD="$DB_APP_PASSWORD"

# Run automated migration script
npm run db:migrate-pg
```
The migration script will:
1. Apply `src/db/schema.postgres.sql` (creating all 8 required tables, constraints, and indexes).
2. Transfer all existing rows in strict foreign key order (`administrators`, `employees`, `assets`, `asset_assignment_history`, `software_licenses`, `license_allocations`, `audit_logs`, `sessions`).
3. Reset all PostgreSQL serial sequences to prevent ID collisions.
4. Verify row count parity between SQLite and PostgreSQL.

---

## 4. Service 3: Google Cloud Storage (Bill Images Only)

### 4.1 Create Private Cloud Storage Bucket
Bucket names in Google Cloud are globally unique.

> [!NOTE]
> Cloud Storage is strictly scoped to purchase bill images (`bills/*`). General documents, CSV exports, employee photos, and database backups are never written to this bucket.

```bash
export BUCKET_NAME="${PROJECT_ID}-bill-images"

# Create private bucket with Uniform Bucket-Level Access in chosen region
gcloud storage buckets create gs://$BUCKET_NAME \
  --location=$REGION \
  --uniform-bucket-level-access \
  --public-access-prevention
```

---

## 5. Service 4 & 5: IAM & Secret Manager Configuration

### 5.1 Create Dedicated Cloud Run Runtime Service Account
Never run Cloud Run with the default compute service account (which has project-wide Editor permissions).
```bash
export RUNTIME_SA="asset-api-service@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create asset-api-service \
  --display-name="Asset Management Cloud Run Runtime Service Account"
```

### 5.2 Store Secrets in Secret Manager
Store sensitive credentials in Secret Manager:
```bash
# 1. Database application user password
echo -n "$DB_APP_PASSWORD" | gcloud secrets create db-password \
  --data-file=- \
  --replication-policy="automatic"

# 2. Session signing secret (cryptographic 256-bit key)
openssl rand -hex 32 | gcloud secrets create session-secret \
  --data-file=- \
  --replication-policy="automatic"
```

### 5.3 Grant Minimum IAM Permissions to Runtime Service Account
Follow least privilege: grant access ONLY to the specific resources required.

```bash
# 1. Cloud SQL Client permission (enables Unix socket connection via Cloud SQL Proxy inside Cloud Run)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client"

# 2. Storage Object User on the SPECIFIC bill images bucket (NOT project-wide)
gcloud storage buckets add-iam-policy-binding gs://$BUCKET_NAME \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectUser"

# 3. Secret Accessor permission on SPECIFIC secrets
gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding session-secret \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 6. Service 1: Deploy Backend to Google Cloud Run

### 6.1 Create Artifact Registry Repository (Optional/Automated)
```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=$REGION \
  --description="Container repository for Cloud Run services"
```

### 6.2 Deploy from Source Directory
Run from `cloud/backend` directory:
```bash
cd cloud/backend

# Deploy directly using Cloud Build & Cloud Run
gcloud run deploy asset-management-backend \
  --source . \
  --region $REGION \
  --service-account $RUNTIME_SA \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
  --set-env-vars "\
NODE_ENV=production,\
PORT=5000,\
DB_ENGINE=postgres,\
INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME},\
DB_NAME=asset_management,\
DB_USER=asset_app_user,\
DB_POOL_MAX=5,\
GCS_ENABLED=true,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GCS_MAX_UPLOAD_BYTES=15728640,\
COOKIE_SAMESITE=none,\
CORS_ORIGIN=https://your-app.vercel.app" \
  --set-secrets "\
DB_PASSWORD=db-password:latest,\
SESSION_SECRET=session-secret:latest" \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --concurrency 80 \
  --allow-unauthenticated
```

### 6.3 Note the Deployed Cloud Run HTTPS URL
```bash
export BACKEND_URL=$(gcloud run services describe asset-management-backend --region $REGION --format="value(status.url)")
echo "Deployed Backend URL: $BACKEND_URL"
```

### 6.4 Verify Backend Health Endpoint
```bash
curl -i "${BACKEND_URL}/api/health"
```
Expected response: HTTP 200 OK
```json
{
  "status": "UP",
  "healthy": true,
  "environment": "production",
  "database": {
    "status": "CONNECTED",
    "engine": "Google Cloud SQL (PostgreSQL)",
    "tablesFound": 8
  }
}
```

---

## 7. Frontend Deployment: Vercel

The React + Vite frontend remains hosted on **Vercel** with full zero-cost eligibility on the Hobby tier.

### 7.1 Configure Vercel Project Environment Variable
In your Vercel Dashboard (Project Settings > Environment Variables):
- **Name**: `VITE_API_URL`
- **Value**: Your Cloud Run HTTPS URL (e.g. `https://asset-management-backend-xyz-uc.a.run.app`)
- **Environments**: Production, Preview, Development

### 7.2 Deploy via Vercel CLI or GitHub
```bash
cd cloud/frontend

# Deploy via Vercel CLI
vercel --prod
```
Or connect your GitHub repository `VishnuS2006/smartAssert` to Vercel with Root Directory set to `cloud/frontend`.

### 7.3 Update Backend CORS with Exact Vercel Domain
Once Vercel supplies your production domain (e.g., `https://smartassert.vercel.app`):
Update the Cloud Run service's `CORS_ORIGIN`:
```bash
gcloud run services update asset-management-backend \
  --region $REGION \
  --update-env-vars CORS_ORIGIN="https://smartassert.vercel.app"
```

---

## 8. Post-Deployment Verification Checklist

| Step | Action | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| 1 | `GET /api/health` | HTTP 200 OK, `database.status: "CONNECTED"` | [ ] |
| 2 | Open Vercel URL in browser | Login screen loads with clean dark UI | [ ] |
| 3 | Login with Administrator credentials | Session cookie set (`SameSite=None; Secure; HttpOnly`) | [ ] |
| 4 | Upload Bill image (PNG/JPEG) | Upload succeeds; preview displays in UI | [ ] |
| 5 | Create Asset with Bill | Record saved in Cloud SQL with GCS object path | [ ] |
| 6 | View Purchase Bill modal | Private image streams through authorized backend | [ ] |
| 7 | Check Cloud Storage Bucket | Contains only `bills/bill_*.jpg/png` images | [ ] |
| 8 | Check Cloud Run Instances | Scales to 0 instances after 15 minutes of idle | [ ] |

---

## 9. Teardown & Resource Cleanup (Stopping Charges)

To completely stop any cloud charges when testing concludes:

```bash
# 1. Delete Cloud SQL instance (stops continuous compute/storage charges)
gcloud sql instances delete $DB_INSTANCE_NAME --quiet

# 2. Delete Cloud Run service
gcloud run services delete asset-management-backend --region $REGION --quiet

# 3. Empty and delete Cloud Storage bucket
gcloud storage rm --recursive gs://$BUCKET_NAME

# 4. Delete secrets
gcloud secrets delete db-password --quiet
gcloud secrets delete session-secret --quiet

# 5. Delete runtime service account
gcloud iam service-accounts delete $RUNTIME_SA --quiet
```
