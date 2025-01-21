# Azure Key Vault configuration for AUSTA SuperApp DR environment
# Provider version: hashicorp/azurerm ~> 3.0

# Get current Azure client configuration
data "azurerm_client_config" "current" {}

# Generate random suffix for globally unique Key Vault name
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Define local variables
locals {
  key_vault_name = "${format("kv-%s-%s", var.environment, random_string.suffix.result)}"
  common_tags = {
    Project            = "AUSTA SuperApp"
    Environment        = var.environment
    ManagedBy         = "Terraform"
    ComplianceLevel   = "HIPAA-LGPD"
    DataClassification = "Confidential"
    DisasterRecovery  = "Enabled"
  }
}

# Create Azure Key Vault with premium features
resource "azurerm_key_vault" "main" {
  name                            = local.key_vault_name
  location                        = var.location
  resource_group_name             = var.resource_group_name
  tenant_id                       = data.azurerm_client_config.current.tenant_id
  sku_name                        = var.key_vault_config.sku_name
  enabled_for_disk_encryption     = var.key_vault_config.enabled_for_disk_encryption
  enabled_for_template_deployment = var.key_vault_config.enabled_for_template_deployment
  enabled_for_deployment          = var.key_vault_config.enabled_for_deployment
  soft_delete_retention_days      = var.key_vault_config.soft_delete_retention_days
  purge_protection_enabled        = var.key_vault_config.purge_protection_enabled
  enable_rbac_authorization       = true

  network_acls {
    bypass                     = var.key_vault_config.network_acls.bypass
    default_action            = var.key_vault_config.network_acls.default_action
    ip_rules                  = []
    virtual_network_subnet_ids = []
  }

  tags = local.common_tags
}

# Configure access policy for Terraform service principal
resource "azurerm_key_vault_access_policy" "terraform" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  key_permissions = [
    "Create",
    "Delete",
    "Get",
    "List",
    "Purge",
    "Recover",
    "Update",
    "GetRotationPolicy",
    "SetRotationPolicy"
  ]

  secret_permissions = [
    "Set",
    "Get",
    "Delete",
    "List",
    "Purge",
    "Recover",
    "Backup",
    "Restore"
  ]

  certificate_permissions = [
    "Create",
    "Delete",
    "Get",
    "List",
    "Update",
    "Backup",
    "Restore",
    "ManageContacts",
    "ManageIssuers",
    "GetIssuers",
    "ListIssuers",
    "SetIssuers",
    "DeleteIssuers"
  ]
}

# Create encryption key with rotation policy
resource "azurerm_key_vault_key" "encryption_key" {
  name         = "encryption-key"
  key_vault_id = azurerm_key_vault.main.id
  key_type     = "RSA"
  key_size     = 2048

  key_opts = [
    "decrypt",
    "encrypt",
    "sign",
    "unwrapKey",
    "verify",
    "wrapKey"
  ]

  rotation_policy {
    automatic {
      time_before_expiry = "P30D"
    }
    expire_after         = "P90D"
    notify_before_expiry = "P29D"
  }

  tags = local.common_tags
}

# Output values for reference by other resources
output "key_vault_id" {
  value       = azurerm_key_vault.main.id
  description = "The ID of the Key Vault"
}

output "key_vault_uri" {
  value       = azurerm_key_vault.main.vault_uri
  description = "The URI of the Key Vault"
}

output "encryption_key_id" {
  value       = azurerm_key_vault_key.encryption_key.id
  description = "The ID of the encryption key"
}