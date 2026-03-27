#!/usr/bin/env bash
# Smoke test for the Agent Service (requires ANTHROPIC_API_KEY)
set -euo pipefail

API="http://localhost:1919"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== Agent Service Smoke Test ==="
echo ""

# 1. Health check
echo "1. Agent Service health check..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3003/health")
[ "$STATUS" = "200" ] && pass "Agent Service is healthy" || fail "Agent health check (got $STATUS)"

# 2. Create a test tenant
echo "2. Creating test tenant..."
TENANT=$(curl -s -X POST "$API/tenants" \
  -H "Content-Type: application/json" \
  -d '{"subdomain":"agenttest","name":"Agent Test"}')
TENANT_ID=$(echo "$TENANT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
[ -n "$TENANT_ID" ] && pass "Tenant created: $TENANT_ID" || fail "Tenant creation"

# 3. Check OAuth status (should be not connected)
echo "3. Checking OAuth status..."
OAUTH=$(curl -s "$API/tenants/$TENANT_ID/auth/claude/status")
echo "$OAUTH" | grep -q '"connected":false' && pass "OAuth not connected (expected)" || fail "OAuth status"

echo ""
echo "=== Agent smoke test passed! ==="
echo ""
echo "To test a full session, ensure ANTHROPIC_API_KEY is set and use a WebSocket client:"
echo "  wscat -c ws://localhost:3003/ws"
echo '  > {"type":"session.start","tenantId":"'"$TENANT_ID"'"}'

# Cleanup
curl -s -X DELETE "$API/tenants/$TENANT_ID" > /dev/null
