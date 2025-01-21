#!/bin/bash

# AUSTA SuperApp Platform - Enterprise Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.0.0
# - postgresql-client v15
# - mongodb-database-tools v6.0

# Set strict error handling
set -euo pipefail

# Import monitoring verification
source ../scripts/monitoring-setup.sh

# Global variables
BACKUP_ROOT="/var/backups/austa"
LOG_FILE="/var/log/austa/backup.log"
S3_BUCKET="austa-backups"
RETENTION_DAYS=30
ARCHIVE_YEARS=20
AUDIT_YEARS=7
MAX_PARALLEL_JOBS=4
DATE=$(date +%Y-%m-%d-%H%M%S)
BACKUP_TYPE=${1:-"full"}
DATABASE_NAME=${2:-"all"}
TARGET_REGION=${3:-""}

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
handle_error() {
    log "ERROR: An error occurred on line $1"
    cleanup
    exit 3
}

trap 'handle_error $LINENO' ERR

# Setup backup environment
setup_backup_environment() {
    log "Initializing backup environment..."
    
    # Create backup directories with secure permissions
    mkdir -p "${BACKUP_ROOT}/{postgresql,mongodb,audit}"
    chmod 700 "${BACKUP_ROOT}"
    
    # Verify AWS credentials and S3 bucket access
    aws s3 ls "s3://${S3_BUCKET}" > /dev/null || {
        log "ERROR: Cannot access S3 bucket ${S3_BUCKET}"
        exit 2
    }
    
    # Initialize logging with rotation
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 600 "$LOG_FILE"
    
    # Verify available disk space (require at least 20% free)
    FREE_SPACE=$(df -h "$BACKUP_ROOT" | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$FREE_SPACE" -gt 80 ]; then
        log "ERROR: Insufficient disk space"
        exit 2
    }
    
    # Verify monitoring integration
    verify_monitoring || {
        log "ERROR: Monitoring verification failed"
        exit 2
    }
    
    return 0
}

# PostgreSQL backup function
backup_postgresql() {
    local db_name=$1
    local backup_type=$2
    local backup_file="${BACKUP_ROOT}/postgresql/${db_name}_${DATE}.sql.gz"
    local metadata_file="${backup_file}.meta"
    
    log "Starting PostgreSQL backup for ${db_name}..."
    
    # Acquire database lock for consistency
    pg_dump "$db_name" --lock-wait-timeout=60 --schema-only > /dev/null || {
        log "ERROR: Cannot acquire lock on ${db_name}"
        return 1
    }
    
    # Execute backup with parallel compression
    pg_dump "$db_name" \
        --format=custom \
        --compress=9 \
        --jobs="$MAX_PARALLEL_JOBS" \
        --file="$backup_file" || return 1
        
    # Generate and store backup metadata
    cat > "$metadata_file" << EOF
Backup Type: $backup_type
Database: $db_name
Date: $DATE
Checksum: $(sha256sum "$backup_file" | cut -d' ' -f1)
EOF
    
    # Upload to S3 with server-side encryption
    aws s3 cp "$backup_file" "s3://${S3_BUCKET}/postgresql/" \
        --sse AES256 \
        --metadata-directive REPLACE \
        --metadata "backup-type=${backup_type},database=${db_name}"
        
    log "PostgreSQL backup completed for ${db_name}"
    return 0
}

# MongoDB backup function
backup_mongodb() {
    local db_name=$1
    local backup_type=$2
    local backup_dir="${BACKUP_ROOT}/mongodb/${db_name}_${DATE}"
    local backup_archive="${backup_dir}.tar.gz"
    
    log "Starting MongoDB backup for ${db_name}..."
    
    # Verify MongoDB cluster health
    mongosh --eval "db.adminCommand('ping')" > /dev/null || {
        log "ERROR: MongoDB cluster health check failed"
        return 1
    }
    
    # Execute backup with parallel processing
    mongodump \
        --db="$db_name" \
        --out="$backup_dir" \
        --numParallelCollections="$MAX_PARALLEL_JOBS" || return 1
        
    # Compress backup directory
    tar -czf "$backup_archive" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"
    
    # Upload to S3 with versioning
    aws s3 cp "$backup_archive" "s3://${S3_BUCKET}/mongodb/" \
        --sse AES256 \
        --metadata "backup-type=${backup_type},database=${db_name}"
        
    log "MongoDB backup completed for ${db_name}"
    return 0
}

# Cross-region sync function
sync_to_dr() {
    local source_region=$1
    local target_region=$2
    
    log "Starting cross-region sync from ${source_region} to ${target_region}..."
    
    # Verify source backup integrity
    aws s3 ls "s3://${S3_BUCKET}" --region "$source_region" > /dev/null || return 1
    
    # Initialize cross-region replication
    aws s3 sync \
        "s3://${S3_BUCKET}" \
        "s3://${S3_BUCKET}-dr" \
        --region "$target_region" \
        --source-region "$source_region" \
        --sse AES256
        
    log "Cross-region sync completed"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    local backup_type=$1
    
    log "Starting cleanup of old ${backup_type} backups..."
    
    # Remove local backups older than retention period
    find "$BACKUP_ROOT" -type f -mtime +"$RETENTION_DAYS" -delete
    
    # Archive old S3 backups to Glacier
    aws s3 ls "s3://${S3_BUCKET}" --recursive | while read -r line; do
        timestamp=$(echo "$line" | awk '{print $1}')
        file=$(echo "$line" | awk '{print $4}')
        age=$(($(date +%s) - $(date -d "$timestamp" +%s)))
        
        if [ $age -gt $((RETENTION_DAYS * 86400)) ]; then
            aws s3 mv \
                "s3://${S3_BUCKET}/${file}" \
                "s3://${S3_BUCKET}-archive/${file}" \
                --storage-class GLACIER
        fi
    done
    
    log "Backup cleanup completed"
    return 0
}

# Main execution
main() {
    log "Starting backup process..."
    
    # Validate arguments
    if [ "$BACKUP_TYPE" != "full" ] && [ "$BACKUP_TYPE" != "incremental" ]; then
        log "ERROR: Invalid backup type. Must be 'full' or 'incremental'"
        exit 1
    }
    
    # Setup environment
    setup_backup_environment || exit 2
    
    # Execute database backups
    if [ "$DATABASE_NAME" = "all" ] || [ "$DATABASE_NAME" = "postgresql" ]; then
        backup_postgresql "austa_main" "$BACKUP_TYPE"
        backup_postgresql "austa_audit" "$BACKUP_TYPE"
    fi
    
    if [ "$DATABASE_NAME" = "all" ] || [ "$DATABASE_NAME" = "mongodb" ]; then
        backup_mongodb "health_records" "$BACKUP_TYPE"
        backup_mongodb "claims" "$BACKUP_TYPE"
    fi
    
    # Perform DR sync if target region specified
    if [ -n "$TARGET_REGION" ]; then
        sync_to_dr "$(aws configure get region)" "$TARGET_REGION"
    fi
    
    # Cleanup old backups
    cleanup_old_backups "$BACKUP_TYPE"
    
    log "Backup process completed successfully"
    exit 0
}

# Execute main function
main