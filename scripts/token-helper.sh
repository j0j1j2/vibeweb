#!/usr/bin/env bash
# Token Helper: receives auth code via HTTP, runs claude setup-token, returns OAuth token
# Runs on the HOST (not in Docker) to bypass Cloudflare
# Usage: ./scripts/token-helper.sh [port]

PORT=${1:-3004}
TENANTS_DIR="${DATA_DIR:-/tmp}/tenants"

echo "Token Helper listening on port $PORT"

while true; do
  # Simple HTTP server using nc
  RESPONSE=$(mktemp)
  REQUEST=$(mktemp)

  # Read HTTP request
  nc -l "$PORT" > "$REQUEST" &
  NC_PID=$!
  wait $NC_PID

  # Parse request
  BODY=$(tail -1 "$REQUEST")
  TENANT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tenantId',''))" 2>/dev/null)
  CODE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))" 2>/dev/null)

  if [ -z "$CODE" ] || [ -z "$TENANT_ID" ]; then
    echo '{"error":"missing code or tenantId"}' | nc -l "$PORT" &
    continue
  fi

  echo "Processing code for tenant $TENANT_ID..."

  # Run setup-token with expect
  TENANT_HOME="/tmp/claude-oauth-$TENANT_ID"
  mkdir -p "$TENANT_HOME"

  TOKEN=$(expect -c "
    set timeout 60
    set env(HOME) $TENANT_HOME
    spawn claude setup-token
    expect -re {Paste.code}
    send \"$CODE\r\"
    expect {
      -re {sk-ant-oat\S+} { puts \$expect_out(0,string) }
      timeout { puts ERROR }
    }
  " 2>/dev/null | grep "sk-ant-oat" | tr -d '\r\n')

  if [ -n "$TOKEN" ]; then
    # Save to tenant volume
    AUTH_DIR="$TENANTS_DIR/$TENANT_ID/claude-auth"
    mkdir -p "$AUTH_DIR"
    echo "$TOKEN" > "$AUTH_DIR/oauth-token"
    echo '{"hasCompletedOnboarding":true,"theme":"light"}' > "$AUTH_DIR/.claude.json"
    echo "{\"success\":true}" > "$RESPONSE"
  else
    echo "{\"error\":\"failed to get token\"}" > "$RESPONSE"
  fi

  rm -f "$REQUEST" "$RESPONSE"
done
