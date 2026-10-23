# AWS Cost Analysis, Free Tier Eligibility, and Deployment Strategy

## 1. The ₹0 Budget Directive

This document provides a comprehensive cost audit for the **Cloud-Based IT Asset Lifecycle and Software License Management System**. Because the project is constrained by a **strict ₹0 budget**, no cloud service may be provisioned or configured without empirical verification that it will not incur a single rupee of expense.

> [!CAUTION]
> **MANDATORY POLICY**:
> 1. No AWS resources may be created during Modules 0 through 6.
> 2. Cloud deployment (Module 7) is **STRICTLY BLOCKED** until the user completes the Account Eligibility Verification Checklist and authorizes deployment in writing.
> 3. If any proposed AWS component poses even a minor risk of a surprise charge, a verified 100% free alternative will be deployed instead.

---

## 2. In-Depth AWS Service Pricing & Eligibility Analysis

### 2.1 AWS App Runner (Backend Web Service)
- **Architecture Role**: Hosting the Node.js / Express API container.
- **Pricing Model**:
  - **Active vCPU**: $0.064 per vCPU-hour (calculated only while processing active HTTP requests).
  - **Provisioned Memory (Idle)**: $0.007 per GB-hour (billed continuously to keep the container memory warm, even with **zero requests**).
- **Free Tier Eligibility**:
  - Free tier offers **300 vCPU-hours and memory hours per month for the first month only** for new accounts.
- **The Hidden Cost Trap**:
  - A standard month contains **720 to 744 hours**.
  - If a 1 vCPU / 2 GB App Runner instance runs continuously for one month, provisioned memory alone costs:
    $$\text{Cost} = (720\text{ hours} - 300\text{ free}) \times 2\text{ GB} \times \$0.007 \approx \$5.88\text{ to }\$10.36\text{/month}$$
  - **Verdict**: **HIGH RISK FOR ₹0 BUDGET**. App Runner does not scale provisioned memory to zero automatically unless manually paused via the AWS Console or AWS CLI after every session.
- **₹0 Contingency & Recommendation**:
  - *Option A*: Run backend locally for demonstration, or pause App Runner immediately after testing via an automated script.
  - *Option B*: Evaluate AWS Lambda (serverless) which includes **1,000,000 requests/month and 3.2 million seconds of compute time permanently free**, scaling to true zero ($0.00 when idle).
  - *Option C*: Render.com or Railway.app free tier (spins down on idle, $0 cost).

---

### 2.2 Amazon RDS (Relational Database - PostgreSQL)
- **Architecture Role**: Persistent SQL database for asset inventory and license records.
- **Pricing Model**:
  - `db.t3.micro` / `db.t4g.micro`: ~$0.018 - $0.021 per hour (~$14.50 - $17.00/month if unassisted by Free Tier).
  - Storage: 20 GB General Purpose SSD (gp2/gp3) (~$2.30/month).
- **Free Tier Eligibility**:
  - **750 hours/month** of Single-AZ `db.t3.micro` or `db.t4g.micro` instances.
  - **20 GB** of General Purpose (SSD) database storage.
  - **20 GB** of automated backup storage.
  - **CRITICAL CONDITION**: This allowance is **ONLY VALID during the first 12 months** following AWS account creation.
- **The Cost Trap**:
  - If the student's AWS account is **older than 12 months**, launching an RDS database will immediately bill at full hourly rates (~$15 - $20/month).
  - Accidental activation of "Multi-AZ Deployment" immediately doubles the cost and falls outside the Free Tier.
- **₹0 Contingency & Recommendation**:
  - Verify account age via AWS Billing Console.
  - If the account is > 12 months old, **DO NOT PROVISION RDS**. Use local SQLite for grading or utilize perpetual free managed PostgreSQL (e.g. Neon.tech serverless Postgres or Supabase, both offering permanent ₹0 tiers with zero credit card billing).

---

### 2.3 Amazon S3 (Document & Invoice Storage)
- **Architecture Role**: Storing optional PDF hardware invoices, OEM warranty certificates, and equipment photos.
- **Pricing Model**:
  - Standard Storage: $0.023 per GB/month.
  - PUT / POST requests: $0.005 per 1,000 requests.
  - GET requests: $0.0004 per 1,000 requests.
- **Free Tier Eligibility**:
  - 5 GB Standard storage for 12 months.
  - 20,000 GET requests and 2,000 PUT requests per month for 12 months.
- **The Cost Trap**:
  - Misconfigured public buckets allowing unauthorized crawling or uploads.
  - Uploading uncompressed video or large binaries.
- **₹0 Contingency & Recommendation**:
  - Enforce backend file size caps (max 2 MB per file).
  - Restrict uploads to authenticated admin sessions only.
  - For local development (Stage A), store uploads locally in `backend/uploads/`. Cloud S3 is strictly optional.

---

### 2.4 Frontend Hosting (AWS Amplify vs S3 + CloudFront vs Alternatives)
- **AWS Amplify**:
  - Free tier: 1,000 build minutes/month, 5 GB storage, 15 GB served/month (12-month limit).
  - Risk: Exceeded build minutes or post-12-month charges.
- **Amazon S3 Static Website + CloudFront CDN**:
  - CloudFront offers **1 TB data transfer out per month permanently free**.
  - S3 static hosting charges pennies for storage if beyond 12 months.
- **Zero-Cost Alternatives**:
  - **Vercel / Netlify / Cloudflare Pages**: Completely free perpetual hobby plans, custom domain support, automatic SSL, zero credit card requirements, instant CI/CD deployment.

---

### 2.5 Monitoring, Schedulers, and Alerts
- **Amazon CloudWatch**:
  - Free tier: 10 custom metrics and alarms, 5 GB log data ingestion per month (permanent).
  - Recommendation: Create an **AWS Billing Alarm at $0.01** to trigger immediate notifications if any unexpected charges occur.
- **Software License Expiry Scheduler**:
  - Paid trap: Using third-party paid SMS/email APIs (Twilio, SendGrid paid tiers).
  - Free design: Scheduled execution triggers an in-app administrative notification table. Zero external API calls, ₹0 guaranteed.

---

## 3. Student AWS Account Eligibility Checklist

Before authorizing any deployment in Module 7, the student must execute and verify the following audit steps:

| Audit Item | Verification Action | Safe Criteria (₹0 Compliance) |
| :--- | :--- | :--- |
| **1. Account Age** | Check AWS Console > Billing Dashboard > Free Tier | Account created within the last 12 months |
| **2. Active Credits** | Check AWS Console > Billing > Credits | Educational credits available (if any) |
| **3. Existing Resources** | Check AWS Resource Explorer across all regions | No orphaned EC2 instances, EBS volumes, or RDS databases |
| **4. Zero-Spend Budget** | Create AWS Budget with **$0.01 limit** and email alert | Budget active and verified |
| **5. Multi-Factor Auth (MFA)** | Enable virtual MFA on root account | Prevents account hijacking and unauthorized crypto mining |

---

## 4. Fallback Deployment Strategies (If AWS is Risky or Expired)

If the student's AWS account is older than 12 months or App Runner memory costs cannot be safely mitigated:

```
+---------------------------------------------------------------------------------------+
| FALLBACK OPTION 1: 100% LOCAL DEMONSTRATION (RECOMMENDED ACADEMIC BASELINE)          |
| - Frontend: React/Vite running on localhost:5173                                      |
| - Backend: Express.js running on localhost:5000                                       |
| - Database: SQLite in local data/ folder                                              |
| - Cost: ₹0.00 (Zero external dependencies, zero risk, full viva defense readiness)   |
+---------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------+
| FALLBACK OPTION 2: PERPETUAL FREE-TIER CLOUD ARCHITECTURE                             |
| - Frontend: Vercel / Netlify (Perpetual $0 Hobby Tier)                                |
| - Backend: Render.com / Railway (Web service with automatic sleep on idle, ₹0)        |
| - Database: Neon.tech Serverless PostgreSQL (0.5 GB storage, ₹0 permanent tier)       |
| - Cost: ₹0.00 (Zero credit card requirement, production-grade cloud URL)            |
+---------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------+
| FALLBACK OPTION 3: VERIFIED AWS FREE TIER (IF ACCOUNT < 12 MONTHS OLD)                |
| - Backend: AWS App Runner (with automatic shutdown script after demo)                 |
| - Database: Amazon RDS Single-AZ db.t4g.micro PostgreSQL                              |
| - Storage: Amazon S3 (authenticated private bucket)                                   |
| - Guardrails: AWS CloudWatch Billing Alarm at $0.01                                   |
+---------------------------------------------------------------------------------------+
```

---

## 5. Deployment Authorization Status

- **Current Status**: **BLOCKED**
- **Authorization Required**: Explicit user sign-off in Module 7.
- **Permitted Actions in Current Module (Module 0)**: Architectural documentation and cost modeling only.
