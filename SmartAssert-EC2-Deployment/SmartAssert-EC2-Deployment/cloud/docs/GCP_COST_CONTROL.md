# Google Cloud Cost Control & Free-Tier Architecture Guide

## 1. Executive Summary & Cost Philosophy

This project has been deliberately architected to operate within **Google Cloud Trial Credits ($300 over 90 days)** and eligible **Always Free Tier quotas**.

> [!CAUTION]
> **Fundamental Cloud Reality**:
> - **Promotional Credits ($300)**: Expire after 90 days from GCP account registration.
> - **Always Free Tier**: Remains permanently free **only** for eligible services within exact monthly quota and regional restrictions.
> - **Cloud SQL HAS NO ALWAYS FREE TIER**: Cloud SQL continues to incur hourly compute and storage charges as long as the instance is provisioned, even with zero web traffic.
> - **Budget Alerts**: Google Cloud Budget Alerts notify you by email; **they do NOT automatically stop running instances or terminate billing**.

---

## 2. In-Depth Service Breakdown & Pricing Matrix

| Service | Architecture Role | Free Tier Allowance | Our Configured Setting | Estimated Monthly Cost (With Zero / Low Traffic) |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Run** | Express Backend API | 2M requests/mo<br/>360,000 vCPU-sec<br/>180,000 GiB-sec memory | `--min-instances 0`<br/>`--max-instances 2`<br/>`--memory 512Mi`<br/>`--cpu 1` | **$0.00** (Scales to true zero when idle) |
| **Cloud SQL (PostgreSQL)** | Persistent Database | **None** (Paid compute & storage) | Shared core `db-f1-micro`<br/>10 GB SSD<br/>Zonal (No Multi-AZ) | **~$7.50 to $9.20 / month** (Covered by $300 trial credits) |
| **Cloud Storage** | Bill Images **Only** | 5 GB-mo (US regions)<br/>5,000 Class A ops<br/>50,000 Class B ops | Private bucket<br/>`bills/*` only<br/>Max 15MB file cap | **$0.00** in US regions<br/>(<$0.05/mo in Asia/Mumbai) |
| **Secret Manager** | Sensitive DB & Session Secrets | 6 active secret versions<br/>10,000 API access ops/mo | 2 secrets total (`db-password`, `session-secret`) | **$0.00** (Permanently within Free Tier) |
| **Vercel** | React 19 Frontend | Unlimited static hosting<br/>100 GB bandwidth/mo | Hobby Tier (Free) | **$0.00** (100% Free forever) |

---

## 3. Cost-Conscious Configuration Details

### 3.1 Cloud Run (Scale-to-Zero)
- **Minimum Instances**: Set strictly to `0` (`--min-instances 0`). When no HTTP requests are received, Cloud Run scales down to zero container instances. Compute and memory consumption drop to zero.
- **Maximum Instances**: Capped at `2` (`--max-instances 2`) to eliminate any possibility of runaway container scaling during DDoS or automated test loops.
- **Concurrency**: Set to `80`, allowing multiple concurrent requests per container before spinning up an additional instance.
- **No Background Workers**: No always-on polling loops, daemons, or separate background compute servers are created.

### 3.2 Cloud SQL for PostgreSQL (Cost Risk Mitigation)
- **Instance Tier**: Configured as `db-f1-micro` (0.6 GB RAM, shared vCPU), the lowest cost option available in Cloud SQL.
- **Storage**: Configured as 10 GB SSD. Storage is not over-provisioned.
- **High Availability**: Multi-AZ failover is **disabled** (`--availability-type=zonal`). Multi-AZ doubles instance and storage costs.
- **Action Required**: Because Cloud SQL charges persist while running, review your remaining trial credits in the Google Cloud Billing console. When finished evaluating or presenting the project, delete the instance or stop it.

### 3.3 Google Cloud Storage (Strict Single-Purpose Scope)
- **Strict Content Limitation**: Only user-uploaded purchase bill images (`.jpg`, `.png`, `.webp`) are stored in GCS.
- **Excluded Categories**: CSV reports, spreadsheets, application logs, employee profile photos, and database dumps are **prohibited from Cloud Storage**.
- **Payload Cap**: An upload size limit of **15MB** (`GCS_MAX_UPLOAD_BYTES=15728640`) is enforced server-side.
- **Duplicate Download Minimization**: Responses send `Cache-Control: private, max-age=3600`, preventing redundant egress reads for recently viewed bills.
- **Regional Note**: The Google Cloud "Always Free" 5 GB-month storage allowance applies to US regions (`us-central1`, `us-east1`, `us-west1`). If you choose an Indian region such as `asia-south1` (Mumbai), storage is billed at ~$0.023/GB/month (fractions of a cent for modest bill images), which is deducted from your trial credits.

### 3.4 Secret Manager & Cloud IAM
- The application uses exactly **2 secrets**:
  1. `db-password` (1 active version)
  2. `session-secret` (1 active version)
- Total active secret versions: 2 (well within the 6 free versions allowance).
- Secrets are injected as environment variables at container startup by Cloud Run, avoiding per-request API calls to Secret Manager.

---

## 4. How to Set Up a GCP Budget Alert (Recommended)

To ensure you are immediately warned of any unexpected charges:

1. Open the [Google Cloud Billing Console](https://console.cloud.google.com/billing).
2. Select your Billing Account.
3. Click **Budgets & alerts** in the left sidebar.
4. Click **Create Budget**:
   - **Name**: `smartassert-trial-safety-budget`
   - **Projects**: Select your project.
   - **Services**: All services.
   - **Budget Type**: Specified amount (e.g., `₹200` or `$5.00`).
   - **Threshold Rules**:
     - 50% of budget (trigger warning email)
     - 90% of budget (trigger warning email)
     - 100% of budget (trigger critical email)
5. Check **Email alerts to billing admins and users**.
6. Click **Finish**.

> [!NOTE]
> Setting a budget alert is a notification safeguard. If you receive an alert, proceed to the Cleanup section below to stop resources immediately.

---

## 5. Pre-Deployment Cost Checklist

Before executing `gcloud run deploy` or `gcloud sql instances create`:

- [ ] I have verified that my Google Cloud account has active trial credits or billing is enabled.
- [ ] I understand that Cloud SQL costs ~$0.25 to $0.30 per day while running.
- [ ] I have verified that Cloud Run `--min-instances` is set to `0`.
- [ ] I have verified that Cloud Run `--max-instances` is capped at `2`.
- [ ] I have created a Budget Alert in the Google Cloud Billing Console.
- [ ] I understand how to run the teardown commands to stop charges.

---

## 6. Immediate Teardown Instructions (Zero Ongoing Charges)

When your demonstration, evaluation, or grading is complete, execute these commands to guarantee that zero ongoing charges are incurred:

```bash
# 1. Delete Cloud SQL instance (stops continuous compute & storage billing)
gcloud sql instances delete asset-db-instance --quiet

# 2. Delete Cloud Run service (removes compute endpoint)
gcloud run services delete asset-management-backend --region us-central1 --quiet

# 3. Delete Cloud Storage bucket
gcloud storage rm --recursive gs://${PROJECT_ID}-bill-images

# 4. Delete secrets
gcloud secrets delete db-password --quiet
gcloud secrets delete session-secret --quiet
```
After running these commands, your GCP bill for the project will be **$0.00 / day**.
