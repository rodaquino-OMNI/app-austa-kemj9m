#!/bin/bash

# Set strict error handling
set -e -u -o pipefail

# Global variables
MONITORING_NAMESPACE="monitoring"
HELM_RELEASE_NAME="austa-monitoring"
PROMETHEUS_VERSION="19.0.0"
GRAFANA_VERSION="10.0.0"
ALERTMANAGER_VERSION="1.5.0"
PHI_RETENTION_DAYS="2555"  # 7 years for HIPAA compliance
COMPLIANCE_CHECK_INTERVAL="300"
SECURE_METRICS_PORT="9091"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling
handle_error() {
    log "ERROR: An error occurred on line $1"
    cleanup
    exit 1
}

trap 'handle_error $LINENO' ERR

# Cleanup function
cleanup() {
    log "Performing cleanup..."
    kubectl delete --ignore-not-found=true configmap temp-configs -n "$MONITORING_NAMESPACE"
}

# Validate prerequisites
validate_prerequisites() {
    log "Validating prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log "ERROR: kubectl is required but not installed"
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        log "ERROR: helm is required but not installed"
        exit 1
    }

    # Verify cluster access
    if ! kubectl auth can-i create namespace &> /dev/null; then
        log "ERROR: Insufficient cluster permissions"
        exit 1
    }
}

# Setup monitoring namespace with HIPAA-compliant configurations
setup_monitoring_namespace() {
    log "Creating monitoring namespace with HIPAA-compliant configurations..."
    
    # Create namespace with security labels
    kubectl create namespace "$MONITORING_NAMESPACE" --dry-run=client -o yaml | \
    kubectl apply -f - 

    # Apply HIPAA-compliant network policies
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: monitoring-network-policy
  namespace: $MONITORING_NAMESPACE
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          compliance: hipaa
    ports:
    - port: $SECURE_METRICS_PORT
      protocol: TCP
EOF

    # Apply resource quotas
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata:
  name: monitoring-quota
  namespace: $MONITORING_NAMESPACE
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
EOF
}

# Install and configure Prometheus with healthcare-specific monitoring
install_prometheus() {
    log "Installing Prometheus with healthcare monitoring configurations..."

    # Add Prometheus helm repository
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    # Create Prometheus values file with HIPAA compliance settings
    cat <<EOF > prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: "${PHI_RETENTION_DAYS}d"
    securityContext:
      runAsNonRoot: true
      runAsUser: 65534
    serviceMonitorSelector:
      matchLabels:
        compliance: hipaa
    additionalScrapeConfigs:
      - job_name: 'phi-access-monitoring'
        metrics_path: '/metrics'
        scheme: 'https'
        tls_config:
          cert_file: /etc/prometheus/certs/client.crt
          key_file: /etc/prometheus/certs/client.key
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_phi_data]
            action: keep
            regex: true

alertmanager:
  alertmanagerSpec:
    retention: 120h
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi

grafana:
  adminPassword: "${GRAFANA_ADMIN_PASSWORD:-$(openssl rand -base64 32)}"
  persistence:
    enabled: true
    size: 10Gi
  dashboards:
    default:
      austa-dashboard:
        json: |
          $(cat ../../../src/backend/monitoring/grafana-dashboard.json | sed 's/"/\\"/g')
  
  sidecar:
    dashboards:
      enabled: true
      searchNamespace: $MONITORING_NAMESPACE

  plugins:
    - grafana-piechart-panel
    - grafana-worldmap-panel
    - grafana-clock-panel

security:
  encryption:
    enabled: true
    provider: "kubernetes"
  audit:
    enabled: true
    logFormat: "json"
    retention: "${PHI_RETENTION_DAYS}d"
EOF

    # Install Prometheus stack with healthcare configurations
    helm upgrade --install "$HELM_RELEASE_NAME" prometheus-community/kube-prometheus-stack \
        --namespace "$MONITORING_NAMESPACE" \
        --version "$PROMETHEUS_VERSION" \
        --values prometheus-values.yaml \
        --set prometheus.prometheusSpec.retention="${PHI_RETENTION_DAYS}d" \
        --set prometheus.prometheusSpec.securityContext.runAsNonRoot=true \
        --set alertmanager.alertmanagerSpec.retention=120h \
        --wait
}

# Configure Grafana with healthcare-specific dashboards
configure_grafana() {
    log "Configuring Grafana with healthcare-specific dashboards..."

    # Wait for Grafana pod to be ready
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/name=grafana \
        -n "$MONITORING_NAMESPACE" \
        --timeout=300s

    # Apply HIPAA-compliant configurations
    kubectl create configmap grafana-hipaa-config \
        --from-file=../../../src/backend/monitoring/grafana-dashboard.json \
        -n "$MONITORING_NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
}

# Setup Alertmanager with PHI access alerts
configure_alertmanager() {
    log "Configuring Alertmanager with PHI access alerts..."

    # Apply Alertmanager configuration
    kubectl create configmap alertmanager-config \
        --from-file=../../../src/backend/monitoring/alerting-rules.yml \
        -n "$MONITORING_NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
}

# Verify monitoring stack deployment
verify_deployment() {
    log "Verifying monitoring stack deployment..."

    # Check Prometheus deployment
    if ! kubectl get deploy -n "$MONITORING_NAMESPACE" | grep -q prometheus; then
        log "ERROR: Prometheus deployment not found"
        exit 1
    fi

    # Check Grafana deployment
    if ! kubectl get deploy -n "$MONITORING_NAMESPACE" | grep -q grafana; then
        log "ERROR: Grafana deployment not found"
        exit 1
    fi

    # Verify HIPAA compliance settings
    if ! kubectl get networkpolicy -n "$MONITORING_NAMESPACE" | grep -q monitoring-network-policy; then
        log "ERROR: HIPAA-compliant network policies not found"
        exit 1
    }
}

# Main execution
main() {
    log "Starting monitoring setup for AUSTA SuperApp platform..."
    
    validate_prerequisites
    setup_monitoring_namespace
    install_prometheus
    configure_grafana
    configure_alertmanager
    verify_deployment

    log "Monitoring stack setup completed successfully"
}

# Execute main function
main