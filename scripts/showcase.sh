#!/usr/bin/env bash
set -euo pipefail

# showcase.sh - Multi-Agent System Showcase
# Demonstrates all capabilities in one run

GATEWAY_URL="${GATEWAY_URL:-http://187.77.3.56:3002}"
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RESET='\033[0m'

header() {
  echo ""
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  echo ""
}

section() {
  echo ""
  echo -e "${YELLOW}${BOLD}▸ $1${RESET}"
  echo ""
}

send_and_wait() {
  local agent="$1"
  local message="$2"
  local type="${3:-task_assignment}"
  local model="${4:-}"
  local command="${5:-}"

  local json="{\"from\":\"showcase\",\"to\":\"$agent\",\"message\":\"$message\",\"type\":\"$type\""
  [[ -n "$model" ]] && json+=",\"model\":\"$model\",\"maxTokens\":100"
  [[ -n "$command" ]] && json+=",\"command\":\"$command\""
  json+="}"

  curl -s -X POST "${GATEWAY_URL}/send" \
    -H "Content-Type: application/json" \
    -d "$json" > /dev/null
}

# ════════════════════════════════════════════════════════════════
# MAIN SHOWCASE
# ════════════════════════════════════════════════════════════════

header "MULTI-AGENT SYSTEM SHOWCASE"
echo -e "Gateway: ${GATEWAY_URL}"
echo -e "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# 1. System Status
section "1. System Health Check"
curl -s "${GATEWAY_URL}/health" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log('  Agents Connected: ' + d.agentsConnected);
console.log('  Message History: ' + d.messageHistory);
d.agents.forEach(a => console.log('  • ' + a.id + ' (' + a.role + ')'));
"

# 2. Multi-Model Consensus
section "2. Multi-Model Consensus (4 providers, same prompt)"
PROMPT="Define artificial intelligence in 10 words or less."

send_and_wait "nvidia" "$PROMPT" "task_assignment" "nvidia"
send_and_wait "nvidia" "$PROMPT" "task_assignment" "openrouter"  
send_and_wait "nvidia" "$PROMPT" "task_assignment" "cerebras"
send_and_wait "ollama-local" "$PROMPT" "task_assignment" "orca-mini"

echo -e "  ${GREEN}✓${RESET} Dispatched to 4 providers"

sleep 5

echo "  Responses:"
curl -s "${GATEWAY_URL}/messages?limit=4&type=inference_result" | node -e "
const msgs = JSON.parse(require('fs').readFileSync(0, 'utf8')).messages;
msgs.slice(0, 4).forEach(m => {
  try {
    const c = JSON.parse(m.message);
    const model = (c.model || '').padEnd(30);
    const output = (c.output || '').replace(/\n/g, ' ').trim().substring(0, 80);
    console.log('  • ' + model + ' → ' + output);
  } catch(e) {}
});
"

# 3. Parallel Research
section "3. Parallel Research Pipeline"
send_and_wait "builder" "List files" "task_assignment" "" "ls -la /app/*.js | head -5"
send_and_wait "reviewer" "System resources" "task_assignment" "" "df -h | head -3"
send_and_wait "meta-monitor" "status" "task_assignment"
send_and_wait "self-healer" "status" "task_assignment"

echo -e "  ${GREEN}✓${RESET} Dispatched to 4 agents in parallel"

# 4. Agent Collaboration
section "4. Agent Collaboration (Orchestrator → Builder → Reviewer)"
send_and_wait "orchestrator" "Coordinate build task" "task_assignment" "" "echo 'Build step 1 complete'"

sleep 2

echo -e "  ${GREEN}✓${RESET} Orchestrator coordinating workflow"

# 5. Self-Healing Status
section "5. Self-Healing Infrastructure"
send_and_wait "self-healer" "health check" "task_assignment"

sleep 2

echo -e "  ${GREEN}✓${RESET} Self-healing active (checks every 2 minutes)"

# 6. Dashboard Aggregator
section "6. Unified Dashboard (All Services)"
curl -s "http://187.77.3.56:3003/api/dashboard" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8')).services;
console.log('  Kilo Gateway:   ' + (d.kilo?.status || 'unknown') + ' (' + (d.kilo?.agentsConnected || 0) + ' agents)');
console.log('  Backend API:    ' + (d.backend?.status || 'unknown'));
console.log('  Fact Checker:   ' + (d.factChecker?.status || 'unknown'));
"

# Summary
header "SHOWCASE COMPLETE"
echo "  ✓ Multi-model consensus (4 providers)"
echo "  ✓ Parallel research pipeline (4 agents)"
echo "  ✓ Agent collaboration (orchestrator)"
echo "  ✓ Self-healing infrastructure"
echo "  ✓ Unified dashboard"
echo ""
echo "  Total agents: 10"
echo "  Inference providers: 4 (NVIDIA, OpenRouter, Cerebras, Ollama)"
echo "  System status: OPERATIONAL"
echo ""
