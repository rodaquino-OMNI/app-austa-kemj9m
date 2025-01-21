# Configure Terraform settings and required providers
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm" # version ~> 3.0
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread" # version ~> 2.0
      version = "~> 2.0"
    }
  }
}

# Data sources for Azure configuration
data "azurerm_client_config" "current" {}
data "azurerm_subscription" "current" {}

# Azure Resource Manager provider configuration with enhanced security features
provider "azurerm" {
  features {
    # Key Vault security configuration
    key_vault {
      purge_soft_delete_on_destroy               = false
      recover_soft_deleted_key_vaults            = true
      purge_soft_deleted_secrets_on_destroy      = false
    }

    # Resource group protection
    resource_group {
      prevent_deletion_if_contains_resources     = true
    }

    # Virtual machine security settings
    virtual_machine {
      delete_os_disk_on_deletion                = true
      graceful_shutdown                         = true
      skip_shutdown_and_force_delete            = false
    }

    # API Management protection
    api_management {
      purge_soft_delete_on_destroy              = false
      recover_soft_deleted_api_managements      = true
    }
  }

  # Enhanced security configurations
  storage_use_azuread                           = true
  skip_provider_registration                    = false
  use_msi                                       = true
}

# Azure Active Directory provider configuration
provider "azuread" {
  tenant_id    = data.azurerm_client_config.current.tenant_id
  use_msi      = true
  environment  = "public"
}