#!/usr/bin/env bash
# scripts/smoke-test.sh
set -euo pipefail

API="http://localhost:1919"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== VibeWeb Smoke Test ==="
echo ""

# 1. Health check
echo "1. Health check..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/health")
[ "$STATUS" = "200" ] && pass "Control API is healthy" || fail "Control API health check (got $STATUS)"

# 2. Create tenant
echo "2. Creating tenant 'testsite'..."
TENANT=$(curl -s -X POST "$API/tenants" \
  -H "Content-Type: application/json" \
  -d '{"subdomain":"testsite","name":"Test Site"}')
TENANT_ID=$(echo "$TENANT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
[ -n "$TENANT_ID" ] && pass "Tenant created: $TENANT_ID" || fail "Tenant creation failed"

# 3. Get tenant
echo "3. Getting tenant..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/tenants/$TENANT_ID")
[ "$STATUS" = "200" ] && pass "Tenant retrieved" || fail "Get tenant (got $STATUS)"

# 4. Access tenant site via subdomain
echo "4. Accessing tenant site via subdomain..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: testsite.vibeweb.localhost" "http://localhost")
[ "$STATUS" = "200" ] && pass "Site accessible via subdomain" || fail "Subdomain access (got $STATUS)"

# 5. Verify default index.html content
echo "5. Checking default page content..."
BODY=$(curl -s -H "Host: testsite.vibeweb.localhost" "http://localhost")
echo "$BODY" | grep -q "Welcome to your site" && pass "Default page served" || fail "Default page content"

# 6. Tenant status
echo "6. Checking tenant status..."
STATUS_BODY=$(curl -s "$API/tenants/$TENANT_ID/status")
echo "$STATUS_BODY" | grep -q '"has_preview":false' && pass "Status correct" || fail "Status check"

# 7. Delete tenant
echo "7. Deleting tenant..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/tenants/$TENANT_ID")
[ "$STATUS" = "204" ] && pass "Tenant deleted" || fail "Tenant deletion (got $STATUS)"

# 8. Verify deleted tenant subdomain returns 404
echo "8. Verifying deleted tenant returns 404..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: testsite.vibeweb.localhost" "http://localhost")
[ "$STATUS" = "404" ] && pass "Deleted tenant returns 404" || fail "Deleted tenant still accessible (got $STATUS)"

echo ""
echo "=== All smoke tests passed! ==="
