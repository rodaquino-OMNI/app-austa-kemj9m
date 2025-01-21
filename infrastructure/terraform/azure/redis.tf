# Azure Cache for Redis configuration for AUSTA SuperApp DR environment
# Provider version: hashicorp/azurerm ~> 3.0

# Local variables for resource naming and tagging
locals {
  redis_name = "redis-${var.environment}"
  redis_tags = {
    Project     = "AUSTA SuperApp"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Service     = "Cache"
    DR          = "true"
  }
}

# Primary Azure Cache for Redis instance with zone redundancy and cluster mode
resource "azurerm_redis_cache" "main" {
  name                          = local.redis_name
  resource_group_name           = var.resource_group_name
  location                      = var.location
  sku_name                     = "Premium"
  family                       = "P"
  capacity                     = 3
  enable_non_ssl_port          = false
  minimum_tls_version          = "1.2"
  public_network_access_enabled = false
  redis_version                = "6.0"
  shard_count                  = 3
  zones                        = ["1", "2", "3"]

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 2
  }

  redis_configuration {
    maxmemory_reserved              = "10"
    maxmemory_delta                 = "10"
    maxmemory_policy                = "volatile-lru"
    maxfragmentationmemory_reserved = "10"
    enable_authentication           = true
    rdb_backup_enabled             = true
    rdb_backup_frequency           = 60
    rdb_backup_max_snapshot_count  = 1
  }

  tags = local.redis_tags

  lifecycle {
    prevent_destroy = true
  }
}

# Diagnostic settings for Redis Cache monitoring
resource "azurerm_monitor_diagnostic_setting" "redis" {
  name                       = "${local.redis_name}-diagnostics"
  target_resource_id         = azurerm_redis_cache.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  metric {
    category = "AllMetrics"
    enabled  = true

    retention_policy {
      enabled = true
      days    = 90
    }
  }
}

# Private endpoint for secure Redis Cache access
resource "azurerm_private_endpoint" "redis" {
  name                = "${local.redis_name}-pe"
  resource_group_name = var.resource_group_name
  location            = var.location
  subnet_id           = var.subnet_id

  private_service_connection {
    name                           = "${local.redis_name}-psc"
    private_connection_resource_id = azurerm_redis_cache.main.id
    is_manual_connection          = false
    subresource_names            = ["redisCache"]
  }

  tags = local.redis_tags
}

# Outputs for Redis Cache configuration
output "redis_host" {
  description = "The hostname of the Redis Cache instance"
  value       = azurerm_redis_cache.main.hostname
}

output "redis_ssl_port" {
  description = "The SSL port of the Redis Cache instance"
  value       = azurerm_redis_cache.main.ssl_port
}

output "redis_primary_access_key" {
  description = "The primary access key for the Redis Cache instance"
  value       = azurerm_redis_cache.main.primary_access_key
  sensitive   = true
}