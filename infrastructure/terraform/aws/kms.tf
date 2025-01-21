# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Local variables for key management
locals {
  key_admin_roles = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/KeyAdministrator"
  ]
  key_user_roles = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/KeyUser"
  ]
}

# KMS key policy for health records encryption
data "aws_iam_policy_document" "health_records_key_policy" {
  statement {
    sid    = "Enable IAM Root User Permissions"
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
      ]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "Allow Key Administrators"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = local.key_admin_roles
    }
    actions = [
      "kms:Create*",
      "kms:Describe*",
      "kms:Enable*",
      "kms:List*",
      "kms:Put*",
      "kms:Update*",
      "kms:Revoke*",
      "kms:Disable*",
      "kms:Get*",
      "kms:Delete*",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "Allow Key Users"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = local.key_user_roles
    }
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey"
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "s3.${var.aws_region}.amazonaws.com",
        "rds.${var.aws_region}.amazonaws.com"
      ]
    }
  }
}

# KMS key policy for claims data encryption
data "aws_iam_policy_document" "claims_key_policy" {
  statement {
    sid    = "Enable IAM Root User Permissions"
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
      ]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "Allow Key Administrators"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = local.key_admin_roles
    }
    actions = [
      "kms:Create*",
      "kms:Describe*",
      "kms:Enable*",
      "kms:List*",
      "kms:Put*",
      "kms:Update*",
      "kms:Revoke*",
      "kms:Disable*",
      "kms:Get*",
      "kms:Delete*",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "Allow Key Users"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = local.key_user_roles
    }
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey"
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "s3.${var.aws_region}.amazonaws.com",
        "rds.${var.aws_region}.amazonaws.com"
      ]
    }
  }
}

# KMS key for health records encryption
resource "aws_kms_key" "health_records_key" {
  description              = "KMS key for encrypting health records and PHI data"
  deletion_window_in_days  = 30
  key_usage               = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  enable_key_rotation     = true
  multi_region            = true
  policy                  = data.aws_iam_policy_document.health_records_key_policy.json

  tags = merge(
    local.common_tags,
    {
      Name               = "health-records-key-${var.environment}"
      Purpose           = "Health Records Encryption"
      DataClassification = "PHI"
      HIPAACompliant    = "true"
    }
  )
}

# KMS key for claims data encryption
resource "aws_kms_key" "claims_key" {
  description              = "KMS key for encrypting insurance claims data"
  deletion_window_in_days  = 30
  key_usage               = "ENCRYPT_DECRYPT"
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  enable_key_rotation     = true
  multi_region            = true
  policy                  = data.aws_iam_policy_document.claims_key_policy.json

  tags = merge(
    local.common_tags,
    {
      Name               = "claims-key-${var.environment}"
      Purpose           = "Claims Data Encryption"
      DataClassification = "PII"
      HIPAACompliant    = "true"
    }
  )
}

# KMS alias for health records key
resource "aws_kms_alias" "health_records_key_alias" {
  name          = "alias/${var.environment}/health-records"
  target_key_id = aws_kms_key.health_records_key.key_id
}

# KMS alias for claims key
resource "aws_kms_alias" "claims_key_alias" {
  name          = "alias/${var.environment}/claims"
  target_key_id = aws_kms_key.claims_key.key_id
}

# Output the health records key ARN
output "health_records_key_arn" {
  description = "ARN of the KMS key used for health records encryption"
  value       = aws_kms_key.health_records_key.arn
}

# Output the claims key ARN
output "claims_key_arn" {
  description = "ARN of the KMS key used for claims data encryption"
  value       = aws_kms_key.claims_key.arn
}