/**
 * Autonomous Code Review Agent
 * Continuously scans codebase for errors
 */

const WebSocket = require("ws");
const { execSync } = require("child_process");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "code-reviewer";

let ws;
const findings = [];

function log(msg) { console.log("[" + new Date().toISOString() + "] [CODE-REVIEW] " + msg); }

function connect() {
  ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
  ws.on("open", () => {
    log("Connected - Code reviewer active");
    sendMessage({ type: "agent_ready", role: "code-reviewer" });
    startReviewCycle();
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "task_assignment") {
        handleMessage(msg);
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

function checkJavaScript(filePath) {
  try {
    execSync(`node --check "${filePath}"`, { encoding: "utf8", timeout: 5000 });
    return { file: filePath, status: "ok" };
  } catch (e) {
    const error = e.stderr ? e.stderr.split("\n")[0] : e.message;
    findings.push({ file: filePath, error, timestamp: new Date().toISOString() });
    return { file: filePath, status: "error", error };
  }
}

function scanCodebase() {
  const results = [];
  
  try {
    const files = execSync("find /app -name \"*.js\" -type f 2>/dev/null", { encoding: "utf8" })
      .split("\n")
      .filter(f => f.trim() && !f.includes("node_modules"));
    
    for (const file of files.slice(0, 20)) {
      const result = checkJavaScript(file.trim());
      results.push(result);
    }
  } catch (e) {
    log("Scan error: " + e.message);
  }
  
  return results;
}

function handleMessage(msg) {
  const message = (msg.message || "").toLowerCase();
  
  if (message.includes("scan") || message.includes("review")) {
    const results = scanCodebase();
    const errors = results.filter(r => r.status === "error");
    
    sendMessage({
      type: "task_result",
      taskId: msg.taskId,
      status: "success",
      output: JSON.stringify({
        scanned: results.length,
        errors: errors.length,
        findings: errors.slice(0, 5),
        timestamp: new Date().toISOString()
      }, null, 2)
    });
  } else if (message.includes("findings") || message.includes("issues")) {
    sendMessage({
      type: "task_result",
      taskId: msg.taskId,
      status: "success",
      output: JSON.stringify({ findings: findings.slice(-10) }, null, 2)
    });
  }
}

function startReviewCycle() {
  // Run review every 5 minutes
  setInterval(() => {
    log("Running scheduled code review...");
    const results = scanCodebase();
    const errors = results.filter(r => r.status === "error");
    
    if (errors.length > 0) {
      log("Found " + errors.length + " errors");
      sendMessage({
        type: "task_result",
        taskId: "scheduled-review-" + Date.now(),
        status: "issues_found",
        output: JSON.stringify({ errors: errors.slice(0, 3) }, null, 2)
      });
    } else {
      log("No errors found");
    }
  }, 300000); // 5 minutes
  
  // Initial scan
  log("Running initial code review...");
  const results = scanCodebase();
  log("Scanned " + results.length + " files, found " + results.filter(r => r.status === "error").length + " errors");
}

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendMessage({ type: "heartbeat" });
  }
}, 30000);

connect();
