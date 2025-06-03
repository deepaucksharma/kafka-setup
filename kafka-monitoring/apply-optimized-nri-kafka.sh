#!/bin/bash

# Script to apply optimized nri-kafka configuration

set -e

echo "🔧 Applying Optimized NRI-Kafka Configuration"
echo "============================================="

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if we're in the right directory
if [ ! -f "deploy.sh" ]; then
    echo "❌ Error: Script directory issue"
    exit 1
fi

# Check if optimized template exists
if [ ! -f "templates/03-newrelic-configmap-optimized.yaml.tmpl" ]; then
    echo "❌ Error: Optimized template not found"
    exit 1
fi

# Backup current configuration
echo "📦 Backing up current configuration..."
kubectl get configmap newrelic-config -n kafka-monitoring -o yaml > backups/newrelic-config-backup-$(date +%Y%m%d-%H%M%S).yaml 2>/dev/null || {
    echo "⚠️  Warning: Could not backup current config (might not exist yet)"
    mkdir -p backups
}

# Backup current template
echo "📋 Backing up current template..."
cp templates/03-newrelic-configmap.yaml.tmpl backups/03-newrelic-configmap-backup-$(date +%Y%m%d-%H%M%S).yaml.tmpl

# Apply optimized template
echo "🚀 Applying optimized template..."
cp templates/03-newrelic-configmap-optimized.yaml.tmpl templates/03-newrelic-configmap.yaml.tmpl

# Source environment if exists
if [ -f ".env" ]; then
    echo "📄 Loading environment variables..."
    source .env
else
    echo "⚠️  Warning: .env file not found, using defaults"
fi

# Generate new configuration
echo "🔨 Generating new configuration..."
./deploy.sh generate

# Apply to Kubernetes
echo "☸️  Applying to Kubernetes..."
kubectl apply -f generated/03-newrelic-configmap.yaml

# Get the New Relic pod name
NR_POD=$(kubectl get pods -n kafka-monitoring -l name=newrelic-infrastructure -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$NR_POD" ]; then
    echo "🔄 Restarting New Relic Infrastructure pod..."
    kubectl delete pod $NR_POD -n kafka-monitoring
    
    echo "⏳ Waiting for new pod to be ready..."
    kubectl wait --for=condition=ready pod -l name=newrelic-infrastructure -n kafka-monitoring --timeout=120s 2>/dev/null || {
        echo "⚠️  Warning: New Relic pod might not be running yet"
    }
fi

echo ""
echo "✅ Optimized NRI-Kafka configuration applied!"
echo ""
echo "📊 To verify the configuration:"
echo "1. Check pod logs:"
echo "   kubectl logs -n kafka-monitoring -l name=newrelic-infrastructure | grep nri-kafka"
echo ""
echo "2. List all topics being monitored:"
echo "   kubectl exec -n kafka-monitoring deployment/kafka-comprehensive-simulator -- kafka-topics --list --bootstrap-server kafka-0.kafka:9092"
echo ""
echo "3. List all consumer groups:"
echo "   kubectl exec -n kafka-monitoring deployment/kafka-comprehensive-simulator -- kafka-consumer-groups --list --bootstrap-server kafka-0.kafka:9092"
echo ""
echo "4. Check New Relic for data (wait 2-3 minutes):"
echo "   - Go to New Relic One"
echo "   - Navigate to Infrastructure > Third-party services > Kafka"
echo "   - Or run NRQL: FROM KafkaTopicSample SELECT uniqueCount(topic) WHERE clusterName = 'kafka-k8s-cluster' SINCE 10 minutes ago"
echo ""
echo "📚 For more details, see NRI_KAFKA_CONFIGURATION_GUIDE.md"