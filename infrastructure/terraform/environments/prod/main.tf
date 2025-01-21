# Production Environment Terraform Configuration for AUSTA SuperApp
# Version: 1.0.0
# Provider Versions:
# - AWS Provider ~> 5.0
# - Kubernetes Provider ~> 2.23.0
# - Helm Provider ~> 2.11.0

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11.0"
    }
  }

  backend "s3" {
    bucket         = "austa-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    versioning     = true
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/terraform-state-key"
  }
}

# Local variables for environment configuration
locals {
  environment = "prod"
  aws_region = "us-east-1"
  dr_region  = "us-west-2"
  common_tags = {
    Environment        = "prod"
    Project           = "AUSTA SuperApp"
    ManagedBy         = "Terraform"
    HIPAA             = "true"
    LGPD              = "true"
    SOC2              = "true"
    CostCenter        = "PROD-001"
    DataClassification = "PHI"
  }
}

# Primary region provider configuration
provider "aws" {
  region = local.aws_region
  default_tags {
    tags = local.common_tags
  }
  assume_role {
    role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformProductionRole"
  }
}

# DR region provider configuration
provider "aws" {
  alias  = "dr"
  region = local.dr_region
  default_tags {
    tags = local.common_tags
  }
  assume_role {
    role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformDRRole"
  }
}

# Kubernetes provider configuration for primary region
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      module.eks.cluster_name
    ]
  }
}

# Helm provider configuration
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks",
        "get-token",
        "--cluster-name",
        module.eks.cluster_name
      ]
    }
  }
}

# VPC Module for Production Environment
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "austa-prod-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${local.aws_region}a", "${local.aws_region}b", "${local.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  enable_vpn_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  # HIPAA and SOC2 compliance requirements
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true

  tags = merge(
    local.common_tags,
    {
      Name = "austa-prod-vpc"
    }
  )
}

# EKS Module for Production Environment
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "austa-prod-eks"
  cluster_version = "1.27"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true

  # Enhanced security configuration
  cluster_encryption_config = [{
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }]

  eks_managed_node_groups = {
    general = {
      desired_size = 3
      min_size     = 3
      max_size     = 6

      instance_types = ["m5.large"]
      capacity_type  = "ON_DEMAND"

      # Enhanced security configuration
      enable_monitoring = true
      
      labels = {
        Environment = "prod"
        GithubRepo = "terraform-aws-eks"
        GithubOrg  = "terraform-aws-modules"
      }

      tags = local.common_tags
    }
  }

  # HIPAA and SOC2 compliance requirements
  enable_irsa = true

  tags = local.common_tags
}

# KMS key for EKS encryption
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = local.common_tags
}

# DR Region VPC Module
module "vpc_dr" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  providers = {
    aws = aws.dr
  }

  name = "austa-prod-vpc-dr"
  cidr = "10.1.0.0/16"

  azs             = ["${local.dr_region}a", "${local.dr_region}b", "${local.dr_region}c"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  public_subnets  = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  enable_vpn_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  # HIPAA and SOC2 compliance requirements
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true

  tags = merge(
    local.common_tags,
    {
      Name = "austa-prod-vpc-dr"
    }
  )
}

# Outputs for dependent configurations
output "vpc_id" {
  description = "Production VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "Production EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "vpc_dr_id" {
  description = "DR Region VPC ID"
  value       = module.vpc_dr.vpc_id
}