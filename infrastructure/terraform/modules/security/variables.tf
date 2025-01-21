# Core Terraform functionality for infrastructure provisioning
terraform {
  required_version = "~> 1.0"
}

# Environment name for deploying security controls
variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod) for deploying security controls"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

# VPC ID for security group creation
variable "vpc_id" {
  type        = string
  description = "ID of the VPC where security groups and network controls will be created"
}

# KMS key ARN for encryption
variable "kms_key_arn" {
  type        = string
  description = "ARN of the KMS key for AES-256-GCM data encryption and key management"
}

# Application IAM role
variable "app_role_arn" {
  type        = string
  description = "ARN of the IAM role used by the application for KMS operations and security controls"
}

# WAF configuration object
variable "waf_config" {
  type = object({
    web_acl_arn         = string
    rate_limit          = number
    block_period        = number
    ip_rate_limit       = number
    geo_match_statement = list(string)
    rule_priority       = number
    ip_reputation_list  = list(string)
  })
  description = "WAF configuration for application security including rate limiting and IP blocking"
  default = {
    rate_limit          = 2000
    block_period        = 300
    ip_rate_limit       = 100
    rule_priority       = 1
    geo_match_statement = ["US", "BR"]
    ip_reputation_list  = []
  }
}

# Security group rules configuration
variable "security_rules" {
  type = map(object({
    type               = string
    from_port         = number
    to_port           = number
    protocol          = string
    cidr_blocks       = list(string)
    description       = string
    security_level    = string
    compliance_required = bool
  }))
  description = "Security group rules configuration for network access control"
}

# Encryption enablement flag
variable "enable_encryption" {
  type        = bool
  description = "Enable encryption for sensitive data using AES-256-GCM"
  default     = true
}

# Compliance mode selection
variable "compliance_mode" {
  type        = string
  description = "Compliance mode for security controls (HIPAA, LGPD, SOC2)"
  default     = "HIPAA"
  validation {
    condition     = can(regex("^(HIPAA|LGPD|SOC2)$", var.compliance_mode))
    error_message = "Compliance mode must be HIPAA, LGPD, or SOC2."
  }
}

# Security monitoring configuration
variable "security_monitoring" {
  type = object({
    enable_ids           = bool
    enable_audit_logging = bool
    log_retention_days   = number
    alert_endpoints      = list(string)
    monitoring_interval  = number
  })
  description = "Security monitoring and alerting configuration"
  default = {
    enable_ids           = true
    enable_audit_logging = true
    log_retention_days   = 365
    alert_endpoints      = []
    monitoring_interval  = 60
  }
}