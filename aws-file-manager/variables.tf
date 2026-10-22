variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Prefix used for resource names"
  type        = string
  default     = "cloud-file-manager"
}

variable "ec2_instance_type" {
  description = "EC2 instance type; verify availability and pricing in your account"
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "RDS instance class; verify availability and pricing in your account"
  type        = string
  default     = "db.t3.micro"
}

variable "mysql_engine_version" {
  description = "MySQL engine version supported by RDS in the selected region"
  type        = string
  default     = "8.0"
}

variable "db_name" {
  type    = string
  default = "filemanager"
}

variable "db_username" {
  type    = string
  default = "fileapp"
}

variable "max_upload_mb" {
  description = "Maximum accepted upload size in MB"
  type        = number
  default     = 25
}

variable "allowed_http_cidrs" {
  description = "CIDRs allowed to access HTTP. For a quick demo use 0.0.0.0/0; for safer access set your public IP as x.x.x.x/32."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
