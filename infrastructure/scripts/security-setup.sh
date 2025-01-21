#!/bin/bash

# Security Setup Script for AUSTA SuperApp Platform
# Version: 1.0
# Description: Configures security components including KMS keys, WAF rules, and compliance controls
# Dependencies: aws-cli (2.0+), openssl (1.1+), jq (1.6+)

set -euo pipefail

# Global Variables
AWS_REGION=${AWS_REGION:-us-east-1}
ENVIRONMENT=${ENVIRONMENT:-dev}
KMS_KEY_ALIAS_PREFIX="alias/${ENVIRONMENT}/austa"
WAF_RATE_LIMIT=2000
LGPD_COMPLIANCE_MODE=true
SECURITY_AUDIT_INTERVAL="24h"
CONFIG_DRIFT_CHECK="enabled"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message=$@
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}"
}

# Error handling
error_handler() {
    local line_no=$1
    local error_code=$2
    log "ERROR" "Error occurred in script at line: ${line_no}, error code: ${error_code}"
    exit ${error_code}
}
trap 'error_handler ${LINENO} $?' ERR

# Input validation
validate_inputs() {
    log "INFO" "Validating input parameters and AWS credentials..."

    # Check AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log "ERROR" "Invalid AWS credentials or insufficient permissions"
        exit 1
    }

    # Validate environment
    if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod|dr)$ ]]; then
        log "ERROR" "Invalid environment: ${ENVIRONMENT}. Must be dev, staging, prod, or dr"
        exit 1
    }

    # Validate AWS region
    if ! aws ec2 describe-regions --region ${AWS_REGION} | grep -q ${AWS_REGION}; then
        log "ERROR" "Invalid AWS region: ${AWS_REGION}"
        exit 1
    }

    log "INFO" "Input validation completed successfully"
}

# Setup KMS keys with enhanced policy validation
setup_kms_keys() {
    log "INFO" "Setting up KMS keys with enhanced security policies..."

    # Health Records Key
    local health_key_policy=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EnableHIPAACompliance",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):root"
            },
            "Action": "kms:*",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "kms:ViaService": [
                        "s3.${AWS_REGION}.amazonaws.com",
                        "rds.${AWS_REGION}.amazonaws.com"
                    ]
                }
            }
        }
    ]
}
EOF
)

    # Create health records key
    local health_key_id=$(aws kms create-key \
        --description "AUSTA SuperApp Health Records Encryption Key" \
        --policy "${health_key_policy}" \
        --tags TagKey=HIPAA,TagValue=true \
        --region ${AWS_REGION} \
        --query 'KeyMetadata.KeyId' \
        --output text)

    # Create alias for health records key
    aws kms create-alias \
        --alias-name "${KMS_KEY_ALIAS_PREFIX}/health-records" \
        --target-key-id "${health_key_id}" \
        --region ${AWS_REGION}

    log "SUCCESS" "Health records KMS key created successfully"

    # Enable automatic key rotation
    aws kms enable-key-rotation \
        --key-id "${health_key_id}" \
        --region ${AWS_REGION}
}

# Configure WAF rules with enhanced security
configure_waf_rules() {
    log "INFO" "Configuring WAF rules with enhanced security controls..."

    # Create WAF web ACL
    local waf_config=$(cat <<EOF
{
    "Name": "${ENVIRONMENT}-austa-superapp-waf",
    "Scope": "CLOUDFRONT",
    "DefaultAction": {
        "Allow": {}
    },
    "Rules": [
        {
            "Name": "RateBasedRule",
            "Priority": 1,
            "Statement": {
                "RateBasedStatement": {
                    "Limit": ${WAF_RATE_LIMIT},
                    "AggregateKeyType": "IP"
                }
            },
            "Action": {
                "Block": {}
            },
            "VisibilityConfig": {
                "SampledRequestsEnabled": true,
                "CloudWatchMetricsEnabled": true,
                "MetricName": "RateBasedRule"
            }
        }
    ],
    "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AustaSuperAppWAF"
    }
}
EOF
)

    # Create WAF web ACL
    aws wafv2 create-web-acl \
        --name "${ENVIRONMENT}-austa-superapp-waf" \
        --scope CLOUDFRONT \
        --default-action Allow={} \
        --rules "${waf_config}" \
        --region ${AWS_REGION}

    log "SUCCESS" "WAF rules configured successfully"
}

# Setup security monitoring and compliance checks
setup_security_monitoring() {
    log "INFO" "Setting up security monitoring and compliance checks..."

    # Create CloudWatch log group for security events
    aws logs create-log-group \
        --log-group-name "/austa-superapp/${ENVIRONMENT}/security" \
        --region ${AWS_REGION}

    # Configure CloudWatch metrics for security monitoring
    local metric_filter=$(cat <<EOF
{
    "filterName": "SecurityEvents",
    "filterPattern": "[timestamp, eventName, sourceIPAddress, userIdentity.type, userIdentity.principalId, userIdentity.arn, requestParameters, responseElements]",
    "metricTransformations": [
        {
            "metricName": "SecurityEventCount",
            "metricNamespace": "AustaSuperApp/${ENVIRONMENT}",
            "metricValue": "1"
        }
    ]
}
EOF
)

    # Create metric filter
    aws logs put-metric-filter \
        --log-group-name "/austa-superapp/${ENVIRONMENT}/security" \
        --filter-name "SecurityEvents" \
        --filter-pattern "${metric_filter}" \
        --region ${AWS_REGION}

    log "SUCCESS" "Security monitoring configured successfully"
}

# Setup LGPD compliance controls
setup_lgpd_compliance() {
    log "INFO" "Setting up LGPD compliance controls..."

    # Configure data retention policies
    aws s3api put-bucket-lifecycle-configuration \
        --bucket "austa-superapp-${ENVIRONMENT}" \
        --lifecycle-configuration file://configs/lifecycle-policy.json

    # Setup data access logging
    aws s3api put-bucket-logging \
        --bucket "austa-superapp-${ENVIRONMENT}" \
        --bucket-logging-status file://configs/logging-policy.json

    log "SUCCESS" "LGPD compliance controls configured successfully"
}

# Main execution function
main() {
    log "INFO" "Starting security setup for AUSTA SuperApp (${ENVIRONMENT})..."

    # Validate inputs and AWS credentials
    validate_inputs

    # Setup KMS keys
    setup_kms_keys

    # Configure WAF rules
    configure_waf_rules

    # Setup security monitoring
    setup_security_monitoring

    # Setup LGPD compliance if enabled
    if [[ "${LGPD_COMPLIANCE_MODE}" == "true" ]]; then
        setup_lgpd_compliance
    fi

    # Verify security configurations
    log "INFO" "Verifying security configurations..."
    
    # Check KMS key rotation
    aws kms get-key-rotation-status \
        --key-id "${KMS_KEY_ALIAS_PREFIX}/health-records" \
        --region ${AWS_REGION}

    # Check WAF rules
    aws wafv2 get-web-acl \
        --name "${ENVIRONMENT}-austa-superapp-waf" \
        --scope CLOUDFRONT \
        --region ${AWS_REGION}

    log "SUCCESS" "Security setup completed successfully for environment: ${ENVIRONMENT}"
}

# Execute main function
main "$@"