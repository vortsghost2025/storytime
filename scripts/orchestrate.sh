#!/usr/bin/env bash
set -euo pipefail

# orchestrate.sh — CLI wrapper for kilo-gateway HTTP API
# Usage: scripts/orchestrate.sh <command> [options]

GATEWAY_URL="${GATEWAY_URL:-http://187.77.3.56:3002}"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Detect jq availability
HAS_JQ=false
if command -v jq &>/dev/null; then
	HAS_JQ=true
fi

# --- Helpers ---

json_pretty() {
	if $HAS_JQ; then
		jq .
	else
		cat
	fi
}

print_success() {
	echo -e "${GREEN}${BOLD}[OK]${RESET} $*"
}

print_error() {
	echo -e "${RED}${BOLD}[ERROR]${RESET} $*" >&2
}

print_pending() {
	echo -e "${YELLOW}${BOLD}[PENDING]${RESET} $*"
}

print_info() {
	echo -e "${CYAN}${BOLD}[INFO]${RESET} $*"
}

http_post() {
	local endpoint="$1"
	local data="$2"
	local url="${GATEWAY_URL}${endpoint}"
	local http_code body

	local response
	response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
		-H "Content-Type: application/json" \
		-d "$data" 2>&1) || {
		print_error "curl failed for POST ${endpoint}"
		return 1
	}

	http_code=$(echo "$response" | tail -n1)
	body=$(echo "$response" | sed '$d')

	if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
		print_success "HTTP ${http_code}"
		echo "$body" | json_pretty
		return 0
	else
		print_error "HTTP ${http_code}"
		echo "$body" | json_pretty >&2
		return 1
	fi
}

http_get() {
	local endpoint="$1"
	local url="${GATEWAY_URL}${endpoint}"
	local http_code body

	local response
	response=$(curl -s -w "\n%{http_code}" "$url" 2>&1) || {
		print_error "curl failed for GET ${endpoint}"
		return 1
	}

	http_code=$(echo "$response" | tail -n1)
	body=$(echo "$response" | sed '$d')

	if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
		echo "$body" | json_pretty
		return 0
	else
		print_error "HTTP ${http_code}"
		echo "$body" | json_pretty >&2
		return 1
	fi
}

# --- Commands ---

cmd_send() {
	local agent=""
	local message=""
	local msg_type="task_assignment"
	local command=""
	local model=""
	local max_tokens=""

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--type)
				msg_type="$2"
				shift 2
				;;
			--command)
				command="$2"
				shift 2
				;;
			--model)
				model="$2"
				shift 2
				;;
			--max-tokens)
				max_tokens="$2"
				shift 2
				;;
			-*)
				print_error "Unknown option: $1"
				return 1
				;;
			*)
				if [[ -z "$agent" ]]; then
					agent="$1"
				elif [[ -z "$message" ]]; then
					message="$1"
				else
					print_error "Unexpected argument: $1"
					return 1
				fi
				shift
				;;
		esac
	done

	if [[ -z "$agent" || -z "$message" ]]; then
		print_error "Usage: orchestrate.sh send <agent> \"<message>\" [--type TYPE] [--command CMD] [--model MODEL] [--max-tokens N]"
		return 1
	fi

	# Build JSON payload
	local json="{\"from\":\"kilo\",\"to\":\"${agent}\",\"message\":\"${message}\",\"type\":\"${msg_type}\"}"

	if [[ -n "$command" ]]; then
		json=$(echo "$json" | sed "s/}\$/,\"command\":\"${command}\"}/")
	fi
	if [[ -n "$model" ]]; then
		json=$(echo "$json" | sed "s/}\$/,\"model\":\"${model}\"}/")
	fi
	if [[ -n "$max_tokens" ]]; then
		json=$(echo "$json" | sed "s/}\$/,\"maxTokens\":${max_tokens}/")
	fi

	print_info "Sending to ${agent}: ${message}"
	http_post "/send" "$json"
}

cmd_broadcast() {
	local message="${1:-}"

	if [[ -z "$message" ]]; then
		print_error "Usage: orchestrate.sh broadcast \"<message>\""
		return 1
	fi

	local json="{\"from\":\"kilo\",\"to\":\"all\",\"message\":\"${message}\",\"type\":\"chat\"}"

	print_info "Broadcasting: ${message}"
	http_post "/send" "$json"
}

cmd_status() {
	print_info "Checking gateway health at ${GATEWAY_URL}"
	http_get "/health"
}

cmd_poll() {
	local msg_type=""
	local limit=5
	local agent=""

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--type)
				msg_type="$2"
				shift 2
				;;
			--limit)
				limit="$2"
				shift 2
				;;
			--agent)
				agent="$2"
				shift 2
				;;
			-*)
				print_error "Unknown option: $1"
				return 1
				;;
			*)
				print_error "Unexpected argument: $1"
				return 1
				;;
		esac
	done

	local query="limit=${limit}"
	if [[ -n "$msg_type" ]]; then
		query="${query}&type=${msg_type}"
	fi
	if [[ -n "$agent" ]]; then
		query="${query}&agent=${agent}"
	fi

	print_info "Polling messages (${query})"
	http_get "/messages?${query}"
}

cmd_workflow() {
	local workflow_name="${1:-}"
	local build_command="${2:-}"

	if [[ -z "$workflow_name" ]]; then
		print_error "Usage: orchestrate.sh workflow review-build \"<build-command>\""
		return 1
	fi

	case "$workflow_name" in
		review-build)
			if [[ -z "$build_command" ]]; then
				print_error "Missing build command for review-build workflow"
				return 1
			fi

			print_pending "Step 1/2: Sending build command to builder..."
			local send_json="{\"from\":\"kilo\",\"to\":\"builder\",\"message\":\"${build_command}\",\"type\":\"task_assignment\",\"command\":\"${build_command}\"}"
			http_post "/send" "$send_json" || {
				print_error "Failed to send to builder"
				return 1
			}

			print_pending "Step 1/2: Waiting for builder response..."
			local attempts=0
			local max_attempts=30
			local builder_result=""

			while [[ $attempts -lt $max_attempts ]]; do
				attempts=$((attempts + 1))
				sleep 2

				builder_result=$(curl -s "${GATEWAY_URL}/messages?limit=1&type=build_result" 2>/dev/null) || {
					continue
				}

				if $HAS_JQ; then
					local count
					count=$(echo "$builder_result" | jq 'length' 2>/dev/null) || continue
					if [[ "$count" -gt 0 ]]; then
						break
					fi
				else
					if echo "$builder_result" | grep -q '"type"'; then
						break
					fi
				fi

				print_pending "Waiting for builder... (${attempts}/${max_attempts})"
			done

			if [[ $attempts -ge $max_attempts ]]; then
				print_error "Timed out waiting for builder response"
				return 1
			fi

			print_success "Builder response received"
			echo "$builder_result" | json_pretty

			# Extract builder output for reviewer
			local review_input
			if $HAS_JQ; then
				review_input=$(echo "$builder_result" | jq -r '.[0].message // .[0].content // empty' 2>/dev/null)
			else
				review_input="$builder_result"
			fi

			if [[ -z "$review_input" ]]; then
				review_input="Review the builder output above"
			fi

			print_pending "Step 2/2: Sending to reviewer for review..."
			local review_json="{\"from\":\"kilo\",\"to\":\"reviewer\",\"message\":\"Review build output: ${review_input}\",\"type\":\"task_assignment\"}"
			http_post "/send" "$review_json" || {
				print_error "Failed to send to reviewer"
				return 1
			}

			print_success "Review-build workflow complete"
			;;
		*)
			print_error "Unknown workflow: ${workflow_name}"
			print_error "Available workflows: review-build"
			return 1
			;;
	esac
}

cmd_help() {
	cat <<'HELP'
orchestrate.sh — CLI wrapper for kilo-gateway HTTP API

USAGE
  orchestrate.sh <command> [options]

COMMANDS
  send <agent> "<message>"        Send a message/task to a specific agent
    [--type TYPE]                   Message type (default: task_assignment)
    [--command CMD]                 Shell command for the agent
    [--model MODEL]                 Model override (e.g. meta/llama-3.1-8b-instruct)
    [--max-tokens N]                Max tokens for inference

  broadcast "<message>"           Send a message to all agents

  status                          Check gateway health

  poll                            Check for agent responses
    [--type TYPE]                   Filter by response type
    [--limit N]                     Max messages (default: 5)
    [--agent AGENT]                 Filter by agent name

  workflow review-build "<cmd>"   Send to builder, then reviewer

OPTIONS
  -h, --help                      Show this help

ENVIRONMENT
  GATEWAY_URL                     Gateway URL (default: http://187.77.3.56:3002)

EXAMPLES
  orchestrate.sh status
  orchestrate.sh send monitor "ping"
  orchestrate.sh send nvidia "explain transformer" --model meta/llama-3.1-8b-instruct --max-tokens 200
  orchestrate.sh broadcast "system check"
  orchestrate.sh poll --type build_result --limit 3
  orchestrate.sh workflow review-build "npm run build"
HELP
}

# --- Main ---

if [[ $# -eq 0 ]]; then
	cmd_help
	exit 0
fi

command="$1"
shift

case "$command" in
	send)
		cmd_send "$@"
		;;
	broadcast)
		cmd_broadcast "$@"
		;;
	status)
		cmd_status
		;;
	poll)
		cmd_poll "$@"
		;;
	workflow)
		cmd_workflow "$@"
		;;
	-h | --help | help)
		cmd_help
		;;
	*)
		print_error "Unknown command: ${command}"
		cmd_help
		exit 1
		;;
esac
