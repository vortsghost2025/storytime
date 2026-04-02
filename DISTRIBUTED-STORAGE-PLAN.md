# Distributed Memory & Container Plan

## Problem
- VPS disk space limited (49GB total, 18GB free)
- Previous memory corruption: 108GB in 2 weeks
- 22 agents need persistent memory without bloat

## Solution: Strict Limits + Distribution

### Memory Limits (Enforced)
| Limit | Value | Why |
|-------|-------|-----|
| Per agent | 10MB max | Prevents single-agent bloat |
| System total | 100MB max | Protects VPS disk |
| Value size | 10KB max | No large blobs |
| Retention | 7 days | Auto-cleanup |
| Layers | 4 (not 48) | Simplified architecture |

### Distributed Storage Architecture

```
VPS Primary (187.77.3.56)
├── Gateway (WebSocket hub)
├── 22 Agent containers
├── Memory storage (100MB limit)
└── Postgres (persistent state)

Future VPS Secondary (to add)
├── Agent replicas
├── Memory mirror
└── Load balancing
```

### Storage Allocation

| Service | Current | Limit |
|---------|---------|-------|
| Docker images | ~5GB | - |
| Agent containers | ~2GB | - |
| Memory storage | 0MB | 100MB max |
| Postgres | ~50MB | 1GB max |
| Logs | ~100MB | 500MB max |
| **Total** | **~8GB** | **~7GB** |

### Growth Strategy

**Phase 1: Current VPS (Now)**
- Strict memory limits enforced
- Auto-cleanup every 5 minutes
- 7-day retention policy

**Phase 2: Secondary VPS (When needed)**
- Add second VPS for load distribution
- Replicate memory across nodes
- WebSocket gateway connects both

**Phase 3: Cloud Storage (Future)**
- Azure Blob Storage for archival
- Cold storage for old memories
- Hot cache for active agents

### Commands

```bash
# Check memory usage
ssh root@187.77.3.56 "du -sh /opt/snac-v2/data/memory/"

# Cleanup old memories
ssh root@187.77.3.56 "find /opt/snac-v2/data/memory -mtime +7 -delete"

# Check disk space
ssh root@187.77.3.56 "df -h /"
```

