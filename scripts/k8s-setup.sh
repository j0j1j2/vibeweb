#!/bin/bash
set -e

CLUSTER_NAME=vibeweb
REGISTRY_NAME=vibeweb-registry
REGISTRY_PORT=5050

# Create registry if not exists
if ! k3d registry list 2>/dev/null | grep -q $REGISTRY_NAME; then
  echo "Creating registry..."
  k3d registry create $REGISTRY_NAME --port $REGISTRY_PORT
fi

# Create cluster if not exists
if ! k3d cluster list 2>/dev/null | grep -q $CLUSTER_NAME; then
  echo "Creating cluster..."
  k3d cluster create $CLUSTER_NAME \
    --registry-use k3d-$REGISTRY_NAME:$REGISTRY_PORT \
    --port "80:80@loadbalancer" \
    --port "8080:8080@loadbalancer" \
    --agents 0 \
    --k3s-arg "--disable=traefik@server:0"

  echo "Installing Traefik via Helm..."
  helm repo add traefik https://traefik.github.io/charts 2>/dev/null || true
  helm repo update
  helm install traefik traefik/traefik -n kube-system \
    --set ports.web.expose.default=true \
    --set service.type=LoadBalancer \
    --set providers.kubernetesCRD.enabled=true \
    --set providers.kubernetesCRD.allowCrossNamespace=true
fi

echo "Cluster '$CLUSTER_NAME' ready. Registry at localhost:$REGISTRY_PORT"
