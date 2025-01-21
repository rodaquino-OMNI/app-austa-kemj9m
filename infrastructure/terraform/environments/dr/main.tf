# Terraform configuration for AUSTA SuperApp DR environment
# Version: 1.0.0

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm" # version: ~> 3.0
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread" # version: ~> 2.0
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random" # version: ~> 3.0
      version = "~> 3.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "austa-terraform-state"
    storage_account_name = "austaterraformstate"
    container_name      = "tfstate"
    key                 = "dr/terraform.tfstate"
    subscription_id     = "${var.azure_subscription_id}"
    tenant_id           = "${var.azure_tenant_id}"
  }
}

# Provider configuration
provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
      recover_soft_deleted_key_vaults = true
    }
    virtual_machine {
      delete_os_disk_on_deletion = true
    }
  }
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
  environment     = "public"
}

# Local variables
locals {
  environment = "dr"
  location    = "eastus2"
  common_tags = {
    Project             = "AUSTA SuperApp"
    Environment         = "DR"
    ManagedBy          = "Terraform"
    HIPAA              = "true"
    LGPD               = "true"
    CostCenter         = "DR-Infrastructure"
    DataClassification = "Confidential"
  }
}

# Random string for unique resource names
resource "random_string" "unique" {
  length  = 8
  special = false
  upper   = false
}

# Resource Group for DR environment
resource "azurerm_resource_group" "dr" {
  name     = "rg-austa-dr-${random_string.unique.result}"
  location = local.location
  tags     = local.common_tags
}

# Virtual Network for DR environment
resource "azurerm_virtual_network" "dr" {
  name                = "vnet-austa-dr-${random_string.unique.result}"
  resource_group_name = azurerm_resource_group.dr.name
  location           = azurerm_resource_group.dr.location
  address_space      = ["10.1.0.0/16"]
  
  tags = local.common_tags
}

# Subnets for different components
resource "azurerm_subnet" "aks" {
  name                 = "snet-aks-dr"
  resource_group_name  = azurerm_resource_group.dr.name
  virtual_network_name = azurerm_virtual_network.dr.name
  address_prefixes     = ["10.1.0.0/20"]
  service_endpoints    = ["Microsoft.KeyVault", "Microsoft.Sql", "Microsoft.Storage"]
}

# AKS Cluster for DR environment
resource "azurerm_kubernetes_cluster" "dr" {
  name                = "aks-austa-dr-${random_string.unique.result}"
  location            = azurerm_resource_group.dr.location
  resource_group_name = azurerm_resource_group.dr.name
  dns_prefix          = "aks-austa-dr"
  kubernetes_version  = "1.25.6"

  default_node_pool {
    name                = "systempool"
    node_count          = 3
    vm_size            = "Standard_DS4_v2"
    type               = "VirtualMachineScaleSets"
    availability_zones = [1, 2, 3]
    vnet_subnet_id     = azurerm_subnet.aks.id
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin     = "azure"
    network_policy     = "calico"
    load_balancer_sku = "standard"
  }

  addon_profile {
    oms_agent {
      enabled = true
    }
    azure_policy {
      enabled = true
    }
  }

  tags = local.common_tags
}

# Key Vault for secrets management
resource "azurerm_key_vault" "dr" {
  name                = "kv-austa-dr-${random_string.unique.result}"
  location            = azurerm_resource_group.dr.location
  resource_group_name = azurerm_resource_group.dr.name
  tenant_id          = var.azure_tenant_id
  sku_name           = "premium"

  enabled_for_disk_encryption = true
  purge_protection_enabled    = true
  soft_delete_retention_days  = 90

  network_acls {
    bypass                    = "AzureServices"
    default_action           = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.aks.id]
  }

  tags = local.common_tags
}

# Monitoring module for DR environment
module "monitoring" {
  source              = "../../modules/monitoring"
  environment         = local.environment
  location            = local.location
  resource_group_name = azurerm_resource_group.dr.name
  compliance_mode     = "hipaa"
  slo_tracking_enabled = true
  cross_cloud_monitoring = true
}

# Security module for DR environment
module "security" {
  source              = "../../modules/security"
  environment         = local.environment
  location            = local.location
  resource_group_name = azurerm_resource_group.dr.name
  enable_encryption   = true
  compliance_controls = ["hipaa", "lgpd"]
  key_rotation_enabled = true
}

# Outputs
output "resource_group_name" {
  value       = azurerm_resource_group.dr.name
  description = "The name of the DR resource group"
}

output "aks_cluster_endpoint" {
  value       = azurerm_kubernetes_cluster.dr.kube_config.0.host
  description = "The endpoint for the DR AKS cluster"
  sensitive   = true
}

output "key_vault_uri" {
  value       = azurerm_key_vault.dr.vault_uri
  description = "The URI of the DR Key Vault"
  sensitive   = true
}