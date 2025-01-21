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
    ComplianceLevel   = "HIPAA"
    DataClassification = "PHI"
  }
}

# Log Analytics Workspace for AKS monitoring
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.environment}-austa-aks-logs"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                = "PerGB2018"
  retention_in_days   = 90

  tags = local.common_tags
}

# Disk Encryption Set for AKS node pools
resource "azurerm_disk_encryption_set" "aks" {
  name                = "${var.environment}-austa-aks-disk-encryption"
  resource_group_name = var.resource_group_name
  location            = var.location
  key_vault_key_id    = azurerm_key_vault_key.aks_encryption.id

  identity {
    type = "SystemAssigned"
  }

  tags = local.common_tags
}

# Main AKS Cluster
resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.environment}-austa-aks"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "${var.environment}-austa-aks"
  kubernetes_version  = var.aks_config.kubernetes_version

  private_cluster_enabled = true
  disk_encryption_set_id = azurerm_disk_encryption_set.aks.id

  default_node_pool {
    name                = "system"
    node_count          = 3
    vm_size            = "Standard_D4s_v3"
    vnet_subnet_id     = data.azurerm_subnet.aks_subnet.id
    availability_zones  = ["1", "2", "3"]
    enable_auto_scaling = true
    min_count          = 3
    max_count          = 5
    max_pods           = 50
    os_disk_type       = "Managed"
    os_disk_size_gb    = 128
    type               = "VirtualMachineScaleSets"
    only_critical_addons_enabled = true

    node_labels = {
      "nodepool-type" = "system"
      "environment"   = var.environment
      "nodepoolos"    = "linux"
    }

    tags = local.common_tags
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin     = "azure"
    network_policy     = "azure"
    service_cidr       = "10.0.0.0/16"
    dns_service_ip     = "10.0.0.10"
    docker_bridge_cidr = "172.17.0.1/16"
    outbound_type      = "userDefinedRouting"
    load_balancer_sku  = "standard"
  }

  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled    = true
    admin_group_object_ids = [var.aks_config.admin_group_id]
  }

  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    rotation_poll_interval   = "2m"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  microsoft_defender {
    enabled = true
  }

  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [21, 22, 23]
    }
  }

  auto_scaler_profile {
    balance_similar_node_groups      = true
    expander                        = "random"
    max_graceful_termination_sec    = 600
    max_node_provisioning_time      = "15m"
    max_unready_nodes               = 3
    max_unready_percentage          = 45
    new_pod_scale_up_delay          = "10s"
    scale_down_delay_after_add      = "10m"
    scale_down_delay_after_delete   = "10s"
    scale_down_delay_after_failure  = "3m"
    scan_interval                   = "10s"
    scale_down_unneeded            = "10m"
    scale_down_unready             = "20m"
    scale_down_utilization_threshold = 0.5
  }

  tags = local.common_tags
}

# Application node pool
resource "azurerm_kubernetes_cluster_node_pool" "app" {
  name                  = "app"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = "Standard_D4s_v3"
  node_count           = 3
  availability_zones   = ["1", "2", "3"]
  enable_auto_scaling  = true
  min_count           = 3
  max_count           = 10
  max_pods            = 50
  os_disk_size_gb     = 128
  os_disk_type        = "Managed"
  vnet_subnet_id      = data.azurerm_subnet.aks_subnet.id

  node_labels = {
    "nodepool-type" = "app"
    "environment"   = var.environment
    "nodepoolos"    = "linux"
  }

  node_taints = [
    "workload=app:NoSchedule"
  ]

  tags = local.common_tags
}

# Outputs
output "cluster_id" {
  description = "The Kubernetes Managed Cluster ID"
  value       = azurerm_kubernetes_cluster.main.id
}

output "kube_config" {
  description = "Kubernetes configuration"
  sensitive   = true
  value = {
    host                   = azurerm_kubernetes_cluster.main.kube_config.0.host
    client_certificate     = base64decode(azurerm_kubernetes_cluster.main.kube_config.0.client_certificate)
    client_key            = base64decode(azurerm_kubernetes_cluster.main.kube_config.0.client_key)
    cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.main.kube_config.0.cluster_ca_certificate)
  }
}

output "node_resource_group" {
  description = "The auto-generated Resource Group which contains the resources for this Managed Kubernetes Cluster"
  value       = azurerm_kubernetes_cluster.main.node_resource_group
}