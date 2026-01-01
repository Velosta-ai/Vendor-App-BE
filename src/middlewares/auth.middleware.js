import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { isTokenBlacklisted } from "../utils/tokenService.js";
import { unauthorizedResponse, forbiddenResponse, ERROR_CODES } from "../utils/response.js";

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches account to request
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorizedResponse(res, "Authentication required");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return unauthorizedResponse(res, "Authentication required");
    }

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({
        success: false,
        error: "Token has been revoked. Please login again.",
        code: ERROR_CODES.TOKEN_INVALID,
      });
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Token has expired. Please refresh your token.",
          code: ERROR_CODES.TOKEN_EXPIRED,
        });
      }
      return res.status(401).json({
        success: false,
        error: "Invalid token",
        code: ERROR_CODES.TOKEN_INVALID,
      });
    }

    // Fetch account
    const account = await prisma.account.findUnique({
      where: { id: payload.accountId },
    });

    if (!account) {
      return unauthorizedResponse(res, "Account not found");
    }

    // Check if account is active
    if (!account.isActive) {
      return forbiddenResponse(res, "Account is deactivated");
    }

    // Attach to request
    req.account = account;
    req.organizationId = payload.organizationId;
    req.accountRole = payload.role;

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return unauthorizedResponse(res, "Authentication failed");
  }
}

/**
 * Role-based Authorization Middleware
 * Use after authenticate middleware
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.account) {
      return unauthorizedResponse(res, "Authentication required");
    }

    if (!allowedRoles.includes(req.account.role)) {
      return forbiddenResponse(res, "You do not have permission to perform this action");
    }

    next();
  };
}

/**
 * Admin Only Middleware
 * Shorthand for authorize("ADMIN")
 */
export function adminOnly(req, res, next) {
  if (!req.account) {
    return unauthorizedResponse(res, "Authentication required");
  }

  if (req.account.role !== "ADMIN") {
    return forbiddenResponse(res, "Admin access required");
  }

  next();
}

/**
 * Admin or Manager Middleware
 * Shorthand for authorize("ADMIN", "MANAGER")
 */
export function adminOrManager(req, res, next) {
  if (!req.account) {
    return unauthorizedResponse(res, "Authentication required");
  }

  if (!["ADMIN", "MANAGER"].includes(req.account.role)) {
    return forbiddenResponse(res, "Admin or Manager access required");
  }

  next();
}

/**
 * Optional Authentication Middleware
 * Does not fail if no token provided, but attaches account if valid token exists
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return next();
    }

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return next();
    }

    // Try to verify token
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      const account = await prisma.account.findUnique({
        where: { id: payload.accountId },
      });

      if (account && account.isActive) {
        req.account = account;
        req.organizationId = payload.organizationId;
        req.accountRole = payload.role;
      }
    } catch {
      // Token invalid or expired, continue without auth
    }

    next();
  } catch (err) {
    next();
  }
}
