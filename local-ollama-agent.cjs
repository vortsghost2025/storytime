const WebSocket = require('ws');
const http = require('http');

const GATEWAY_URL = 'ws://187.77.3.56:3002';
const AGENT_ID = 'ollama-local';

let ws;
const taskQueue = [];
let isExecuting = false;

function log(msg) { console.log(`[${new Date().toISOString()}] [OLLAMA] ${msg}`); }

function connect() {
  ws = new WebSocket(`${GATEWAY_URL}/${AGENT_ID}`);
  ws.on('open', () => { log('Connected'); sendMessage({ type: 'agent_ready', role: 'local-inference' }); });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'task_assignment') { taskQueue.push(msg); processQueue(); }
    } catch (e) {}
  });
  ws.on('close', () => setTimeout(connect, 5000));
  ws.on('error', () => {});
}

function sendMessage(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

function callOllama(prompt, model) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model || 'orca-mini',
      messages: [{ role: 'user', content: prompt }],
      stream: false
    });
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          resolve(d.message?.content || 'No response');
        } catch (e) { resolve(body.substring(0, 500)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function processQueue() {
  if (isExecuting || taskQueue.length === 0) return;
  isExecuting = true;
  const task = taskQueue.shift();
  const prompt = task.prompt || task.message || 'Hello';
  const model = task.model || 'orca-mini';
  const start = Date.now();

  log(`Processing: ${prompt.substring(0, 40)}`);
  try {
    const output = await callOllama(prompt, model);
    sendMessage({
      type: 'inference_result',
      taskId: task.taskId,
      status: 'success',
      output: output,
      model: `ollama/${model}`,
      tokensUsed: Math.ceil(output.length / 4),
      latency: Date.now() - start,
      error: null
    });
    log(`Done in ${Date.now() - start}ms`);
  } catch (e) {
    sendMessage({
      type: 'inference_result',
      taskId: task.taskId,
      status: 'failed',
      model: `ollama/${model}`,
      error: e.message
    });
  }
  isExecuting = false;
  setImmediate(processQueue);
}

setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) sendMessage({ type: 'heartbeat' }); }, 30000);
connect();
