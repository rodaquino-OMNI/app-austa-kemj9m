# Azure Resource Group Configuration
variable "resource_group_name" {
  type        = string
  description = "Name of the Azure resource group for AUSTA SuperApp DR resources. Must follow naming conventions and be unique within subscription"
  
  validation {
    condition     = length(var.resource_group_name) >= 3 && length(var.resource_group_name) <= 63 && can(regex("^[a-zA-Z0-9-_]*$", var.resource_group_name))
    error_message = "Resource group name must be 3-63 characters, alphanumeric, hyphens and underscores only"
  }
}

# Azure Region Configuration
variable "location" {
  type        = string
  description = "Azure region for DR deployment. Must support all required services and meet data residency requirements"
  default     = "eastus2"
  
  validation {
    condition     = contains(["eastus2", "westus2", "centralus", "northeurope", "westeurope"], var.location)
    error_message = "Location must be a supported Azure region with all required service availability"
  }
}

# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment identifier for resource tagging and configuration"
  default     = "dr"
  
  validation {
    condition     = contains(["dev", "staging", "prod", "dr"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod, dr"
  }
}

# Network Configuration
variable "network_config" {
  type = object({
    vnet_address_space = list(string)
    subnet_config = object({
      aks              = string
      db               = string
      redis            = string
      private_endpoints = string
    })
    network_security_rules = object({
      allow_health_probes = bool
      allow_azure_lb      = bool
      deny_all_inbound   = bool
    })
  })
  description = "Network configuration including VNet, subnets, and security rules"
  default = {
    vnet_address_space = ["10.1.0.0/16"]
    subnet_config = {
      aks              = "10.1.0.0/20"
      db               = "10.1.16.0/24"
      redis            = "10.1.17.0/24"
      private_endpoints = "10.1.18.0/24"
    }
    network_security_rules = {
      allow_health_probes = true
      allow_azure_lb      = true
      deny_all_inbound   = true
    }
  }
}

# AKS Configuration
variable "aks_config" {
  type = object({
    kubernetes_version = string
    network_plugin    = string
    network_policy    = string
    default_node_pool = object({
      name                = string
      node_count          = number
      vm_size            = string
      availability_zones  = list(string)
      enable_auto_scaling = bool
      min_count          = number
      max_count          = number
    })
    addon_profile = object({
      azure_policy                     = bool
      oms_agent                       = bool
      azure_keyvault_secrets_provider = bool
    })
  })
  description = "AKS cluster configuration for DR environment"
  default = {
    kubernetes_version = "1.27"
    network_plugin    = "azure"
    network_policy    = "calico"
    default_node_pool = {
      name                = "systempool"
      node_count          = 3
      vm_size            = "Standard_D4s_v3"
      availability_zones  = ["1", "2", "3"]
      enable_auto_scaling = true
      min_count          = 3
      max_count          = 5
    }
    addon_profile = {
      azure_policy                     = true
      oms_agent                       = true
      azure_keyvault_secrets_provider = true
    }
  }
}

# PostgreSQL Configuration
variable "postgresql_config" {
  type = object({
    sku_name              = string
    storage_mb            = number
    backup_retention_days = number
    geo_redundant_backup  = bool
    auto_grow_enabled     = bool
    high_availability = object({
      mode                      = string
      standby_availability_zone = string
    })
    maintenance_window = object({
      day_of_week   = number
      start_hour    = number
      start_minute  = number
    })
  })
  description = "Azure Database for PostgreSQL configuration with high availability settings"
  default = {
    sku_name              = "GP_Standard_D4s_v3"
    storage_mb            = 524288
    backup_retention_days = 35
    geo_redundant_backup  = true
    auto_grow_enabled     = true
    high_availability = {
      mode                      = "ZoneRedundant"
      standby_availability_zone = "2"
    }
    maintenance_window = {
      day_of_week  = 0
      start_hour   = 3
      start_minute = 0
    }
  }
}

# Key Vault Configuration
variable "key_vault_config" {
  type = object({
    sku_name                        = string
    enabled_for_disk_encryption     = bool
    enabled_for_deployment          = bool
    enabled_for_template_deployment = bool
    soft_delete_retention_days      = number
    purge_protection_enabled        = bool
    network_acls = object({
      default_action = string
      bypass         = string
    })
  })
  description = "Azure Key Vault configuration for secrets and encryption management"
  default = {
    sku_name                        = "premium"
    enabled_for_disk_encryption     = true
    enabled_for_deployment          = true
    enabled_for_template_deployment = true
    soft_delete_retention_days      = 90
    purge_protection_enabled        = true
    network_acls = {
      default_action = "Deny"
      bypass         = "AzureServices"
    }
  }
}

# Front Door Configuration
variable "frontdoor_config" {
  type = object({
    sku_name    = string
    waf_policy = object({
      enabled         = bool
      mode            = string
      rule_set_type   = string
      rule_set_version = string
    })
    routing_rules = object({
      accepted_protocols  = list(string)
      patterns_to_match  = list(string)
      enabled            = bool
      forwarding_protocol = string
    })
  })
  description = "Azure Front Door configuration for global load balancing and failover"
  default = {
    sku_name = "Premium_AzureFrontDoor"
    waf_policy = {
      enabled          = true
      mode             = "Prevention"
      rule_set_type    = "Microsoft_DefaultRuleSet"
      rule_set_version = "2.1"
    }
    routing_rules = {
      accepted_protocols  = ["Http", "Https"]
      patterns_to_match  = ["/*"]
      enabled            = true
      forwarding_protocol = "HttpsOnly"
    }
  }
}

# Monitoring Configuration
variable "monitoring_config" {
  type = object({
    retention_in_days         = number
    daily_quota_gb           = number
    enable_container_insights = bool
    enable_vm_insights       = bool
    alert_rules = object({
      cpu_threshold    = number
      memory_threshold = number
      disk_threshold   = number
    })
  })
  description = "Azure Monitor and Log Analytics configuration"
  default = {
    retention_in_days         = 90
    daily_quota_gb           = 100
    enable_container_insights = true
    enable_vm_insights       = true
    alert_rules = {
      cpu_threshold    = 80
      memory_threshold = 80
      disk_threshold   = 85
    }
  }
}