# VPS Orchestration Quick-Reference

Handoff reference for a Kilo CLI session running on VPS `187.77.3.56` using the `scripts/orchestrate.sh` wrapper.

---

## 1. Gateway Connection

- **HTTP:** `http://187.77.3.56:3002`
- **WebSocket:** `ws://187.77.3.56:3002`
- **Default sender:** All messages use `"from":"kilo"`

---

## 2. Available Agents

| Agent | Purpose | Response Type |
|-------|---------|---------------|
| `builder` | Code generation | `build_result` |
| `orchestrator` | Task coordination | `task_result` |
| `reviewer` | Code review | `test_result` |
| `monitor` | System health | `health_report` |
| `nvidia` | AI inference | `inference_result` |
| `azure-coordinator` | Azure cloud ops | `azure_result` |
| `fact_checker` | Fact verification | `fact_result` |

---

## 3. CLI Commands

All commands are run via `scripts/orchestrate.sh`. Configurable via `GATEWAY_URL` env var.

### send

Send a task to a specific agent.

```bash
scripts/orchestrate.sh send <agent> "<message>" [--type TYPE] [--command CMD] [--model MODEL] [--max-tokens N]
```

### broadcast

Send a message to all agents.

```bash
scripts/orchestrate.sh broadcast "<message>"
```

### status

Check gateway and agent status.

```bash
scripts/orchestrate.sh status
```

### poll

Poll for agent responses.

```bash
scripts/orchestrate.sh poll [--type TYPE] [--limit N] [--agent AGENT]
```

### workflow

Run a coordinated review-build workflow.

```bash
scripts/orchestrate.sh workflow review-build "<build-command>"
```

### Override gateway URL

```bash
GATEWAY_URL=http://custom-host:3002 scripts/orchestrate.sh status
```

---

## 4. API Endpoints (raw curl)

Direct HTTP equivalents if the script is unavailable.

### Send to agent

```bash
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"<agent>","message":"<msg>","type":"task_assignment"}'
```

### Broadcast

```bash
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"all","message":"<msg>","type":"chat"}'
```

### Health check

```bash
curl -s http://187.77.3.56:3002/health
```

### Builder task with command

```bash
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"builder","message":"build module X","type":"task_assignment","command":"<shell-cmd>"}'
```

### Reviewer task

```bash
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"reviewer","message":"review output","type":"task_assignment","command":"<shell-cmd>"}'
```

### NVIDIA inference

```bash
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"nvidia","message":"<prompt>","type":"task_assignment","model":"meta/llama-3.1-8b-instruct","maxTokens":200}'
```

### Poll responses by type

```bash
curl -s "http://187.77.3.56:3002/messages?limit=5&type=build_result"
curl -s "http://187.77.3.56:3002/messages?limit=5&type=test_result"
curl -s "http://187.77.3.56:3002/messages?limit=5&type=health_report"
curl -s "http://187.77.3.56:3002/messages?limit=5&type=inference_result"
curl -s "http://187.77.3.56:3002/messages?limit=5&type=task_result"
```

---

## 5. Response Polling Pattern

Send a task, then poll for the result:

```bash
# 1. Send task
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"builder","message":"build X","type":"task_assignment"}'

# 2. Poll for result
curl -s "http://187.77.3.56:3002/messages?limit=5&type=build_result"
```

Use `--limit` and `--agent` filters to narrow results. Poll iteratively until a matching response appears.

---

## 6. Known Issues

- **Gateway type conversion:** Failed `build_result` messages are not converted to `error` type by `kilo-gateway/server.js`. Check results manually — a failed build still arrives as `build_result`, not `error`.
- **Qdrant unhealthy:** The `snac_qdrant` container may show as unhealthy. May need a WAL corruption fix (restart or volume reset).

---

## 7. Session Reference

- **Shared Kilo session:** https://app.kilo.ai/s/b93e596d-4c2b-466f-9cca-1c1a4fb32d2c
- **Import command:**

```bash
kilo import https://app.kilo.ai/s/b93e596d-4c2b-466f-9cca-1c1a4fb32d2c
```
