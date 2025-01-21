# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables
locals {
  domain_name = "austa-superapp.com"
  tags = {
    Environment     = var.environment
    Service        = "AUSTA SuperApp"
    ManagedBy      = "Terraform"
    SecurityLevel  = "High"
    Compliance     = "HIPAA"
  }
}

# Primary hosted zone
resource "aws_route53_zone" "primary" {
  name    = local.domain_name
  comment = "Primary hosted zone for AUSTA SuperApp ${var.environment} with DNSSEC"

  tags = merge(local.tags, {
    Name = "${var.environment}-primary-zone"
  })
}

# KMS key for DNSSEC signing
resource "aws_kms_key" "dnssec" {
  customer_master_key_spec = "ECC_NIST_P256"
  deletion_window_in_days  = 7
  key_usage               = "SIGN_VERIFY"
  policy = jsonencode({
    Statement = [
      {
        Action = [
          "kms:DescribeKey",
          "kms:GetPublicKey",
          "kms:Sign",
        ],
        Effect = "Allow"
        Principal = {
          Service = "dnssec-route53.amazonaws.com"
        }
        Resource = "*"
      },
      {
        Action = "kms:*"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Resource = "*"
      }
    ]
    Version = "2012-10-17"
  })

  tags = merge(local.tags, {
    Name = "${var.environment}-dnssec-key"
  })
}

# DNSSEC signing configuration
resource "aws_route53_key_signing_key" "primary" {
  hosted_zone_id             = aws_route53_zone.primary.id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                      = "austa-superapp-key"
}

resource "aws_route53_hosted_zone_dnssec" "primary" {
  depends_on = [aws_route53_key_signing_key.primary]
  hosted_zone_id = aws_route53_zone.primary.id
}

# Health check for primary endpoint
resource "aws_route53_health_check" "primary_endpoint" {
  fqdn              = aws_cloudfront_distribution.media_distribution.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "2"
  request_interval  = "10"
  regions          = ["us-east-1", "eu-west-1", "ap-southeast-1"]
  enable_sni       = true
  search_string    = "healthy"

  tags = merge(local.tags, {
    Name           = "${var.environment}-primary-health-check"
    CriticalService = "true"
  })
}

# Primary WWW record with failover routing
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "www.${local.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.media_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.media_distribution.hosted_zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.primary_endpoint.id
  set_identifier  = "primary"
  
  failover_routing_policy {
    type = "PRIMARY"
  }
}

# API subdomain record
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "api.${local.domain_name}"
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api.cloudfront_domain_name
    zone_id                = aws_api_gateway_domain_name.api.cloudfront_zone_id
    evaluate_target_health = true
  }
}

# Outputs
output "route53_zone_id" {
  value       = aws_route53_zone.primary.zone_id
  description = "Route53 hosted zone ID for DNS record management"
}

output "domain_name" {
  value       = local.domain_name
  description = "Domain name for application configuration"
}

output "nameservers" {
  value       = aws_route53_zone.primary.name_servers
  description = "Nameservers for the hosted zone"
}