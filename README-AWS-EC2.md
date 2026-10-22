# SmartAssert — AWS EC2 + S3 + RDS deployment

This bundle keeps the existing SmartAssert React/Vite UI and Express API. The frontend is served by Nginx on EC2, the API runs as a systemd service, bill image bytes are stored in a private S3 bucket, and upload metadata plus asset/employee/license records are stored in RDS PostgreSQL.

## Before you start

Create these AWS resources in the same region (default example: `ap-south-1`):

1. EC2 Ubuntu 24.04 instance (Node.js 22+, Nginx).
2. Private S3 bucket with Block Public Access enabled.
3. RDS for PostgreSQL. Set RDS to **not publicly accessible**. Its security group must allow TCP 5432 only from the EC2 security group.
4. Attach an EC2 IAM instance profile/role with least-privilege S3 permissions for this bucket. Do not put access keys in `.env`.

Suggested EC2 inbound rules: SSH 22 from your own IP; HTTP 80 from the internet while testing; HTTPS 443 once TLS is configured. Do not expose port 5000 or 5432 publicly.

## Deploy

Upload/extract this bundle to `/opt/smartassert`. From the extracted project root, run: 

```bash
sudo apt-get update
sudo apt-get install -y nginx build-essential python3 make g++
# Install Node.js 22 LTS from the official NodeSource repository or use your approved Node.js installation method.
node --version   # must be 22.x (Vite 8 requirement)
npm --version

sudo useradd --system --create-home --home-dir /opt/smartassert --shell /usr/sbin/nologin smartassert || true
sudo chown -R smartassert:smartassert /opt/smartassert
cd /opt/smartassert/cloud/backend
cp .env.example .env
nano .env
npm install --omit=dev
```

Edit `.env` and set at minimum:

- `CORS_ORIGIN=http://YOUR_EC2_PUBLIC_DNS_OR_DOMAIN` (or your final HTTPS origin)
- `DB_HOST` to the RDS endpoint hostname only (no `https://`, no port suffix)
- `DB_NAME`, `DB_USER`, `DB_PASSWORD` to the database you created
- `AWS_REGION` and `S3_BUCKET_NAME` to your bucket
- `DB_SSL=true`

The EC2 role is used automatically by the AWS SDK credential chain. Never set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in the production `.env`. Keep `.env` readable only by the service account/admins.

Build the frontend (same-origin API calls mean `VITE_API_URL` stays blank):

```bash
cd /opt/smartassert/cloud/frontend
npm ci
npm run build
```

Initialize the schema in RDS and create your first administrator. This is a fresh database setup; do not run seed scripts unless you intentionally want demo data.

```bash
cd /opt/smartassert/cloud/backend
npm run db:migrate
npm run admin:create
```

Install and start the service and Nginx site:

```bash
sudo cp /opt/smartassert/deploy/smartassert.service /etc/systemd/system/smartassert.service
sudo systemctl daemon-reload
sudo systemctl enable --now smartassert
sudo cp /opt/smartassert/deploy/nginx-smartassert.conf /etc/nginx/sites-available/smartassert
sudo ln -sfn /etc/nginx/sites-available/smartassert /etc/nginx/sites-enabled/smartassert
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Open `http://YOUR_EC2_PUBLIC_DNS_OR_DOMAIN/`. Health check: `http://YOUR_EC2_PUBLIC_DNS_OR_DOMAIN/api/health`.

Logs and troubleshooting:

```bash
sudo systemctl status smartassert --no-pager
sudo journalctl -u smartassert -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

## Data design

- S3 stores the private image objects under the `bills/` prefix. The application validates image signatures and limits upload size.
- PostgreSQL stores SmartAssert application records. The `bill_uploads` table records each uploaded object's key, original filename, MIME type, byte size, provider, and upload timestamp. Asset records also retain their existing invoice reference fields.
- Images are read through an authenticated backend endpoint or short-lived presigned URLs. Do not make the S3 bucket public.

## IAM permissions

Grant only the required actions on the intended bucket/prefix, typically `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/bills/*`, plus `s3:ListBucket` scoped to the `bills/` prefix only if your operations require listing. The app does not need static IAM keys.

## Notes

- Configure HTTPS (for example, a domain + ACM/ALB or Certbot) before using this for real users.
- RDS inbound must reference the EC2 security group, not `0.0.0.0/0`.
- The schema migration runs explicitly; the API does not modify the database schema automatically at startup.
- This bundle does not contain `.env`, credentials, `node_modules`, build output, local databases, GCP binaries, or historical backup scripts.
