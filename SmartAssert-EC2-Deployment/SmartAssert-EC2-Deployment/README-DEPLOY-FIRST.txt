SMARTASSERT EC2 DEPLOYMENT — START HERE

Target: http://52.66.240.88
Region: ap-south-1 (Mumbai)
Database: PostgreSQL on the supplied RDS endpoint, database postgres
Object storage: private S3 bucket cc.bills via the EC2 instance role

1. Copy this ZIP to your Amazon Linux EC2 instance and unzip it.
2. cd into the extracted SmartAssert-EC2-Deployment directory.
3. Ensure Docker + Docker Compose are installed and the EC2 security group allows inbound TCP 80.
4. Ensure RDS security group permits TCP 5432 from this EC2 security group.
5. Ensure the EC2 instance profile allows s3:GetObject, s3:PutObject, and s3:DeleteObject for arn:aws:s3:::cc.bills/bills/*.
6. Run:
   docker compose up -d --build
7. Check:
   docker compose ps
   docker compose logs -f backend
8. Open http://52.66.240.88

Read DEPLOY-EC2.md for troubleshooting and security details.

IMPORTANT: This archive contains deployment credentials for the requested quick setup. Keep it private, change the admin password after first login, and rotate the RDS password after your demo if it is a temporary/shared password. Never commit .env or INITIAL-ADMIN-CREDENTIALS.txt to GitHub.

The app schema is applied at backend startup. It does not run the demo-data seed script. Existing admin credentials are not overwritten automatically.
