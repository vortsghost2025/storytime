# Kilo Orchestration Command Pack (Working Implementation)

## Actual Gateway API Mapping

The conceptual commands from Pilot map to these real HTTP calls:

### Basic Commands

```bash
# send agent=<name> "message"
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"<agent>","message":"<msg>","type":"task_assignment"}'

# broadcast "message"  
curl -X POST http://187.77.3.56:3002/send \
  -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"all","message":"<msg>","type":"chat"}'

# gateway "health"
curl -s http://187.77.3.56:3002/health
```

### Agent-Specific Tasks

```bash
# Builder
curl -X POST http://187.77.3.56:3002/send -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"builder","message":"build module X","type":"task_assignment","command":"<shell-cmd>"}'

# Reviewer  
curl -X POST http://187.77.3.56:3002/send -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"reviewer","message":"review output","type":"task_assignment","command":"<shell-cmd>"}'

# Monitor
curl -X POST http://187.77.3.56:3002/send -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"monitor","message":"status","type":"task_assignment"}'

# NVIDIA
curl -X POST http://187.77.3.56:3002/send -H "Content-Type: application/json" \
  -d '{"from":"kilo","to":"nvidia","message":"<prompt>","type":"task_assignment","model":"meta/llama-3.1-8b-instruct","maxTokens":200}'
```

### Response Types

| Agent | Response Type | Check Command |
|-------|---------------|---------------|
| builder | build_result | `curl -s "http://187.77.3.56:3002/messages?limit=5&type=build_result"` |
| reviewer | test_result | `curl -s "http://187.77.3.56:3002/messages?limit=5&type=test_result"` |
| monitor | health_report | `curl -s "http://187.77.3.56:3002/messages?limit=5&type=health_report"` |
| nvidia | inference_result | `curl -s "http://187.77.3.56:3002/messages?limit=5&type=inference_result"` |
| orchestrator | task_result | `curl -s "http://187.77.3.56:3002/messages?limit=5&type=task_result"` |

