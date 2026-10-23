# SmartAssert — EC2 + Docker Compose deployment

This package runs the existing React/Vite frontend behind Nginx and the Express API in Docker. PostgreSQL remains on Amazon RDS and bill images use the private S3 bucket `cc.bills` through the EC2 instance profile (no AWS access keys in the app).

## Start

1. Upload and unzip this package on the Amazon Linux EC2 instance.
2. Confirm the EC2 security group allows inbound TCP **80** from your intended client IPs. Do not expose port 5000 or 5432 publicly.
3. Confirm the EC2 instance profile permits `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on the object prefix on `arn:aws:s3:::cc.bills/bills/*`. Bucket-level `s3:ListBucket` is optional for this app.
4. Confirm the RDS security group allows TCP 5432 **from the EC2 security group**, and that the RDS endpoint, username, password, and database are correct.
5. If the S3 SDK inside Docker cannot obtain instance-role credentials, check EC2 Instance Metadata Service settings: IMDSv2 must be enabled and the metadata response hop limit may need to be set to 2 for bridged containers. Do not put static AWS access keys in the app.
6. Install Docker and the Docker Compose plugin if not already installed. On Amazon Linux 2023:

   ```bash
   sudo dnf update -y
   sudo dnf install -y docker
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user
   newgrp docker
   docker compose version
   ```

7. Start from the directory containing `docker-compose.yml`:

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs -f backend
   ```

8. Open `http://52.66.240.88` and check `http://52.66.240.88/api/health`.

## Configuration and initial administrator

`.env` contains the RDS password supplied for this deployment and a generated initial administrator password. Keep the ZIP and `.env` private; do not commit or send it publicly. After first login, change the admin password. Rotate the RDS password after the demo if this is a shared/temporary credential. `.env.example` is provided as a template.

Initial login username: `admin`. The generated password is stored in `smartassert-admin-password.txt` alongside the ZIP when delivered separately; keep it private.

## What startup does

- Applies/verifies the project's PostgreSQL schema (`cloud/backend/src/db/schema.postgres.sql`).
- Creates the initial `admin` SUPERADMIN only if that username/email does not already exist. Existing admin passwords are not overwritten automatically.
- Starts the Express API and Nginx-served frontend.
- Stores uploaded bill images in S3 under `bills/`, using the EC2 instance role. The bucket stays private; image retrieval goes through the authenticated API.

## Troubleshooting

```bash
docker compose ps
docker compose logs --tail=150 backend
docker compose logs --tail=100 frontend
curl -i http://127.0.0.1/api/health
```

- **Database timeout/refused:** verify RDS is Available, port 5432 is allowed from the EC2 security group, and DB credentials are correct.
- **S3 AccessDenied:** add the minimum object permissions above to the EC2 instance role; do not add static AWS keys to `.env`.
- **Site unreachable:** allow inbound TCP 80 in the EC2 security group and confirm `docker compose ps` shows frontend healthy.
- **Admin bootstrap fails:** check backend logs. If a username/email already exists, the app intentionally avoids changing that account's password.

This package is prepared from the supplied source; it has not been run against your live EC2/RDS resources from this environment.
