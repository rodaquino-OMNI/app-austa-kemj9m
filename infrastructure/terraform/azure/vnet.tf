# Azure Provider configuration with version constraint
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# Local variables for common resource tagging
locals {
  common_tags = {
    Project            = "AUSTA SuperApp"
    Environment        = var.environment
    ManagedBy         = "Terraform"
    DataClassification = "PHI"
    ComplianceScope   = "HIPAA-HITECH"
    DisasterRecovery  = "Secondary"
  }
}

# Main Virtual Network for DR environment
resource "azurerm_virtual_network" "main" {
  name                = "${var.environment}-austa-vnet-dr"
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = var.network_config.vnet_address_space
  dns_servers         = ["168.63.129.16"] # Azure DNS

  # DDoS Protection Plan
  ddos_protection_plan {
    id     = azurerm_network_ddos_protection_plan.main.id
    enable = true
  }

  tags = merge(local.common_tags, {
    NetworkTier = "Core"
    Purpose     = "DR-Infrastructure"
  })
}

# DDoS Protection Plan
resource "azurerm_network_ddos_protection_plan" "main" {
  name                = "${var.environment}-ddos-protection-plan"
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = local.common_tags
}

# Application Gateway Subnet
resource "azurerm_subnet" "appgw" {
  name                 = "appgw-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.network_config.subnet_config.appgw]

  service_endpoints = [
    "Microsoft.Web",
    "Microsoft.KeyVault"
  ]
}

# AKS Cluster Subnet
resource "azurerm_subnet" "aks" {
  name                 = "aks-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.network_config.subnet_config.aks]

  service_endpoints = [
    "Microsoft.Sql",
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.ContainerRegistry"
  ]

  enforce_private_link_endpoint_network_policies = true
}

# Database Subnet
resource "azurerm_subnet" "db" {
  name                 = "db-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.network_config.subnet_config.db]

  service_endpoints = ["Microsoft.Sql"]

  delegation {
    name = "fs"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action"
      ]
    }
  }

  enforce_private_link_endpoint_network_policies = true
}

# Private Endpoints Subnet
resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.network_config.subnet_config.private_endpoints]

  enforce_private_link_endpoint_network_policies = true
}

# Network Security Group for AKS
resource "azurerm_network_security_group" "aks" {
  name                = "${var.environment}-aks-nsg-dr"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "allow_tls"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range         = "*"
    destination_port_range    = "443"
    source_address_prefix     = "Internet"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow_health_probes"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range         = "*"
    destination_port_range    = "65200-65535"
    source_address_prefix     = "AzureLoadBalancer"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "deny_all_inbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range         = "*"
    destination_port_range    = "*"
    source_address_prefix     = "*"
    destination_address_prefix = "*"
  }

  tags = merge(local.common_tags, {
    SecurityTier = "High"
    Purpose      = "AKS-Protection"
  })
}

# Associate NSG with AKS subnet
resource "azurerm_subnet_network_security_group_association" "aks" {
  subnet_id                 = azurerm_subnet.aks.id
  network_security_group_id = azurerm_network_security_group.aks.id
}

# Outputs for use in other modules
output "vnet_id" {
  description = "The ID of the Virtual Network"
  value       = azurerm_virtual_network.main.id
}

output "subnet_ids" {
  description = "Map of subnet IDs"
  value = {
    appgw_subnet_id            = azurerm_subnet.appgw.id
    aks_subnet_id             = azurerm_subnet.aks.id
    db_subnet_id              = azurerm_subnet.db.id
    private_endpoints_subnet_id = azurerm_subnet.private_endpoints.id
  }
}

output "nsg_id" {
  description = "The ID of the AKS Network Security Group"
  value       = azurerm_network_security_group.aks.id
}