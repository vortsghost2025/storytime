/**
 * Memory Controller with Size Limits
 * Prevents runaway memory growth
 * Max 10MB per agent, 100MB total system
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// STRICT LIMITS
const LIMITS = {
  maxAgentMemoryMB: 10,        // 10MB per agent
  maxSystemMemoryMB: 100,      // 100MB total
  maxLayerItems: 1000,         // Max items per layer
  maxKeyLength: 200,           // Max key size
  maxValueLength: 10000,       // Max value size (10KB)
  compressionThreshold: 1000,  // Compress values > 1KB
  cleanupIntervalMs: 300000,   // Clean every 5 minutes
  maxAgeDays: 7                // Delete after 7 days
};

class MemoryController {
  constructor(agentId) {
    this.agentId = agentId;
    this.basePath = "/app/data/memory";
    this.agentPath = path.join(this.basePath, agentId);
    this.layers = {};
    this.totalSize = 0;
    this.init();
  }

  init() {
    // Create directory
    fs.mkdirSync(this.agentPath, { recursive: true });
    
    // Initialize minimal layers (not 48 - too many)
    const activeLayers = ["perceptual", "working", "longTerm", "shared"];
    for (const layer of activeLayers) {
      this.layers[layer] = { data: new Map(), size: 0 };
    }
    
    // Load existing (with size check)
    this.load();
    
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), LIMITS.cleanupIntervalMs);
    
    console.log("[Memory] Controller initialized for " + agentId + " (limit: " + LIMITS.maxAgentMemoryMB + "MB)");
  }

  load() {
    try {
      const files = fs.readdirSync(this.agentPath);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const layer = file.replace(".json", "");
          const data = JSON.parse(fs.readFileSync(path.join(this.agentPath, file), "utf8"));
          if (this.layers[layer]) {
            this.layers[layer].data = new Map(Object.entries(data));
            this.layers[layer].size = JSON.stringify(data).length;
          }
        }
      }
      this.calculateSize();
    } catch (e) {
      // Fresh start
    }
  }

  save(layer) {
    if (!this.layers[layer]) return;
    
    try {
      const data = Object.fromEntries(this.layers[layer].data);
      const json = JSON.stringify(data);
      
      // Check size limit
      if (this.totalSize + json.length > LIMITS.maxAgentMemoryMB * 1024 * 1024) {
        console.warn("[Memory] Size limit reached, evicting old items");
        this.evict(layer, json.length);
      }
      
      const filePath = path.join(this.agentPath, layer + ".json");
      fs.writeFileSync(filePath, json);
      this.layers[layer].size = json.length;
      this.calculateSize();
    } catch (e) {
      console.error("[Memory] Save error: " + e.message);
    }
  }

  store(layer, key, value, metadata = {}) {
    if (!this.layers[layer]) return false;
    
    // Validate sizes
    if (key.length > LIMITS.maxKeyLength) {
      console.warn("[Memory] Key too long: " + key.length);
      return false;
    }
    
    const valueStr = JSON.stringify(value);
    if (valueStr.length > LIMITS.maxValueLength) {
      console.warn("[Memory] Value too large: " + valueStr.length);
      return false;
    }
    
    // Check layer capacity
    if (this.layers[layer].data.size >= LIMITS.maxLayerItems) {
      this.evictOldest(layer);
    }
    
    // Store with metadata
    this.layers[layer].data.set(key, {
      v: value,
      m: {
        ...metadata,
        ts: Date.now(),
        hash: crypto.createHash("md5").update(valueStr).digest("hex").substring(0, 8)
      }
    });
    
    this.save(layer);
    return true;
  }

  retrieve(layer, key) {
    if (!this.layers[layer]) return null;
    const item = this.layers[layer].data.get(key);
    return item ? item.v : null;
  }

  evict(layer, neededBytes) {
    const layerData = this.layers[layer];
    if (!layerData) return;
    
    // Convert to array and sort by timestamp
    const items = Array.from(layerData.data.entries());
    items.sort((a, b) => (a[1].m?.ts || 0) - (b[1].m?.ts || 0));
    
    // Remove oldest until we have space
    let freed = 0;
    for (const [key, value] of items) {
      if (freed >= neededBytes) break;
      freed += JSON.stringify(value).length;
      layerData.data.delete(key);
    }
    
    this.save(layer);
  }

  evictOldest(layer) {
    const layerData = this.layers[layer];
    if (!layerData) return;
    
    let oldest = null;
    let oldestTime = Infinity;
    
    for (const [key, item] of layerData.data) {
      const ts = item.m?.ts || 0;
      if (ts < oldestTime) {
        oldestTime = ts;
        oldest = key;
      }
    }
    
    if (oldest) layerData.data.delete(oldest);
  }

  cleanup() {
    const cutoff = Date.now() - (LIMITS.maxAgeDays * 24 * 60 * 60 * 1000);
    let removed = 0;
    
    for (const [layerName, layer] of Object.entries(this.layers)) {
      for (const [key, item] of layer.data) {
        if ((item.m?.ts || 0) < cutoff) {
          layer.data.delete(key);
          removed++;
        }
      }
      if (removed > 0) this.save(layerName);
    }
    
    if (removed > 0) console.log("[Memory] Cleanup removed " + removed + " old items");
  }

  calculateSize() {
    this.totalSize = 0;
    for (const layer of Object.values(this.layers)) {
      this.totalSize += layer.size;
    }
  }

  getStats() {
    return {
      agent: this.agentId,
      totalSizeMB: (this.totalSize / 1024 / 1024).toFixed(2),
      limitMB: LIMITS.maxAgentMemoryMB,
      usage: Math.round((this.totalSize / (LIMITS.maxAgentMemoryMB * 1024 * 1024)) * 100) + "%",
      layers: Object.entries(this.layers).map(([name, l]) => ({
        name,
        items: l.data.size,
        sizeKB: (l.size / 1024).toFixed(1)
      }))
    };
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

module.exports = MemoryController;
