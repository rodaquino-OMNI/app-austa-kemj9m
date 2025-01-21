# Azure PostgreSQL Flexible Server configuration for AUSTA SuperApp DR environment
# Provider version: hashicorp/azurerm ~> 3.0

# Local variables for resource naming and tagging
locals {
  postgresql_server_name = "psql-austa-${var.environment}"
  postgresql_db_name    = "austadb-${var.environment}"
  common_tags = {
    Environment = var.environment
    Project     = "AUSTA SuperApp"
    ManagedBy   = "Terraform"
    Service     = "PostgreSQL"
    Compliance  = "HIPAA"
  }
}

# Generate secure random password for PostgreSQL admin
resource "random_password" "postgresql" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
  min_special      = 2
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
}

# Private DNS Zone for PostgreSQL
resource "azurerm_private_dns_zone" "postgresql" {
  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = var.resource_group_name
  tags                = local.common_tags
}

# Private DNS Zone Virtual Network Link
resource "azurerm_private_dns_zone_virtual_network_link" "postgresql" {
  name                  = "psql-dns-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.postgresql.name
  virtual_network_id    = data.azurerm_virtual_network.main.id
  tags                  = local.common_tags
}

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = local.postgresql_server_name
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = "14"
  delegated_subnet_id    = var.postgresql_config.subnet_id
  private_dns_zone_id    = azurerm_private_dns_zone.postgresql.id
  administrator_login    = "psqladmin"
  administrator_password = random_password.postgresql.result
  zone                  = "1"
  
  storage_mb = var.postgresql_config.storage_mb
  sku_name   = var.postgresql_config.sku_name

  backup_retention_days        = var.postgresql_config.backup_retention_days
  geo_redundant_backup_enabled = var.postgresql_config.geo_redundant_backup
  auto_grow_enabled           = var.postgresql_config.auto_grow_enabled

  high_availability {
    mode                      = var.postgresql_config.high_availability.mode
    standby_availability_zone = var.postgresql_config.high_availability.standby_availability_zone
  }

  maintenance_window {
    day_of_week  = var.postgresql_config.maintenance_window.day_of_week
    start_hour   = var.postgresql_config.maintenance_window.start_hour
    start_minute = var.postgresql_config.maintenance_window.start_minute
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# PostgreSQL Database
resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = local.postgresql_db_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# PostgreSQL Server Configuration
resource "azurerm_postgresql_flexible_server_configuration" "main" {
  for_each = {
    ssl_enforcement_enabled = "on"
    log_checkpoints        = "on"
    log_connections       = "on"
    connection_throttling = "on"
    maintenance_work_mem  = "2097151"
    max_connections      = "500"
    shared_buffers       = "8GB"
    work_mem            = "64MB"
    effective_cache_size = "24GB"
    pgaudit.log         = "all"
    azure.extensions     = "PGAUDIT,PGCRYPTO"
    session_timeout     = "1800"
  }

  server_id = azurerm_postgresql_flexible_server.main.id
  name      = each.key
  value     = each.value
}

# PostgreSQL Firewall Rules
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Diagnostic settings for PostgreSQL
resource "azurerm_monitor_diagnostic_setting" "postgresql" {
  name                       = "postgresql-diagnostics"
  target_resource_id         = azurerm_postgresql_flexible_server.main.id
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id

  log {
    category = "PostgreSQLLogs"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 90
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 90
    }
  }
}

# Outputs
output "postgresql_server" {
  description = "PostgreSQL server details"
  value = {
    id               = azurerm_postgresql_flexible_server.main.id
    fqdn             = azurerm_postgresql_flexible_server.main.fqdn
    replica_capacity = azurerm_postgresql_flexible_server.main.replica_capacity
  }
  sensitive = true
}

output "postgresql_database" {
  description = "PostgreSQL database details"
  value = {
    id      = azurerm_postgresql_flexible_server_database.main.id
    name    = azurerm_postgresql_flexible_server_database.main.name
    charset = azurerm_postgresql_flexible_server_database.main.charset
  }
}