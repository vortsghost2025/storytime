/**
 * Memory Coordinator
 * Manages distributed memory across agents and future VPS nodes
 * Prevents single-point memory bloat
 */

const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "memory-coordinator";

// Distributed storage configuration
const CONFIG = {
  maxLocalMB: 500,          // Max local storage
  maxPerAgentMB: 10,        // Per agent limit
  replicationFactor: 2,     // Copies across nodes
  syncIntervalMs: 60000,    // Sync every minute
  nodes: [
    { id: "vps-primary", host: "187.77.3.56", status: "active" }
    // Future: { id: "vps-secondary", host: "x.x.x.x", status: "pending" }
  ]
};

let ws;
let agentMemories = new Map();

function log(msg) { console.log("[" + new Date().toISOString() + "] [MEMORY-COORD] " + msg); }

function connect() {
  ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
  ws.on("open", () => {
    log("Connected - Memory coordinator active");
    sendMessage({ type: "agent_ready", role: "memory-coordinator" });
    startMonitoring();
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "task_assignment") {
        handleMessage(msg);
      } else if (msg.type === "memory_request") {
        handleMemoryRequest(msg);
      }
    } catch (e) {}
  });
  ws.on("close", () => setTimeout(connect, 5000));
  ws.on("error", () => {});
}

function sendMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(msg) {
  const message = (msg.message || "").toLowerCase();
  
  if (message.includes("status") || message.includes("stats")) {
    const stats = getSystemStats();
    sendMessage({
      type: "task_result",
      taskId: msg.taskId,
      status: "success",
      output: JSON.stringify(stats, null, 2)
    });
  } else if (message.includes("cleanup")) {
    const cleaned = cleanupAll();
    sendMessage({
      type: "task_result",
      taskId: msg.taskId,
      status: "success",
      output: "Cleaned " + cleaned + " items"
    });
  } else if (message.includes("migrate")) {
    sendMessage({
      type: "task_result",
      taskId: msg.taskId,
      status: "success",
      output: "Migration plan ready (add secondary VPS first)"
    });
  }
}

function handleMemoryRequest(msg) {
  // Agent requesting memory from another agent
  const { source, target, key } = msg;
  // TODO: Implement cross-agent memory sharing
}

function getSystemStats() {
  const memoryPath = "/app/data/memory";
  let totalSize = 0;
  let agentCount = 0;
  const agents = [];
  
  try {
    if (fs.existsSync(memoryPath)) {
      const dirs = fs.readdirSync(memoryPath);
      for (const dir of dirs) {
        const dirPath = path.join(memoryPath, dir);
        const stat = fs.statSync(dirPath);
        if (stat.isDirectory()) {
          agentCount++;
          const size = getDirSize(dirPath);
          totalSize += size;
          agents.push({ id: dir, sizeMB: (size / 1024 / 1024).toFixed(2) });
        }
      }
    }
  } catch (e) {}
  
  return {
    system: {
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      limitMB: CONFIG.maxLocalMB,
      usage: Math.round((totalSize / (CONFIG.maxLocalMB * 1024 * 1024)) * 100) + "%",
      agents: agentCount
    },
    agents: agents.sort((a, b) => parseFloat(b.sizeMB) - parseFloat(a.sizeMB)).slice(0, 10),
    distribution: {
      nodes: CONFIG.nodes.length,
      replicationFactor: CONFIG.replicationFactor
    }
  };
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) size += stat.size;
      else if (stat.isDirectory()) size += getDirSize(filePath);
    }
  } catch (e) {}
  return size;
}

function cleanupAll() {
  const memoryPath = "/app/data/memory";
  let cleaned = 0;
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  try {
    if (fs.existsSync(memoryPath)) {
      const dirs = fs.readdirSync(memoryPath);
      for (const dir of dirs) {
        const files = fs.readdirSync(path.join(memoryPath, dir));
        for (const file of files) {
          const filePath = path.join(memoryPath, dir, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        }
      }
    }
  } catch (e) {}
  
  return cleaned;
}

function startMonitoring() {
  // Check memory usage every minute
  setInterval(() => {
    const stats = getSystemStats();
    const usage = parseInt(stats.system.usage);
    
    if (usage > 80) {
      log("WARNING: Memory usage at " + usage + "%");
      cleanupAll();
    }
    
    // Report to orchestrator
    sendMessage({
      type: "memory_status",
      usage: stats.system.usage,
      totalMB: stats.system.totalSizeMB,
      agents: stats.system.agents
    });
  }, CONFIG.syncIntervalMs);
}

connect();
