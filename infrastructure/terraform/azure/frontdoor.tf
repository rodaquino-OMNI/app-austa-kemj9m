# Azure Front Door configuration for AUSTA SuperApp DR environment
# Provider version: ~> 3.0

# Front Door resource with premium SKU and enhanced security features
resource "azurerm_frontdoor" "austa_dr" {
  name                                         = "${var.environment}-austa-frontdoor"
  resource_group_name                          = var.resource_group_name
  enforce_backend_pools_certificate_name_check = true
  backend_pools_send_receive_timeout_seconds   = 60
  friendly_name                               = "AUSTA SuperApp DR Front Door"
  load_balancer_enabled                       = true

  routing_rule {
    name               = "api-routing"
    accepted_protocols = var.frontdoor_config.routing_rules.accepted_protocols
    patterns_to_match  = var.frontdoor_config.routing_rules.patterns_to_match
    enabled            = var.frontdoor_config.routing_rules.enabled

    frontend_endpoints = ["${var.environment}-austa-api"]

    forwarding_configuration {
      forwarding_protocol = var.frontdoor_config.routing_rules.forwarding_protocol
      backend_pool_name   = "api-backend"
      cache_enabled      = false
      
      custom_forwarding_path = ""
      
      custom_headers = {
        "X-Frame-Options"           = "DENY"
        "X-Content-Type-Options"    = "nosniff"
        "Strict-Transport-Security" = "max-age=31536000; includeSubDomains"
        "X-XSS-Protection"          = "1; mode=block"
      }
    }
  }

  backend_pool {
    name                = "api-backend"
    load_balancing_name = "LoadBalancingSettings1"
    health_probe_name   = "HealthProbeSetting1"

    backend {
      host_header = "api.austa-dr.com"
      address     = "api.austa-dr.com"
      http_port   = 80
      https_port  = 443
      priority    = 1
      weight      = 100
      enabled     = true
    }

    load_balancing {
      name                            = "LoadBalancingSettings1"
      sample_size                     = 4
      successful_samples_required     = 2
      additional_latency_milliseconds = 0
    }

    health_probe {
      name                = "HealthProbeSetting1"
      path                = "/health"
      protocol            = "Https"
      interval_in_seconds = 30
      probe_method        = "HEAD"
      timeout_in_seconds  = 10
    }
  }

  frontend_endpoint {
    name                              = "${var.environment}-austa-api"
    host_name                         = "api.austa-dr.com"
    session_affinity_enabled          = true
    session_affinity_ttl_seconds      = 300
    web_application_firewall_policy_link_id = azurerm_frontdoor_firewall_policy.austa_waf.id
  }

  tags = {
    Environment   = var.environment
    Service       = "AUSTA SuperApp DR"
    ManagedBy     = "Terraform"
    CostCenter    = "DR-Infrastructure"
    SecurityLevel = "High"
  }
}

# WAF policy with enhanced security rules
resource "azurerm_frontdoor_firewall_policy" "austa_waf" {
  name                              = "${var.environment}-austa-waf-policy"
  resource_group_name               = var.resource_group_name
  enabled                          = var.frontdoor_config.waf_policy.enabled
  mode                             = var.frontdoor_config.waf_policy.mode
  redirect_url                     = "https://error.austa-dr.com"
  custom_block_response_status_code = 403
  custom_block_response_body        = "Access denied by WAF policy"

  managed_rule {
    type    = var.frontdoor_config.waf_policy.rule_set_type
    version = var.frontdoor_config.waf_policy.rule_set_version

    override {
      rule_group_name = "PHP"
      rule {
        rule_id = "933100"
        enabled = true
        action  = "Block"
      }
    }
  }

  custom_rule {
    name     = "BlockHighRiskCountries"
    enabled  = true
    priority = 100
    type     = "MatchRule"
    action   = "Block"

    match_condition {
      match_variable     = "RemoteAddr"
      operator          = "GeoMatch"
      negation_condition = false
      match_values      = ["CN", "RU", "KP"]
    }
  }

  tags = {
    Environment   = var.environment
    Service       = "AUSTA SuperApp DR WAF"
    ManagedBy     = "Terraform"
    CostCenter    = "DR-Security"
    SecurityLevel = "High"
  }
}

# Output values for reference in other configurations
output "frontdoor_id" {
  description = "The ID of the Front Door instance"
  value       = azurerm_frontdoor.austa_dr.id
}

output "frontdoor_endpoints" {
  description = "The frontend endpoints of the Front Door instance"
  value       = [for endpoint in azurerm_frontdoor.austa_dr.frontend_endpoint : endpoint.host_name]
}

output "waf_policy_id" {
  description = "The ID of the WAF policy"
  value       = azurerm_frontdoor_firewall_policy.austa_waf.id
}