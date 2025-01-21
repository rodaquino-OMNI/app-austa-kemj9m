# AUSTA SuperApp Platform Infrastructure Outputs
# Provider version: hashicorp/aws ~> 5.0

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC with HIPAA-compliant network isolation"
  value       = aws_vpc.main.id
  sensitive   = false
}

output "public_subnet_ids" {
  description = "List of public subnet IDs for external-facing services"
  value       = aws_subnet.public[*].id
  sensitive   = false
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for HIPAA-compliant internal services"
  value       = aws_subnet.private[*].id
  sensitive   = false
}

# EKS Cluster Outputs
output "eks_cluster_endpoint" {
  description = "Endpoint for EKS cluster with enhanced security controls"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = false
}

output "eks_cluster_name" {
  description = "Name of the HIPAA-compliant EKS cluster"
  value       = aws_eks_cluster.main.name
  sensitive   = false
}

output "eks_cluster_security_group_id" {
  description = "Security group ID for EKS cluster with strict access controls"
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  sensitive   = false
}

output "eks_cluster_certificate_authority" {
  description = "Certificate authority data for EKS cluster (encrypted for HIPAA compliance)"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

# Network Security Outputs
output "vpc_flow_logs_group" {
  description = "CloudWatch Log Group name for VPC flow logs monitoring"
  value       = aws_cloudwatch_log_group.vpc_flow_logs.name
  sensitive   = false
}

output "nat_gateway_ips" {
  description = "Elastic IP addresses of NAT Gateways for outbound traffic"
  value       = aws_eip.nat[*].public_ip
  sensitive   = false
}

# Networking Outputs
output "vpc_cidr_block" {
  description = "CIDR block of the VPC for network planning"
  value       = aws_vpc.main.cidr_block
  sensitive   = false
}

output "availability_zones" {
  description = "List of availability zones used by the infrastructure"
  value       = data.aws_availability_zones.available.names
  sensitive   = false
}

# Security Outputs
output "network_acl_ids" {
  description = "Network ACL IDs for subnet traffic control"
  value       = aws_network_acl.private.id
  sensitive   = false
}

output "route_table_ids" {
  description = "Route table IDs for network traffic management"
  value = {
    public  = aws_route_table.public.id
    private = aws_route_table.private[*].id
  }
  sensitive = false
}

# EKS Node Group Outputs
output "eks_node_group_arn" {
  description = "ARN of the EKS node group for cluster management"
  value       = aws_eks_node_group.main.arn
  sensitive   = false
}

output "eks_node_security_group" {
  description = "Security group ID for EKS worker nodes"
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  sensitive   = false
}

# IAM Outputs
output "eks_cluster_role_arn" {
  description = "ARN of IAM role used by EKS cluster"
  value       = aws_iam_role.eks_cluster.arn
  sensitive   = false
}

output "eks_node_role_arn" {
  description = "ARN of IAM role used by EKS worker nodes"
  value       = aws_iam_role.eks_node_group.arn
  sensitive   = false
}

# Tags Output
output "resource_tags" {
  description = "Common tags applied to all resources for compliance tracking"
  value       = local.common_tags
  sensitive   = false
}