import rateLimit from "express-rate-limit";
import { rateLimitResponse } from "./response.js";

/**
 * Rate Limiter Configuration for Different Endpoints
 */

// Helper to normalize IP addresses
const normalizeIP = (ip) => {
  if (!ip) return "unknown";
  // Handle IPv6 localhost
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "127.0.0.1";
  // Remove IPv6 prefix if present
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
};

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    return rateLimitResponse(res, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
  },
});

// Login rate limiter - 5 attempts per 15 minutes per IP/email
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    // Use combination of normalized IP and email (if provided)
    const ip = normalizeIP(req.ip);
    const email = req.body?.email?.toLowerCase() || "";
    return `login:${ip}:${email}`;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      error: "Too many login attempts. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        retryAfter,
        message: `Please wait ${Math.ceil(retryAfter / 60)} minutes before trying again.`,
      },
    });
  },
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Registration rate limiter - 3 per hour per IP
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `register:${normalizeIP(req.ip)}`,
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      error: "Too many registration attempts. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        retryAfter,
        message: `Please wait ${Math.ceil(retryAfter / 60)} minutes before trying again.`,
      },
    });
  },
});

// Password reset rate limiter - 3 per hour per email
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase();
    return email ? `reset:${email}` : `reset:${normalizeIP(req.ip)}`;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    return res.status(429).json({
      success: false,
      error: "Too many password reset requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        retryAfter,
        message: `Please wait ${Math.ceil(retryAfter / 60)} minutes before trying again.`,
      },
    });
  },
});

// Token refresh rate limiter - 10 per minute
export const refreshTokenLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `refresh:${normalizeIP(req.ip)}`,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      error: "Too many refresh token requests.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  },
});

// Strict limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `strict:${normalizeIP(req.ip)}`,
  handler: (req, res) => {
    return rateLimitResponse(res, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
  },
});

