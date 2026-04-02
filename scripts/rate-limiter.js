/**
 * Rate Limiter
 * Prevents abuse and manages resource usage
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.maxInference = options.maxInference || 20;
    this.requests = new Map();
    this.inference = new Map();
  }

  checkLimit(key, type = "general") {
    const store = type === "inference" ? this.inference : this.requests;
    const max = type === "inference" ? this.maxInference : this.maxRequests;
    
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!store.has(key)) {
      store.set(key, []);
    }
    
    const timestamps = store.get(key).filter(t => t > windowStart);
    store.set(key, timestamps);
    
    if (timestamps.length >= max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(windowStart + this.windowMs).toISOString()
      };
    }
    
    timestamps.push(now);
    
    return {
      allowed: true,
      remaining: max - timestamps.length,
      resetAt: new Date(windowStart + this.windowMs).toISOString()
    };
  }

  middleware(type = "general") {
    return (req, res, next) => {
      const key = req.agentId || req.ip || "anonymous";
      const result = this.checkLimit(key, type);
      
      res.set({
        "X-RateLimit-Remaining": result.remaining,
        "X-RateLimit-Reset": result.resetAt
      });
      
      if (!result.allowed) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: result.resetAt
        });
      }
      
      next();
    };
  }

  getStats() {
    return {
      activeKeys: this.requests.size,
      inferenceKeys: this.inference.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
      maxInference: this.maxInference
    };
  }
}

module.exports = RateLimiter;
