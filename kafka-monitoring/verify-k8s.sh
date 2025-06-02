#!/bin/bash

# Verify Kubernetes is ready for deployment

echo "🔍 Checking Docker Desktop Kubernetes..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed"
    exit 1
fi

# Check cluster info
if kubectl cluster-info &> /dev/null; then
    echo "✅ Kubernetes is running!"
    echo ""
    echo "📊 Cluster Info:"
    kubectl cluster-info | head -n 2
    echo ""
    echo "📊 Nodes:"
    kubectl get nodes
    echo ""
    echo "📊 Current context:"
    kubectl config current-context
    echo ""
    echo "✅ Ready to deploy! Run: ./deploy.sh"
else
    echo "❌ Kubernetes is not running"
    echo ""
    echo "To enable Kubernetes in Docker Desktop:"
    echo "1. Open Docker Desktop"
    echo "2. Go to Settings → Kubernetes"
    echo "3. Check 'Enable Kubernetes'"
    echo "4. Click 'Apply & Restart'"
    echo "5. Wait 2-5 minutes for Kubernetes to start"
    exit 1
fi