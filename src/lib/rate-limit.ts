/**
 * Simple in-memory rate limiter for Vercel serverless functions
 * Note: This is per-instance, so it's not perfect for distributed systems
 * For production, consider using Vercel KV, Upstash Redis, or similar
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (resets on cold starts)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
}

// Clean up old entries periodically
const cleanupInterval = 60000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < cleanupInterval) return;
  
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetIn: number } {
  cleanup();
  
  const now = Date.now();
  const key = identifier;
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime < now) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs,
    };
  }
  
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
    };
  }
  
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetIn: entry.resetTime - now,
  };
}

// Preset configurations for different endpoints
export const RATE_LIMITS = {
  // Generate endpoint: 10 requests per minute per IP (expensive operation)
  generate: { maxRequests: 10, windowMs: 60000 },
  
  // Checkout endpoint: 20 requests per minute per IP
  checkout: { maxRequests: 20, windowMs: 60000 },
  
  // Download endpoint: 30 requests per minute per IP
  download: { maxRequests: 30, windowMs: 60000 },
  
  // Image info endpoint: 60 requests per minute per IP
  imageInfo: { maxRequests: 60, windowMs: 60000 },
  
  // Webhook endpoint: 100 requests per minute (from Stripe)
  webhook: { maxRequests: 100, windowMs: 60000 },
};

// Helper to get client IP from request
export function getClientIP(request: Request): string {
  // Try various headers that may contain the real IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  // Vercel-specific header
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim();
  }
  
  return "unknown";
}



