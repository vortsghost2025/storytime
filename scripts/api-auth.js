/**
 * API Authentication Module
 * JWT-based authentication for gateway API
 */

const crypto = require("crypto");

const API_KEYS = new Map();
const TOKENS = new Map();

// Initialize with environment API keys
const envKeys = (process.env.API_KEYS || "").split(",").filter(Boolean);
envKeys.forEach(key => API_KEYS.set(key, { createdAt: Date.now(), uses: 0 }));

function generateToken(agentId) {
  const token = crypto.randomBytes(32).toString("hex");
  TOKENS.set(token, { agentId, createdAt: Date.now(), expiresAt: Date.now() + 3600000 });
  return token;
}

function validateToken(token) {
  const data = TOKENS.get(token);
  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    TOKENS.delete(token);
    return null;
  }
  return data;
}

function validateApiKey(key) {
  const data = API_KEYS.get(key);
  if (!data) return false;
  data.uses++;
  return true;
}

function middleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  const [type, token] = authHeader.split(" ");
  
  if (type === "Bearer") {
    const tokenData = validateToken(token);
    if (!tokenData) return res.status(401).json({ error: "Invalid token" });
    req.agentId = tokenData.agentId;
  } else if (type === "ApiKey") {
    if (!validateApiKey(token)) return res.status(401).json({ error: "Invalid API key" });
  } else {
    return res.status(401).json({ error: "Invalid auth type" });
  }

  next();
}

module.exports = { generateToken, validateToken, validateApiKey, middleware };
