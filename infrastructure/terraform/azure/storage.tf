# Azure Storage Account configuration for AUSTA SuperApp DR environment
# Provider version: hashicorp/azurerm ~> 3.0

# Primary Storage Account for medical data and backups
resource "azurerm_storage_account" "main" {
  name                     = format("%s%s%s", "austa", var.environment, "store")
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier            = "Standard"
  account_replication_type = "GRS"
  account_kind            = "StorageV2"
  
  # Security configuration
  enable_https_traffic_only       = true
  min_tls_version                = "TLS1_2"
  infrastructure_encryption_enabled = true
  
  # Blob service configuration
  blob_properties {
    versioning_enabled = true
    change_feed_enabled = true
    
    container_delete_retention_policy {
      days = 30
    }
    
    delete_retention_policy {
      days = 30
    }
    
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD"]
      allowed_origins    = ["https://*.austa.health"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  # Network security rules
  network_rules {
    default_action             = "Deny"
    ip_rules                  = []
    virtual_network_subnet_ids = []
    bypass                    = ["AzureServices"]
  }

  # Identity configuration
  identity {
    type = "SystemAssigned"
  }

  # Advanced threat protection
  advanced_threat_protection_enabled = true

  # Static website configuration for CDN
  static_website {
    index_document     = "index.html"
    error_404_document = "404.html"
  }

  tags = var.tags
}

# Medical documents container
resource "azurerm_storage_container" "medical_documents" {
  name                  = "medical-documents"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  # Metadata for container identification
  metadata = {
    purpose = "medical-records"
    security = "hipaa-compliant"
    encryption = "aes256"
  }
}

# Backup container
resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  # Metadata for container identification
  metadata = {
    purpose = "system-backups"
    retention = "long-term"
    encryption = "aes256"
  }
}

# Media container
resource "azurerm_storage_container" "media" {
  name                  = "media"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  # Metadata for container identification
  metadata = {
    purpose = "media-content"
    cdn-enabled = "true"
    encryption = "aes256"
  }
}

# Lifecycle management policy
resource "azurerm_storage_management_policy" "lifecycle" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "backupRetention"
    enabled = true
    filters {
      prefix_match = ["backups/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days    = 30
        tier_to_archive_after_days = 90
        delete_after_days          = 365
      }
      snapshot {
        delete_after_days = 30
      }
      version {
        delete_after_days = 30
      }
    }
  }

  rule {
    name    = "mediaRetention"
    enabled = true
    filters {
      prefix_match = ["media/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days    = 90
        tier_to_archive_after_days = 180
      }
      snapshot {
        delete_after_days = 30
      }
    }
  }
}

# Outputs for use in other configurations
output "storage_account" {
  value = {
    id                    = azurerm_storage_account.main.id
    name                  = azurerm_storage_account.main.name
    primary_blob_endpoint = azurerm_storage_account.main.primary_blob_endpoint
    primary_access_key    = azurerm_storage_account.main.primary_access_key
  }
  sensitive = true
  description = "Storage account details for DR environment"
}