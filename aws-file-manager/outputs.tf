output "website_url" {
  description = "Open this URL after cloud-init finishes (usually 5-10 minutes after apply)"
  value       = "http://${aws_instance.web.public_dns}"
}

output "s3_bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "rds_endpoint" {
  value = aws_db_instance.metadata.address
}

output "ec2_instance_id" {
  value = aws_instance.web.id
}

output "database_password" {
  description = "Sensitive: generated database password; stored in Terraform state."
  value       = random_password.db.result
  sensitive   = true
}
