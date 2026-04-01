#!/bin/bash
set -e

REGISTRY=localhost:5050

echo "=== Building packages ==="
npx pnpm -r build

echo "=== Building and pushing images ==="
for svc in control-api function-runner preview-server agent-service; do
  echo "Building $svc..."
  docker build -t $REGISTRY/vibeweb-$svc:latest -f packages/$svc/Dockerfile .
  docker push $REGISTRY/vibeweb-$svc:latest
done

echo "Building console..."
docker build -t $REGISTRY/vibeweb-console:latest -f packages/console/Dockerfile .
docker push $REGISTRY/vibeweb-console:latest

echo "Building runner image..."
docker build -t $REGISTRY/vibeweb-runner:node20 runner-image/
docker push $REGISTRY/vibeweb-runner:node20

echo "Building session image..."
docker build -t $REGISTRY/vibeweb-session:latest session-image/
docker push $REGISTRY/vibeweb-session:latest

echo "=== Applying K8s manifests ==="
kubectl apply -f k8s/namespace.yaml
sleep 1
kubectl apply -f k8s/

echo "=== Restarting deployments ==="
kubectl rollout restart deployment -n vibeweb

echo "=== Waiting for rollout ==="
kubectl rollout status deployment -n vibeweb --timeout=120s

echo "=== Done ==="
kubectl get pods -n vibeweb
