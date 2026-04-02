# Repository Comparison & Project Map

## Executive Summary

You have **3 GitHub repos** and **1 VPS deployment** that represent different aspects of the same project ecosystem. They are NOT duplicates - each serves a distinct purpose in your multi-agent AI system.

---

## Repository Identity Matrix

| Location | Name | Purpose | Status |
|----------|------|---------|--------|
| **Local** `C:\Users\seand\source\repos\overstory` | `storytime` | Overstory agent orchestration framework (Claude Code) | Active - this repo |
| **GitHub** `vortsghost2025/storytime` | storytime | Overstory agent orchestration framework | Source of truth for local |
| **GitHub** `vortsghost2025/supreme-octo-computing-machine` | supreme-octo-computing-machine | SNAC-v2 infrastructure & deployment configs | Deployed to VPS |
| **GitHub** `vortsghost2025/snac-v2` | snac-v2 | Original SNAC agent system code & experiments | Development history |
| **VPS** `/opt/snac-v2` | (no remote) | Running deployment with 15 containers | Live system |

---

## What Each Repository Contains

### 1. `storytime` (Local + GitHub)
**Purpose:** Overstory - A project-agnostic swarm system for Claude Code agent orchestration

**Key Contents:**
- `src/` - TypeScript CLI (`ov` command) with 37 subcommands
- `agents/` - Base agent definitions (.md files)
- `templates/` - CLAUDE.md templates
- `.overstory/`, `.canopy/`, `.seeds/`, `.mulch/` - Agent ecosystem configs
- `CLAUDE.md` - Extensive project documentation

**Role:** This is the **tooling layer** - the CLI that orchestrates agents.

---

### 2. `supreme-octo-computing-machine` (GitHub)
**Purpose:** SNAC-v2 infrastructure - deployment configs, Docker, nginx, scripts

**Key Contents:**
- `docker-compose.yml` - Full stack definition
- `docker-compose-expanded.yml` - Extended variant
- `nginx-fixed.conf` - Nginx reverse proxy config
- `backend/` - Backend API code
- `ui/` - Frontend UI code
- `scripts/` - Deployment scripts
- `plans/` - Planning documents
- Various `.ps1` and `.sh` scripts for mode switching

**Role:** This is the **infrastructure layer** - what gets deployed to the VPS.

---

### 3. `snac-v2` (GitHub)
**Purpose:** Original SNAC agent development - code, experiments, history, fixes

**Key Contents:**
- `Agent.js`, `Consensus.js` - Core agent classes
- `contracts/` - Smart contract code
- `deploy/` - Deployment scripts
- `browser-automation/` - Browser automation modules
- `__tests__/` - Test files
- `history*.md` - Development history logs
- `fix_*.py` - Bug fix scripts
- `docker-compose.yml` - Earlier version of compose
- `.agents/`, `.kilo/` - Agent configurations

**Role:** This is the **development layer** - where the agent system was built and iterated.

---

## VPS Deployment (`/opt/snac-v2`)

The VPS contains a **hybrid deployment** sourced primarily from `supreme-octo-computing-machine`:

### Running Containers (15 total)
```
kilo-gateway          - WebSocket message router (port 3002)
agent-builder         - Code builder agent
agent-orchestrator    - Task coordinator
agent-reviewer        - Code reviewer
agent-monitor         - System monitor
agent-nvidia          - NVIDIA inference proxy
agent-azure-coordinator - Azure cloud coordinator
snac_backend          - Python/FastAPI backend (ports 3000, 8000)
snac_frontend         - Web UI frontend
snac_nginx            - Nginx reverse proxy (ports 80, 443)
snac_db               - PostgreSQL database
snac_redis            - Redis cache
snac_qdrant           - Vector database
snac-ide              - Web IDE (port 8080)
snac_fact_checker     - Fact checking service (port 4000)
```

### VPS Key Files (matching supreme-octo-computing-machine)
- `server.js` - Main gateway WebSocket server (29KB)
- `agent-*.js` - Individual agent implementations
- `docker-compose.yml` - Container orchestration
- `nginx/` - Reverse proxy configuration
- `backend/` - Python backend API

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPS (Live System)                        │
│  /opt/snac-v2 ← sourced from supreme-octo-computing-machine     │
│  15 Docker containers running agent orchestration                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ deployed via docker-compose
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│        supreme-octo-computing-machine (Infrastructure)          │
│  docker-compose.yml, nginx/, backend/, ui/, scripts/            │
└─────────────────────────────────────────────────────────────────┘
                              
┌─────────────────────────────────────────────────────────────────┐
│                    storytime (Tooling)                            │
│  Local: C:\Users\seand\source\repos\overstory                   │
│  Remote: github.com/vortsghost2025/storytime                    │
│  Overstory CLI - orchestrates agents, manages worktrees         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ can deploy/manage
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    snac-v2 (Development)                         │
│  Agent code, experiments, history, bug fixes                    │
│  Source code eventually deployed to VPS                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Known Issues Identified

### 1. Gateway Message Type Conversion Gap
The `kilo-gateway/server.js` stores result messages but doesn't convert failed `build_result` to `error` type:

```javascript
// Current (stores but doesn't route/convert):
case "build_result":
case "test_result":
    storeMessage(agentId, "kilo", JSON.stringify(msg), msg.type);
    break;

// Needed: convert failed results and route to orchestrator
```

### 2. Chrome DevTools MCP Interference
Global `chrome-devtools-mcp@0.21.0` installation may cause unwanted DevTools popups:
- Location: `C:\Users\seand\Tools\nodejs\node-v24.14.0-win-x64\`
- Issue: MCP #1094 - "Long-running sessions lose Chrome connection with --autoConnect"
- Agent system does NOT use Chrome DevTools MCP

### 3. Qdrant Unhealthy
The `snac_qdrant` container shows as unhealthy - may need WAL corruption fix again.

---

## Recommendations

1. **Consolidate Documentation:** Many `.md` files in `snac-v2` are development history. Consider archiving to reduce confusion.

2. **Clarify Repo Boundaries:**
   - `storytime` = Overstory tooling (what you're working in now)
   - `supreme-octo-computing-machine` = VPS deployment configs (what's running)
   - `snac-v2` = Historical development (archived)

3. **Fix Gateway Conversion:** Add type conversion logic in `server.js` for failed results.

4. **Disable DevTools MCP:** Remove or configure `chrome-devtools-mcp` to prevent auto-launch.

---

*Document generated: 2026-04-01*

---

## Architecture Clarification (Updated)

### Container Breakdown

**Agents (7)** - Connect to gateway via WebSocket:
- `agent-builder` - Code generation
- `agent-orchestrator` - Task coordination  
- `agent-reviewer` - Code review
- `agent-monitor` - System health monitoring
- `agent-nvidia` - NVIDIA AI inference
- `agent-azure-coordinator` - Azure cloud operations
- `snac_fact_checker` - Fact verification (HTTP connection)

**Infrastructure (8)** - Support services:
- `kilo-gateway` - Message router (the hub)
- `snac_backend` - Python/FastAPI backend
- `snac_frontend` - Web UI
- `snac_nginx` - Reverse proxy
- `snac_db` - PostgreSQL database
- `snac_redis` - Cache/queue
- `snac_qdrant` - Vector database
- `snac-ide` - Web IDE

### Connection Flow

```
┌─────────────────┐     WebSocket      ┌───────────────┐
│  Your Local PC  │ ──────────────────→ │  kilo-gateway │
│  (Kilo IDE)     │  ws://187.77.3.56  │  (port 3002)  │
└─────────────────┘      :3002/{id}     └───────┬───────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
            ┌───────▼───────┐           ┌───────▼───────┐           ┌───────▼───────┐
            │ agent-builder │           │agent-reviewer │           │ agent-nvidia  │
            └───────────────┘           └───────────────┘           └───────────────┘
                    ... etc for all 7 agents
```

*Document updated: 2026-04-01*

---

## Corrected Architecture Understanding

**THIS KILO SESSION is the orchestrator.** The local Kilo (me, running in this conversation) connects directly to the VPS gateway.

### Connection Flow (Corrected)

```
Kilo (this AI assistant)
     │
     │ ws://187.77.3.56:3002/kilo-local
     │
     ▼
┌─────────────┐
│kilo-gateway │ (WebSocket hub)
└──────┬──────┘
       │
       ├──→ agent-builder
       ├──→ agent-orchestrator  
       ├──→ agent-reviewer
       ├──→ agent-monitor
       ├──→ agent-nvidia
       ├──→ agent-azure-coordinator
       └──→ snac_fact_checker
```

**I orchestrate the agents** by sending messages through the gateway using WebSocket or HTTP requests via the Bash tool.

*Document updated: 2026-04-01*
