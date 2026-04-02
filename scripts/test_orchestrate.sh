#!/usr/bin/env bash
set -euo pipefail

# test_orchestrate.sh — Tests for scripts/orchestrate.sh
# Tests JSON construction, argument parsing, and command routing.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORCHESTRATE="${SCRIPT_DIR}/orchestrate.sh"

PASS=0
FAIL=0
TOTAL=0

assert_eq() {
	local desc="$1"
	local expected="$2"
	local actual="$3"
	TOTAL=$((TOTAL + 1))
	if [[ "$expected" == "$actual" ]]; then
		PASS=$((PASS + 1))
		echo "  OK: ${desc}"
	else
		FAIL=$((FAIL + 1))
		echo "  FAIL: ${desc}"
		echo "    expected: ${expected}"
		echo "    actual:   ${actual}"
	fi
}

assert_contains() {
	local desc="$1"
	local needle="$2"
	local haystack="$3"
	TOTAL=$((TOTAL + 1))
	if echo "$haystack" | grep -qF "$needle"; then
		PASS=$((PASS + 1))
		echo "  OK: ${desc}"
	else
		FAIL=$((FAIL + 1))
		echo "  FAIL: ${desc}"
		echo "    expected to contain: ${needle}"
		echo "    actual: ${haystack}"
	fi
}

assert_not_contains() {
	local desc="$1"
	local needle="$2"
	local haystack="$3"
	TOTAL=$((TOTAL + 1))
	if ! echo "$haystack" | grep -qF "$needle"; then
		PASS=$((PASS + 1))
		echo "  OK: ${desc}"
	else
		FAIL=$((FAIL + 1))
		echo "  FAIL: ${desc}"
		echo "    expected NOT to contain: ${needle}"
		echo "    actual: ${haystack}"
	fi
}

assert_exit_code() {
	local desc="$1"
	local expected_code="$2"
	shift 2
	TOTAL=$((TOTAL + 1))
	local actual_code=0
	"$@" >/dev/null 2>&1 || actual_code=$?
	if [[ "$expected_code" -eq "$actual_code" ]]; then
		PASS=$((PASS + 1))
		echo "  OK: ${desc}"
	else
		FAIL=$((FAIL + 1))
		echo "  FAIL: ${desc}"
		echo "    expected exit code: ${expected_code}"
		echo "    actual exit code:   ${actual_code}"
	fi
}

# Source helper functions for direct testing
# We extract just the functions by creating a wrapper
source_helpers() {
	eval "$(sed -n '/^HAS_JQ/,/^# --- Commands ---/p' "$ORCHESTRATE" | grep -v '^# --- Commands ---')"
	HAS_JQ=false  # Force fallback for predictable testing
}

echo "--- JSON Construction Tests ---"

source_helpers

# Test 1: Basic json_obj produces valid JSON
result=$(json_obj from kilo to builder message "hello world" type task_assignment)
assert_eq "json_obj basic" '{"from":"kilo","to":"builder","message":"hello world","type":"task_assignment"}' "$result"

# Test 2: json_obj escapes double quotes (injection prevention)
result=$(json_obj from kilo to builder message 'say "hello"' type chat)
assert_contains "json_obj escapes quotes" '\"hello\"' "$result"
assert_not_contains "json_obj no raw quotes" ',"say "hello""' "$result"

# Test 3: json_obj escapes backslashes (injection prevention)
result=$(json_obj from kilo to builder message 'path\to\file' type chat)
assert_contains "json_obj escapes backslashes" 'path\\to\\file' "$result"

# Test 4: json_obj escapes JSON injection attempt
result=$(json_obj from kilo to builder message 'test","injected":"value' type chat)
assert_not_contains "json_obj blocks injection" '"injected":"value"' "$result"

# Test 5: json_send_obj basic fields
result=$(json_send_obj from kilo to agent1 message "test" type task_assignment)
assert_eq "json_send_obj basic" '{"from":"kilo","to":"agent1","message":"test","type":"task_assignment"}' "$result"

# Test 6: json_send_obj maxTokens is numeric (no quotes around value)
result=$(json_send_obj from kilo to agent1 message "test" type task_assignment maxTokens 512)
assert_contains "json_send_obj maxTokens numeric" '"maxTokens":512' "$result"
assert_not_contains "json_send_obj maxTokens not string" '"maxTokens":"512"' "$result"

# Test 7: json_send_obj all optional fields together (one-pass fix)
result=$(json_send_obj from kilo to agent1 message "run build" type task_assignment command "npm run build" model "llama-3" maxTokens 512)
assert_contains "json_send_obj has command" '"command":"npm run build"' "$result"
assert_contains "json_send_obj has model" '"model":"llama-3"' "$result"
assert_contains "json_send_obj has maxTokens" '"maxTokens":512' "$result"

# Test 8: json_send_obj optional fields with special chars
result=$(json_send_obj from kilo to agent1 message "test" type task_assignment command 'echo "hi"' maxTokens 100)
assert_contains "json_send_obj command with quotes" 'echo \"hi\"' "$result"
assert_contains "json_send_obj command maxTokens" '"maxTokens":100' "$result"

echo ""
echo "--- Argument Parsing Tests ---"

# Test 9: No args shows help
output=$("$ORCHESTRATE" 2>&1)
assert_contains "no args shows help" "USAGE" "$output"

# Test 10: --help shows help
output=$("$ORCHESTRATE" --help 2>&1)
assert_contains "--help shows help" "USAGE" "$output"

# Test 11: send without args shows usage error
output=$("$ORCHESTRATE" send 2>&1 || true)
assert_contains "send no args shows usage" "Usage:" "$output"

# Test 12: send with only agent shows usage error
output=$("$ORCHESTRATE" send agent1 2>&1 || true)
assert_contains "send one arg shows usage" "Usage:" "$output"

# Test 13: broadcast without message shows usage error
output=$("$ORCHESTRATE" broadcast 2>&1 || true)
assert_contains "broadcast no args shows usage" "Usage:" "$output"

# Test 14: unknown command shows error
output=$("$ORCHESTRATE" nonexistent 2>&1 || true)
assert_contains "unknown command shows error" "Unknown command" "$output"

# Test 15: send with unknown option shows error
output=$("$ORCHESTRATE" send agent1 "test" --bad-opt 2>&1 || true)
assert_contains "send unknown option shows error" "Unknown option" "$output"

# Test 16: send with too many positional args
output=$("$ORCHESTRATE" send agent1 "msg" extra 2>&1 || true)
assert_contains "send extra args shows error" "Unexpected argument" "$output"

echo ""
echo "--- Command Routing Tests ---"

# Test 17: status command attempts HTTP (will fail without gateway, but confirms routing)
output=$("$ORCHESTRATE" status 2>&1 || true)
assert_contains "status command routed" "Checking gateway health" "$output"

# Test 18: poll command with options
output=$("$ORCHESTRATE" poll --type build_result --limit 3 2>&1 || true)
assert_contains "poll command routed" "Polling messages" "$output"
assert_contains "poll shows query params" "limit=3" "$output"
assert_contains "poll shows type filter" "type=build_result" "$output"

# Test 19: send command attempts HTTP POST (will fail, but confirms routing)
output=$("$ORCHESTRATE" send agent1 "test message" 2>&1 || true)
assert_contains "send command routed" "Sending to agent1" "$output"

# Test 20: broadcast command attempts HTTP POST
output=$("$ORCHESTRATE" broadcast "system check" 2>&1 || true)
assert_contains "broadcast command routed" "Broadcasting: system check" "$output"

# Test 21: workflow with unknown name
output=$("$ORCHESTRATE" workflow unknown-flow 2>&1 || true)
assert_contains "unknown workflow shows error" "Unknown workflow" "$output"

# Test 22: workflow review-build missing command
output=$("$ORCHESTRATE" workflow review-build 2>&1 || true)
assert_contains "review-build missing cmd shows error" "Missing build command" "$output"

echo ""
echo "=== Results: ${PASS}/${TOTAL} passed, ${FAIL} failed ==="

if [[ $FAIL -gt 0 ]]; then
	exit 1
fi
