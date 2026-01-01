import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../config/prisma.js";
import env from "../config/env.js";

/**
 * Token Service - Handles JWT access tokens and refresh tokens
 */

// Token expiration times
const ACCESS_TOKEN_EXPIRY = "15m"; // Short-lived access token
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // Refresh token valid for 7 days

/**
 * Generate access token (short-lived JWT)
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

/**
 * Generate refresh token and store in database
 */
export const generateRefreshToken = async (accountId) => {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      accountId,
      expiresAt,
    },
  });

  return token;
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = async (account) => {
  const payload = {
    accountId: account.id,
    organizationId: account.organizationId,
    role: account.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(account.id);

  return { accessToken, refreshToken };
};

/**
 * Verify and decode access token
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * Validate refresh token and rotate (issue new refresh token, invalidate old)
 */
export const rotateRefreshToken = async (refreshToken) => {
  // Find the refresh token
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { account: true },
  });

  // Token not found
  if (!storedToken) {
    return { success: false, error: "Invalid refresh token" };
  }

  // Token already revoked - potential token reuse attack
  if (storedToken.revokedAt) {
    // Revoke all tokens for this user (security measure)
    await prisma.refreshToken.updateMany({
      where: { accountId: storedToken.accountId },
      data: { revokedAt: new Date() },
    });
    return { success: false, error: "Token reuse detected. Please login again." };
  }

  // Token expired
  if (storedToken.expiresAt < new Date()) {
    return { success: false, error: "Refresh token expired" };
  }

  // Account not found or inactive
  if (!storedToken.account || !storedToken.account.isActive) {
    return { success: false, error: "Account not found or inactive" };
  }

  // Generate new tokens
  const newRefreshToken = await generateRefreshToken(storedToken.accountId);

  // Revoke old token and link to new one
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: {
      revokedAt: new Date(),
      replacedBy: newRefreshToken,
    },
  });

  const payload = {
    accountId: storedToken.account.id,
    organizationId: storedToken.account.organizationId,
    role: storedToken.account.role,
  };

  const accessToken = generateAccessToken(payload);

  return {
    success: true,
    accessToken,
    refreshToken: newRefreshToken,
    account: storedToken.account,
  };
};

/**
 * Revoke a specific refresh token
 */
export const revokeRefreshToken = async (refreshToken) => {
  try {
    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Revoke all refresh tokens for an account
 */
export const revokeAllRefreshTokens = async (accountId) => {
  await prisma.refreshToken.updateMany({
    where: {
      accountId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
};

/**
 * Blacklist an access token (for logout)
 */
export const blacklistAccessToken = async (token) => {
  try {
    // Decode to get expiration time
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return false;

    const expiresAt = new Date(decoded.exp * 1000);

    // Only blacklist if token hasn't expired yet
    if (expiresAt > new Date()) {
      await prisma.blacklistedToken.create({
        data: {
          token,
          expiresAt,
        },
      });
    }
    return true;
  } catch (err) {
    console.error("Error blacklisting token:", err);
    return false;
  }
};

/**
 * Check if token is blacklisted
 */
export const isTokenBlacklisted = async (token) => {
  const blacklisted = await prisma.blacklistedToken.findUnique({
    where: { token },
  });
  return !!blacklisted;
};

/**
 * Clean up expired tokens (should run periodically)
 */
export const cleanupExpiredTokens = async () => {
  const now = new Date();

  // Delete expired blacklisted tokens
  await prisma.blacklistedToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  // Delete expired refresh tokens (keep for 30 days after expiry for audit)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: thirtyDaysAgo } },
  });

  // Delete used password reset tokens older than 24 hours
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  await prisma.passwordReset.deleteMany({
    where: {
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: oneDayAgo } }],
    },
  });
};

/**
 * Generate 6-digit OTP for password reset
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create password reset OTP
 */
export const createPasswordResetOTP = async (accountId) => {
  // Invalidate any existing OTPs for this account
  await prisma.passwordReset.updateMany({
    where: {
      accountId,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  const otp = generateOTP();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15); // OTP valid for 15 minutes

  await prisma.passwordReset.create({
    data: {
      otp,
      accountId,
      expiresAt,
    },
  });

  return otp;
};

/**
 * Verify password reset OTP
 */
export const verifyPasswordResetOTP = async (email, otp) => {
  const account = await prisma.account.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!account) {
    return { success: false, error: "Account not found" };
  }

  const resetToken = await prisma.passwordReset.findFirst({
    where: {
      accountId: account.id,
      otp,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!resetToken) {
    return { success: false, error: "Invalid or expired OTP" };
  }

  // Mark OTP as used
  await prisma.passwordReset.update({
    where: { id: resetToken.id },
    data: { usedAt: new Date() },
  });

  return { success: true, account };
};

