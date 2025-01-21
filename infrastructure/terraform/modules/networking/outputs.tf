# Output definitions for the networking module exposing VPC, subnet, and network security resource identifiers
# terraform ~> 1.0

output "vpc_id" {
  description = "ID of the created VPC for HIPAA-compliant network isolation"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the created VPC for network planning and security group rules"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs across availability zones for internet-facing load balancers"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs across availability zones for secure backend services"
  value       = aws_subnet.private[*].id
}

output "public_route_table_id" {
  description = "ID of the public route table for internet access configuration"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "List of private route table IDs for secure internal routing across AZs"
  value       = aws_route_table.private[*].id
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs for secure outbound internet access from private subnets"
  value       = aws_nat_gateway.main[*].id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway for public subnet internet connectivity"
  value       = aws_internet_gateway.main.id
}

output "vpc_flow_log_id" {
  description = "ID of VPC Flow Log for network traffic monitoring and security analysis"
  value       = aws_flow_log.main.id
}

output "vpc_flow_log_group_name" {
  description = "Name of CloudWatch Log Group containing VPC Flow Logs"
  value       = aws_cloudwatch_log_group.flow_log.name
}

output "vpc_flow_log_role_arn" {
  description = "ARN of IAM role used by VPC Flow Logs for CloudWatch integration"
  value       = aws_iam_role.flow_log.arn
}

output "availability_zones_used" {
  description = "List of availability zones where network resources are deployed"
  value       = var.availability_zones
}

output "network_details" {
  description = "Map of network configuration details for reference and documentation"
  value = {
    environment        = var.environment
    vpc_cidr          = aws_vpc.main.cidr_block
    public_subnets    = aws_subnet.public[*].cidr_block
    private_subnets   = aws_subnet.private[*].cidr_block
    nat_gateway_count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  }
}