# Core Terraform functionality for infrastructure as code implementation
# terraform ~> 1.0

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC, must be sufficiently large to accommodate future growth"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR block must be valid IPv4 CIDR notation"
  }
}

variable "environment" {
  type        = string
  description = "Environment name for resource tagging and configuration management"

  validation {
    condition     = contains(["dev", "staging", "prod", "dr"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod, dr"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for network redundancy and high availability"

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones required for high availability"
  }
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for public subnets, one per AZ for load balancers and bastion hosts"

  validation {
    condition     = length(var.public_subnet_cidrs) == length(var.availability_zones)
    error_message = "Number of public subnet CIDRs must match number of AZs"
  }
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for private subnets hosting application workloads and databases"

  validation {
    condition     = length(var.private_subnet_cidrs) == length(var.availability_zones)
    error_message = "Number of private subnet CIDRs must match number of AZs"
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT Gateway for private subnet internet access, required for external API calls"
  default     = true
}

variable "single_nat_gateway" {
  type        = bool
  description = "Use a single NAT Gateway instead of one per AZ, trades availability for cost savings"
  default     = false
}

variable "enable_vpn_gateway" {
  type        = bool
  description = "Enable VPN Gateway for secure external access from healthcare providers"
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for network resources including compliance and management metadata"
  default = {
    HIPAA              = "true"
    ManagedBy          = "Terraform"
    Application        = "AUSTA-SuperApp"
    SecurityLevel      = "High"
    DataClassification = "PHI"
  }
}