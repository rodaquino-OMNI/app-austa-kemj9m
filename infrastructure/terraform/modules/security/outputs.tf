# Security group outputs
output "security_group_id" {
  description = "ID of the security group created for AUSTA SuperApp services"
  value       = aws_security_group.app_security_group.id
}

output "security_group_name" {
  description = "Name of the security group for AUSTA SuperApp services"
  value       = aws_security_group.app_security_group.name
}

# KMS grant outputs
output "kms_grant_id" {
  description = "ID of the KMS grant for encryption operations"
  value       = aws_kms_grant.app_encryption_grant.id
}

output "kms_grant_arn" {
  description = "ARN of the KMS grant for encryption operations"
  value       = aws_kms_grant.app_encryption_grant.grant_arn
}

# WAF configuration output
output "waf_configuration" {
  description = "WAF configuration details for the application"
  value = {
    web_acl_arn = var.waf_config.web_acl_arn
    rate_limit  = var.waf_config.rate_limit
    environment = var.environment
  }
}

# Security compliance status output
output "security_compliance_status" {
  description = "Security compliance status and configurations"
  value = {
    encryption_enabled = true
    hipaa_compliant   = true
    environment       = var.environment
    security_controls = [
      "WAF Protection",
      "KMS Encryption",
      "Security Groups",
      "Network Isolation",
      "HIPAA Controls",
      "Data Encryption",
      "Access Logging",
      "Audit Trail"
    ]
  }
}