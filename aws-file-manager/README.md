# AWS Cloud File Manager — Terraform one-command deployment

Creates a demo file-upload website in **AWS Mumbai (`ap-south-1`)**:
- EC2 running Flask + Gunicorn
- Private S3 bucket for file objects
- RDS MySQL for metadata
- EC2 IAM role with scoped S3 permissions
- Security groups: web on port 80; MySQL only from the EC2 security group
- Public website URL as a Terraform output

## Prerequisites
1. An AWS account with permissions to create EC2, VPC/security groups, IAM roles/policies, S3, RDS, and related resources.
2. Terraform 1.5+.
3. AWS CLI configured with credentials, for example `aws configure` or your organization's SSO flow.
4. A default VPC with at least two subnets in different Availability Zones. RDS DB subnet groups typically require subnets in at least two AZs.

## Deploy

From this directory:

```bash
terraform init
terraform apply -auto-approve
```

When Terraform finishes, it prints `website_url`. EC2 cloud-init installs Python dependencies and starts the app; wait 5–10 minutes, then open the URL. There is no separate frontend build step: the HTML/CSS template is included in this ZIP and rendered by Flask.

Optional readiness check:
```bash
bash check-deployment.sh
```
This polls `/health` for up to five minutes. If it does not become healthy, see Troubleshooting below.

Optional custom settings:
```bash
cp terraform.tfvars.example terraform.tfvars
# Edit allowed_http_cidrs to your public IP/32 for better safety
terraform apply -auto-approve
```

To retrieve the generated DB password:
```bash
terraform output -raw database_password
```
This password is sensitive and the Terraform state file also contains it. Protect the state file; do not commit it to source control.

## Use
- Choose a file in the web UI and click Upload.
- File content is uploaded to the private S3 bucket.
- Filename, S3 key, size, content type, and upload timestamp are saved in RDS.
- Download links are presigned and expire after five minutes.
- Maximum upload size defaults to 25 MB.

## Troubleshooting
Connect to the EC2 instance using Systems Manager (if configured) or SSH if you add access intentionally. Check:
```bash
sudo cloud-init status --long
sudo tail -n 150 /var/log/user-data.log
sudo systemctl status cloud-file-manager --no-pager
sudo journalctl -u cloud-file-manager -n 100 --no-pager
curl -i http://localhost/health
```
If RDS creation fails, verify the default VPC has subnets in at least two AZs, your account has DB instance quota, and the configured MySQL engine version is available. If package installation fails, check outbound internet access from the selected subnet.

## Cost and cleanup
RDS and EC2 may incur charges. Review current AWS pricing and your account's free-tier eligibility before applying. To remove all resources created by this project:
```bash
terraform destroy
```
**Warning:** The S3 bucket is configured with `force_destroy = true`, so Terraform destroy removes uploaded objects too. Back up anything you need first.

## Security notes
This is a demo, not a production-hardened service:
- HTTP only; no TLS/HTTPS or authentication.
- Default HTTP CIDR permits public access. Restrict `allowed_http_cidrs` to your own IP/32 for safer testing.
- Use remote encrypted Terraform state with access controls for teams.
- Do not store Terraform state in a public repository; it includes the generated database password.
- Consider adding authentication, HTTPS, monitoring, rate limiting, malware scanning, and robust deployment automation before production use.
