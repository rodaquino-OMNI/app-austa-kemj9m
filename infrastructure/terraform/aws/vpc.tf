# AWS VPC Configuration for AUSTA SuperApp Platform
# Provider version: hashicorp/aws ~> 5.0

# Local variables for VPC configuration
locals {
  az_count                  = 3
  private_subnet_count      = 6
  public_subnet_count       = 3
  vpc_flow_logs_retention   = 365
  nacl_rule_offset         = 100
  project_name             = "austa-superapp"
}

# Data source for available AZs
data "aws_availability_zones" "available" {
  state = "available"
}

# Main VPC resource
resource "aws_vpc" "main" {
  cidr_block                       = var.vpc_cidr
  enable_dns_hostnames            = true
  enable_dns_support              = true
  instance_tenancy                = "dedicated"
  enable_network_address_usage_metrics = true

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-vpc"
    HIPAA = "true"
    Environment = var.environment
  })
}

# VPC Flow Logs for security monitoring
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/${local.project_name}-${var.environment}-flow-logs"
  retention_in_days = local.vpc_flow_logs_retention

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-flow-logs"
  })
}

resource "aws_flow_log" "main" {
  vpc_id                   = aws_vpc.main.id
  traffic_type            = "ALL"
  log_destination_type    = "cloud-watch-logs"
  log_destination        = aws_cloudwatch_log_group.vpc_flow_logs.arn
  iam_role_arn           = aws_iam_role.vpc_flow_logs.arn

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-flow-logs"
  })
}

# IAM role for VPC Flow Logs
resource "aws_iam_role" "vpc_flow_logs" {
  name = "${local.project_name}-${var.environment}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = local.public_subnet_count
  vpc_id                 = aws_vpc.main.id
  cidr_block             = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone      = data.aws_availability_zones.available.names[count.index % local.az_count]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-public-${count.index + 1}"
    Tier = "Public"
    HIPAA = "true"
    "kubernetes.io/role/elb" = "1"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count              = local.private_subnet_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + local.public_subnet_count)
  availability_zone = data.aws_availability_zones.available.names[count.index % local.az_count]

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-private-${count.index + 1}"
    Tier = "Private"
    HIPAA = "true"
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-igw"
  })
}

# NAT Gateways with EIP
resource "aws_eip" "nat" {
  count  = local.az_count
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-nat-eip-${count.index + 1}"
  })
}

resource "aws_nat_gateway" "main" {
  count         = local.az_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-public-rt"
  })
}

resource "aws_route_table" "private" {
  count  = local.az_count
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-private-rt-${count.index + 1}"
  })
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = local.public_subnet_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = local.private_subnet_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index % local.az_count].id
}

# Network ACLs
resource "aws_network_acl" "private" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.private[*].id

  ingress {
    protocol   = "tcp"
    rule_no    = local.nacl_rule_offset
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 443
    to_port    = 443
  }

  ingress {
    protocol   = "tcp"
    rule_no    = local.nacl_rule_offset + 1
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 1024
    to_port    = 65535
  }

  egress {
    protocol   = -1
    rule_no    = local.nacl_rule_offset
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-${var.environment}-private-nacl"
    HIPAA = "true"
  })
}

# Outputs
output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}