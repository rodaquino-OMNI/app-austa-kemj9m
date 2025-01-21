# Output definitions for AUSTA SuperApp database module
# Exposes connection endpoints, configuration details, and security information
# for PostgreSQL RDS and Redis ElastiCache clusters

# PostgreSQL RDS Outputs
output "rds_endpoint" {
  description = "PostgreSQL RDS instance endpoint for database connections with master-slave replication support"
  value       = aws_db_instance.main.endpoint
}

output "rds_address" {
  description = "PostgreSQL RDS instance hostname for direct host-based connections"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "PostgreSQL RDS instance port number for connection configuration"
  value       = aws_db_instance.main.port
}

# Redis ElastiCache Outputs
output "redis_endpoint" {
  description = "Redis ElastiCache cluster configuration endpoint for distributed caching"
  value       = aws_elasticache_cluster.main.configuration_endpoint
}

output "redis_nodes" {
  description = "List of Redis cluster nodes with their endpoints for high availability configuration"
  value       = aws_elasticache_cluster.main.cache_nodes
}

output "redis_port" {
  description = "Redis cluster port number for cache connection configuration"
  value       = aws_elasticache_cluster.main.port
}

# Security Configuration Outputs
output "security_group_id" {
  description = "ID of the security group controlling database access and network rules"
  value       = aws_security_group.database.id
}

output "security_group_details" {
  description = "Detailed security group information including name and VPC association"
  value = {
    id      = aws_security_group.database.id
    name    = aws_security_group.database.name
    vpc_id  = aws_security_group.database.vpc_id
  }
}