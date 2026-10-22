terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "${var.project_name}-${random_id.suffix.hex}"
  common_tags = {
    Project   = var.project_name
    ManagedBy = "Terraform"
  }
}

resource "aws_s3_bucket" "uploads" {
  bucket        = "${var.project_name}-uploads-${random_id.suffix.hex}"
  force_destroy = true
  tags          = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_security_group" "web" {
  name_prefix = "${local.name_prefix}-web-"
  description = "HTTP access to File Manager EC2"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Web UI (restrict this CIDR for non-demo use)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "db" {
  name_prefix = "${local.name_prefix}-db-"
  description = "MySQL access only from web EC2"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "MySQL from web tier only"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
  tags       = local.common_tags
}

resource "random_password" "db" {
  length           = 24
  special          = false
}

resource "aws_db_instance" "metadata" {
  identifier                   = "${var.project_name}-${random_id.suffix.hex}"
  engine                       = "mysql"
  engine_version               = var.mysql_engine_version
  instance_class               = var.db_instance_class
  allocated_storage            = 20
  max_allocated_storage        = 30
  storage_type                 = "gp3"
  db_name                       = var.db_name
  username                      = var.db_username
  password                      = random_password.db.result
  port                          = 3306
  db_subnet_group_name          = aws_db_subnet_group.this.name
  vpc_security_group_ids        = [aws_security_group.db.id]
  publicly_accessible           = false
  storage_encrypted             = true
  backup_retention_period       = 0
  deletion_protection           = false
  skip_final_snapshot           = true
  auto_minor_version_upgrade    = true
  apply_immediately             = true
  tags                          = local.common_tags
}

resource "aws_iam_role" "ec2" {
  name_prefix = "${local.name_prefix}-ec2-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "s3_uploads" {
  name = "${local.name_prefix}-s3-access"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.uploads.arn,
        "${aws_s3_bucket.uploads.arn}/*"
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name_prefix = "${local.name_prefix}-profile-"
  role        = aws_iam_role.ec2.name
  tags        = local.common_tags
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "web" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.web.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    app_py_b64          = base64encode(file("${path.module}/app.py"))
    index_html_b64      = base64encode(file("${path.module}/templates/index.html"))
    s3_bucket           = aws_s3_bucket.uploads.bucket
    db_host             = aws_db_instance.metadata.address
    db_name             = var.db_name
    db_username         = var.db_username
    db_password         = random_password.db.result
    max_upload_mb       = var.max_upload_mb
  })

  depends_on = [
    aws_db_instance.metadata,
    aws_s3_bucket_public_access_block.uploads,
    aws_iam_role_policy.s3_uploads
  ]

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-web" })
}
