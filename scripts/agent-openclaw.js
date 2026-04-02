/**
 * OpenClaw Orchestrator Agent
 * Connects OpenClaw to the SNAC gateway for multi-agent orchestration
 */

const WebSocket = require("ws");
const http = require("http");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "openclaw";

let ws;
const taskQueue = [];
let isExecuting = false;
const agentRegistry = new Map();

function log(msg) { console.log("[" + new Date().toISOString() + "] [OPENCLAW] " + msg); }

function connect() {
  ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
  ws.on("open", () => {
    log("Connected - OpenClaw orchestrator ready");
    sendMessage({ type: "agent_ready", role: "openclaw-orchestrator" });
    discoverAgents();
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      handleMessage(msg);
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
  if (msg.type === "task_assignment") {
    taskQueue.push(msg);
    processQueue();
  } else if (msg.type === "agent_ready") {
    agentRegistry.set(msg.from || msg.agentId, { role: msg.role, lastSeen: Date.now() });
    log("Agent registered: " + (msg.from || msg.agentId));
  }
}

function discoverAgents() {
  http.get("http://kilo-gateway:3002/health", (res) => {
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      try {
        const health = JSON.parse(data);
        log("Discovered " + health.agentsConnected + " agents");
        health.agents.forEach(a => {
          agentRegistry.set(a.id, { name: a.name, role: a.role, lastSeen: Date.now() });
        });
      } catch (e) {}
    });
  }).on("error", () => {});
}

function sendToAgent(agentId, message, type) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: "openclaw",
      to: agentId,
      message: message,
      type: type || "task_assignment",
      command: message
    });

    const req = http.request({
      hostname: "kilo-gateway",
      port: 3002,
      path: "/send",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ raw: body }); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

function broadcastToAll(message) {
  return sendToAgent("all", message, "chat");
}

async function orchestrateWorkflow(steps) {
  const results = [];
  for (const step of steps) {
    log("Executing: " + step.agent + " -> " + step.task.substring(0, 40));
    const result = await sendToAgent(step.agent, step.task);
    results.push({ agent: step.agent, task: step.task, result });
    await new Promise(r => setTimeout(r, step.delay || 1000));
  }
  return results;
}

async function processQueue() {
  if (isExecuting || taskQueue.length === 0) return;
  
  isExecuting = true;
  const task = taskQueue.shift();
  const message = task.message || "";
  
  log("Processing: " + message.substring(0, 50));
  
  try {
    if (message.toLowerCase().includes("status") || message.toLowerCase().includes("agents")) {
      const agents = Array.from(agentRegistry.entries()).map(([id, info]) => 
        id + " (" + (info.role || info.name || "unknown") + ")"
      ).join(", ");
      
      sendMessage({
        type: "task_result",
        taskId: task.taskId,
        status: "success",
        output: "OpenClaw orchestrator active. " + agentRegistry.size + " agents: " + agents
      });
    } else if (message.toLowerCase().includes("broadcast")) {
      const broadcastMsg = message.replace(/broadcast/i, "").trim();
      await broadcastToAll(broadcastMsg);
      sendMessage({
        type: "task_result",
        taskId: task.taskId,
        status: "success",
        output: "Broadcast sent to all agents"
      });
    } else {
      sendMessage({
        type: "task_result",
        taskId: task.taskId,
        status: "success",
        output: "OpenClaw received: " + message.substring(0, 200)
      });
    }
  } catch (e) {
    sendMessage({
      type: "task_result",
      taskId: task.taskId,
      status: "failed",
      error: e.message
    });
  }
  
  isExecuting = false;
  setImmediate(processQueue);
}

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendMessage({ type: "heartbeat" });
  }
  discoverAgents();
}, 30000);

connect();
