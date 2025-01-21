# Configure Terraform settings and required providers
terraform {
  # Specify minimum Terraform version required
  required_version = ">= 1.0.0"

  # Define required providers with versions
  required_providers {
    aws = {
      source  = "hashicorp/aws" # version ~> 5.0
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random" # version ~> 3.0
      version = "~> 3.0"
    }
  }

  # Configure S3 backend for state management with encryption and locking
  backend "s3" {
    bucket         = "austa-terraform-state"
    key            = "aws/${var.environment}/terraform.tfstate"
    region         = "${var.aws_region}"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/terraform-state"

    # Enable versioning for state file history
    versioning = true

    # Configure server-side encryption for state file
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm = "aws:kms"
        }
      }
    }
  }
}

# Data source to get current AWS account ID
data "aws_caller_identity" "current" {}

# Configure AWS Provider with security and compliance settings
provider "aws" {
  region = var.aws_region

  # Default tags applied to all resources
  default_tags {
    Project             = "AUSTA SuperApp"
    Environment         = var.environment
    ManagedBy          = "Terraform"
    HIPAA              = "true"
    SecurityLevel      = "high"
    DataClassification = "phi"
    ComplianceScope    = "hipaa-lgpd"
    BackupRequired     = "true"
    DisasterRecovery   = "required"
  }

  # Assume role configuration for secure access
  assume_role {
    role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
    session_name = "TerraformSession-${var.environment}"
    external_id  = "AUSTA-TF-${var.environment}"
  }
}

# Configure random provider for secure resource naming
provider "random" {
  # Random provider doesn't require additional configuration
}