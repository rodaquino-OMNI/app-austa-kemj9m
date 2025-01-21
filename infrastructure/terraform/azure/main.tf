# Azure Provider Configuration for AUSTA SuperApp DR Environment
# Version: ~> 3.0

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.5.0"
}

# Local variables for common resource tagging
locals {
  common_tags = {
    Project            = "AUSTA SuperApp"
    Environment        = var.environment
    ManagedBy         = "Terraform"
    DataClassification = "PHI"
    ComplianceScope   = "HIPAA-LGPD"
    DisasterRecovery  = "Secondary"
  }
}

# Resource Group for DR Environment
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.common_tags
}

# Virtual Network with Enhanced Security
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  address_space      = var.network_config.vnet_address_space

  # DDoS Protection
  ddos_protection_plan {
    enable = true
    id     = azurerm_network_ddos_protection_plan.main.id
  }

  tags = local.common_tags
}

# Subnets for Different Services
resource "azurerm_subnet" "aks" {
  name                 = "snet-aks"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.network_config.subnet_config.aks]

  service_endpoints = ["Microsoft.Sql", "Microsoft.Storage", "Microsoft.KeyVault"]
  
  delegation {
    name = "aks-delegation"
    service_delegation {
      name = "Microsoft.ContainerService/managedClusters"
    }
  }
}

# AKS Cluster with Advanced Security Features
resource "azurerm_kubernetes_cluster" "main" {
  name                = "aks-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "austa-${var.environment}"
  kubernetes_version  = var.aks_config.kubernetes_version

  default_node_pool {
    name                = var.aks_config.default_node_pool.name
    node_count          = var.aks_config.default_node_pool.node_count
    vm_size            = var.aks_config.default_node_pool.vm_size
    availability_zones  = var.aks_config.default_node_pool.availability_zones
    enable_auto_scaling = var.aks_config.default_node_pool.enable_auto_scaling
    min_count          = var.aks_config.default_node_pool.min_count
    max_count          = var.aks_config.default_node_pool.max_count
    vnet_subnet_id     = azurerm_subnet.aks.id

    # Enhanced Security Settings
    only_critical_addons_enabled = true
    enable_node_public_ip       = false
    enable_host_encryption      = true
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin     = var.aks_config.network_plugin
    network_policy     = "calico"
    service_cidr       = var.aks_config.network_policy
    dns_service_ip     = cidrhost(var.aks_config.service_cidr, 10)
    docker_bridge_cidr = "172.17.0.1/16"
    load_balancer_sku  = "standard"
  }

  # Advanced Security Features
  azure_policy_enabled = true
  
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  microsoft_defender {
    enabled = true
  }

  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  tags = local.common_tags
}

# Log Analytics Workspace for Monitoring
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                = "PerGB2018"
  retention_in_days   = var.monitoring_config.retention_in_days

  tags = local.common_tags
}

# Application Insights for Application Monitoring
resource "azurerm_application_insights" "main" {
  name                = "appi-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.main.id

  tags = local.common_tags
}

# Front Door for Global Load Balancing
resource "azurerm_frontdoor" "main" {
  name                = "fd-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name

  routing_rule {
    name               = "default-rule"
    accepted_protocols = var.frontdoor_config.routing_rules.accepted_protocols
    patterns_to_match  = var.frontdoor_config.routing_rules.patterns_to_match
    enabled            = var.frontdoor_config.routing_rules.enabled
    
    forwarding_configuration {
      forwarding_protocol = var.frontdoor_config.routing_rules.forwarding_protocol
      backend_pool_name   = "backend-pool"
    }
  }

  backend_pool {
    name = "backend-pool"
    backend {
      host_header = azurerm_kubernetes_cluster.main.fqdn
      address     = azurerm_kubernetes_cluster.main.fqdn
      http_port   = 80
      https_port  = 443
    }

    load_balancing_name = "default-lb"
    health_probe_name   = "default-probe"
  }

  frontend_endpoint {
    name                              = "default-endpoint"
    host_name                         = "austa-${var.environment}.azurefd.net"
    session_affinity_enabled          = true
    session_affinity_ttl_seconds      = 300
    web_application_firewall_policy_link_id = azurerm_frontdoor_firewall_policy.main.id
  }

  tags = local.common_tags
}

# WAF Policy for Front Door
resource "azurerm_frontdoor_firewall_policy" "main" {
  name                = "waf-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  enabled             = var.frontdoor_config.waf_policy.enabled
  mode                = var.frontdoor_config.waf_policy.mode

  managed_rule {
    type    = var.frontdoor_config.waf_policy.rule_set_type
    version = var.frontdoor_config.waf_policy.rule_set_version
  }

  tags = local.common_tags
}

# Outputs for Reference
output "resource_group_name" {
  value       = azurerm_resource_group.main.name
  description = "The name of the resource group"
}

output "aks_cluster_name" {
  value       = azurerm_kubernetes_cluster.main.name
  description = "The name of the AKS cluster"
}

output "monitoring_endpoints" {
  value = {
    application_insights_key        = azurerm_application_insights.main.instrumentation_key
    log_analytics_workspace_id      = azurerm_log_analytics_workspace.main.id
    frontdoor_endpoint             = azurerm_frontdoor.main.frontend_endpoint[0].host_name
  }
  description = "Monitoring and observability endpoints"
  sensitive   = true
}