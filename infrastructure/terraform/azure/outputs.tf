# Azure Infrastructure Outputs for AUSTA SuperApp DR Environment
# Version: 1.0.0

# Resource Group Outputs
output "resource_group_name" {
  description = "Name of the Azure resource group containing all AUSTA SuperApp DR resources"
  value       = azurerm_resource_group.main.name
  sensitive   = false
}

output "resource_group_location" {
  description = "Azure region where the DR environment is deployed"
  value       = azurerm_resource_group.main.location
  sensitive   = false
}

# AKS Cluster Outputs
output "aks_cluster_name" {
  description = "Name of the AKS cluster running AUSTA SuperApp DR services"
  value       = azurerm_kubernetes_cluster.main.name
  sensitive   = false
}

output "aks_host" {
  description = "AKS cluster API server endpoint for secure cluster access"
  value       = azurerm_kubernetes_cluster.main.kube_config.0.host
  sensitive   = true
}

# Database Outputs
output "postgresql_server_fqdn" {
  description = "Fully qualified domain name of the Azure Database for PostgreSQL server for database failover configuration"
  value       = azurerm_postgresql_flexible_server.main.fqdn
  sensitive   = false
}

# Cache Outputs
output "redis_connection_string" {
  description = "Primary connection string for Azure Cache for Redis instance used for session management"
  value       = azurerm_redis_cache.main.primary_connection_string
  sensitive   = true
}

# Security Outputs
output "key_vault_uri" {
  description = "URI of the Azure Key Vault for centralized secrets management and encryption key storage"
  value       = azurerm_key_vault.main.vault_uri
  sensitive   = false
}

# Network Outputs
output "frontdoor_endpoint" {
  description = "Endpoint URL of Azure Front Door for global load balancing and traffic management"
  value       = azurerm_cdn_frontdoor_profile.main.endpoint_url
  sensitive   = false
}