# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for bucket configuration
locals {
  bucket_prefix = "austa-${var.environment}"
  medical_docs_bucket = "${local.bucket_prefix}-medical-documents"
  app_assets_bucket = "${local.bucket_prefix}-app-assets"
  backup_bucket = "${local.bucket_prefix}-db-backups"
  audit_logs_bucket = "${local.bucket_prefix}-audit-logs"

  common_tags = {
    Environment = var.environment
    ManagedBy = "Terraform"
    Project = "AUSTA SuperApp"
    HIPAA = "true"
  }
}

# Medical Documents Bucket
resource "aws_s3_bucket" "medical_documents" {
  bucket = local.medical_docs_bucket
  force_destroy = false
  object_lock_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-medical-documents"
    Compliance = "HIPAA"
    DataClassification = "PHI"
  })
}

resource "aws_s3_bucket_versioning" "medical_documents" {
  bucket = aws_s3_bucket.medical_documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "medical_documents" {
  bucket = aws_s3_bucket.medical_documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.data_encryption_key_arn
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "medical_documents" {
  bucket = aws_s3_bucket.medical_documents.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}

# Application Assets Bucket
resource "aws_s3_bucket" "app_assets" {
  bucket = local.app_assets_bucket
  force_destroy = true

  tags = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-app-assets"
    Purpose = "Static Assets"
  })
}

resource "aws_s3_bucket_versioning" "app_assets" {
  bucket = aws_s3_bucket.app_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_assets" {
  bucket = aws_s3_bucket.app_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Database Backups Bucket
resource "aws_s3_bucket" "backups" {
  bucket = local.backup_bucket
  force_destroy = false
  object_lock_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-db-backups"
    Compliance = "HIPAA"
    DataClassification = "PHI"
  })
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.data_encryption_key_arn
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id = "backup_retention"
    status = "Enabled"

    transition {
      days = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years retention for HIPAA compliance
    }
  }
}

# Audit Logs Bucket
resource "aws_s3_bucket" "audit_logs" {
  bucket = local.audit_logs_bucket
  force_destroy = false
  object_lock_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-audit-logs"
    Compliance = "SOC2"
    Purpose = "Audit Logging"
  })
}

resource "aws_s3_bucket_versioning" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.data_encryption_key_arn
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id = "audit_retention"
    status = "Enabled"

    transition {
      days = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years retention for compliance
    }
  }
}

# Outputs
output "medical_docs_bucket_name" {
  value = aws_s3_bucket.medical_documents.id
  description = "Name of S3 bucket for medical documents"
}

output "app_assets_bucket_name" {
  value = aws_s3_bucket.app_assets.id
  description = "Name of S3 bucket for application assets"
}

output "backup_bucket_name" {
  value = aws_s3_bucket.backups.id
  description = "Name of S3 bucket for database backups"
}

output "audit_logs_bucket_name" {
  value = aws_s3_bucket.audit_logs.id
  description = "Name of S3 bucket for audit logs"
}