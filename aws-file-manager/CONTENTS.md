# Included files

- `main.tf`: AWS provider, S3, RDS MySQL, EC2, IAM, security groups, user data wiring.
- `variables.tf`: region and instance/configuration variables.
- `outputs.tf`: website URL, bucket, database endpoint, instance ID, sensitive database password.
- `user_data.sh.tftpl`: EC2 bootstrap script; installs Python packages and configures systemd service.
- `app.py`: Flask routes for listing, uploading, downloading, and health check.
- `templates/index.html`: complete responsive HTML/CSS frontend; no separate Node/npm build is required.
- `requirements.txt` is generated on EC2 by the bootstrap script with Flask, boto3, PyMySQL, and Gunicorn.
- `terraform.tfvars.example`: optional settings example.
- `check-deployment.sh`: optional HTTP health poll.
- `README.md`: prerequisites, deployment, troubleshooting, cleanup, and security notes.

Note: Terraform provisions infrastructure and the EC2 user-data script installs runtime dependencies on first boot. A successful deployment still depends on AWS credentials/permissions, account quotas, default VPC/subnets, and outbound package repository connectivity.
