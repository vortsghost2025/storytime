# VPS Integration Plan - Connect All Disconnected Pieces

## Current State: Disconnected Components

### Working
- kilo-gateway (:3002) - WebSocket hub, 7 agents connected
- dashboard (:3002/dashboard) - Shows agent status
- nginx (:80) - Serves SNAC IDE frontend
- snac_backend - Python API
- snac_db (postgres), snac_redis, snac_qdrant (unhealthy)

### Disconnected Files
| File | Purpose | Status |
|------|---------|--------|
| orchestration.js | Express routes for orchestration | Not mounted |
| MailStore.js | SQLite mail system | Missing better-sqlite3 |
| Mesh.js | Cognitive mesh | Missing storage/swarm modules |
| dashboard-aggregator.js | Aggregates all services | Not running |
| tracing.js | Event tracing | Not connected |
| vpsAiIntegration.js | AI integration | Not connected |

### Missing Dependencies
- express (for orchestration.js)
- better-sqlite3 (for MailStore.js)
- uuid (for MailStore.js)

### Missing Modules (for Mesh.js)
- storage/HotStore.js
- storage/WarmStore.js
- storage/ColdArchive.js
- swarm/SwarmOrchestrator.js
- swarm/HealthMonitor.js
- Bootstrap.js
- Pipelines.js
- QuantizationManager.js
- agents/metabolismAddon.js

## Integration Plan (Phased)

### Phase 1: Wire dashboard-aggregator.js (Quick Win)
This file is simple and can aggregate data from all services.

```bash
# Install axios (already in package.json)
# Create a simple server to run it
# Connect to gateway at :3002
```

### Phase 2: Create simplified orchestration server
Instead of the full Mesh.js (which needs many missing modules), create a simple Express server that:
- Mounts orchestration.js routes
- Connects to the gateway
- Provides REST API for agent management

### Phase 3: Connect fact_checker to agent network
The fact_checker is running on :4000 but not connected to the gateway as an agent.

### Phase 4: Fix Qdrant health
Qdrant is unhealthy - likely WAL corruption again.

### Phase 5: Fix IDE at :8080
The IDE at :8080 is not responding.

### Phase 6: Create unified dashboard
Merge the gateway dashboard with the SNAC IDE to show everything in one place.

## Recommended Approach

Skip Mesh.js - it's too complex and has too many missing dependencies. Instead:

1. **Wire dashboard-aggregator.js** - Simple, immediate value
2. **Create orchestration-server.js** - Lightweight Express server
3. **Connect fact_checker as agent** - Extend the agent network
4. **Fix Qdrant** - Quick fix
5. **Fix IDE** - May need container restart
6. **Create unified view** - Link dashboards together

## Agent Automation for Continuous Improvement

Create a "meta-agent" that:
1. Monitors all services
2. Detects disconnections
3. Reports issues
4. Suggests fixes
5. Can execute simple repairs

This agent would use the monitor agent to check health and the orchestrator to coordinate fixes.

