import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import {
  generateTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  blacklistAccessToken,
  createPasswordResetOTP,
  verifyPasswordResetOTP,
} from "../utils/tokenService.js";
import { validatePhone } from "../utils/validation.js";
import {
  successResponse,
  errorResponse,
  conflictResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
  ERROR_CODES,
} from "../utils/response.js";

// ───────────────────────────────────────────────
// REGISTER ORG + FIRST ACCOUNT (ADMIN)
// ───────────────────────────────────────────────
// POST /api/auth/register-org
export async function registerOrg(req, res, next) {
  try {
    const { orgName, name, email, password, phone } = req.body;

    // Validate required fields
    if (!orgName || !name || !email || !password) {
      return errorResponse(res, "Missing required fields", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate email format
    const emailLower = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return errorResponse(res, "Invalid email format", ERROR_CODES.INVALID_EMAIL, 400);
    }

    // Validate and normalize phone if provided
    let normalizedPhone = null;
    if (phone) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
      }
      normalizedPhone = phoneValidation.normalized;
    }

    // Check if email already registered
    const existing = await prisma.account.findUnique({ where: { email: emailLower } });
    if (existing) {
      return conflictResponse(res, "Email already registered");
    }

    // Generate unique organization invite code
    const inviteCode = "ORG-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 1. Create organization with invite code
    const org = await prisma.organization.create({
      data: {
        name: orgName.trim(),
        inviteCode: inviteCode,
      },
    });

    // 2. Create first account as ADMIN
    const passwordHash = await bcrypt.hash(password, 10);

    const account = await prisma.account.create({
      data: {
        name: name.trim(),
        email: emailLower,
        phone: normalizedPhone,
        passwordHash,
        role: "ADMIN",
        organizationId: org.id,
      },
    });

    // 3. Generate token pair (access + refresh)
    const { accessToken, refreshToken } = await generateTokenPair(account);

    return successResponse(
      res,
      {
        accessToken,
        refreshToken,
      organization: {
        id: org.id,
        name: org.name,
          inviteCode: org.inviteCode,
      },
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
      },
      "Organization created successfully",
      201
    );
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// LOGIN
// ───────────────────────────────────────────────
// POST /api/auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, "Email and password are required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const emailLower = email.toLowerCase().trim();

    const account = await prisma.account.findUnique({
      where: { email: emailLower },
      include: { organization: true },
    });

    if (!account) {
      return unauthorizedResponse(res, "Invalid email or password");
    }

    // Check if account is active
    if (!account.isActive) {
      return errorResponse(res, "Account is deactivated. Please contact support.", ERROR_CODES.FORBIDDEN, 403);
    }

    const isPasswordValid = await bcrypt.compare(password, account.passwordHash);

    if (!isPasswordValid) {
      return unauthorizedResponse(res, "Invalid email or password");
    }

    // Generate token pair
    const { accessToken, refreshToken } = await generateTokenPair(account);

    return successResponse(res, {
      accessToken,
      refreshToken,
      organization: {
        id: account.organization.id,
        name: account.organization.name,
        inviteCode: account.organization.inviteCode,
      },
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// JOIN ORGANIZATION
// ───────────────────────────────────────────────
// POST /api/auth/join-org
export async function joinOrg(req, res, next) {
  try {
    const { inviteCode, name, email, password, phone } = req.body;

    if (!inviteCode || !name || !email || !password) {
      return errorResponse(res, "Missing required fields", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const org = await prisma.organization.findUnique({
      where: { inviteCode },
    });

    if (!org) {
      return errorResponse(res, "Invalid invite code", "INVALID_INVITE_CODE", 400);
    }

    const emailLower = email.toLowerCase().trim();

    // Validate and normalize phone if provided
    let normalizedPhone = null;
    if (phone) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
      }
      normalizedPhone = phoneValidation.normalized;
    }

    const existing = await prisma.account.findUnique({ where: { email: emailLower } });
    if (existing) {
      return conflictResponse(res, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const account = await prisma.account.create({
      data: {
        name: name.trim(),
        email: emailLower,
        phone: normalizedPhone,
        passwordHash,
        role: "STAFF",
        organizationId: org.id,
      },
    });

    const { accessToken, refreshToken } = await generateTokenPair(account);

    return successResponse(
      res,
      {
        accessToken,
        refreshToken,
        organization: { id: org.id, name: org.name, inviteCode: org.inviteCode },
        account: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
      },
      "Successfully joined organization",
      201
    );
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// REFRESH TOKEN
// ───────────────────────────────────────────────
// POST /api/auth/refresh-token
export async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return errorResponse(res, "Refresh token is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const result = await rotateRefreshToken(token);

    if (!result.success) {
      return unauthorizedResponse(res, result.error);
    }

    return successResponse(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      account: {
        id: result.account.id,
        name: result.account.name,
        email: result.account.email,
        role: result.account.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// LOGOUT
// ───────────────────────────────────────────────
// POST /api/auth/logout
export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const { refreshToken: refreshTokenValue } = req.body;

    // Blacklist access token if provided
    if (authHeader) {
      const accessToken = authHeader.split(" ")[1];
      if (accessToken) {
        await blacklistAccessToken(accessToken);
      }
    }

    // Revoke refresh token if provided
    if (refreshTokenValue) {
      await revokeRefreshToken(refreshTokenValue);
    }

    return successResponse(res, null, "Logged out successfully");
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// LOGOUT ALL DEVICES
// ───────────────────────────────────────────────
// POST /api/auth/logout-all
export async function logoutAll(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return unauthorizedResponse(res);
    }

    const accessToken = authHeader.split(" ")[1];
    if (!accessToken) {
      return unauthorizedResponse(res);
    }

    // Blacklist current access token
    await blacklistAccessToken(accessToken);

    // Get account ID from token (we need to verify it first)
    const accountId = req.account?.id;
    if (accountId) {
      // Revoke all refresh tokens
      await revokeAllRefreshTokens(accountId);
    }

    return successResponse(res, null, "Logged out from all devices");
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// FORGOT PASSWORD
// ───────────────────────────────────────────────
// POST /api/auth/forgot-password
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, "Email is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const emailLower = email.toLowerCase().trim();

    const account = await prisma.account.findUnique({
      where: { email: emailLower },
    });

    // Always return success to prevent email enumeration
    if (!account) {
      return successResponse(
        res,
        { email: emailLower },
        "If an account exists with this email, you will receive a password reset OTP"
      );
    }

    // Generate OTP
    const otp = await createPasswordResetOTP(account.id);

    // TODO: Send OTP via email or SMS
    // For now, we'll log it (remove in production!)
    console.log(`[DEV] Password reset OTP for ${emailLower}: ${otp}`);

    // In production, you would:
    // - Send email using nodemailer, SendGrid, etc.
    // - Or send SMS using Twilio, MSG91, etc.

    return successResponse(
      res,
      {
        email: emailLower,
        // Include OTP in response only for development/testing
        // Remove this in production!
        ...(process.env.NODE_ENV !== "production" && { otp }),
      },
      "If an account exists with this email, you will receive a password reset OTP"
    );
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// RESET PASSWORD
// ───────────────────────────────────────────────
// POST /api/auth/reset-password
export async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return errorResponse(res, "Email, OTP, and new password are required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return errorResponse(res, "Password must be at least 8 characters", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const emailLower = email.toLowerCase().trim();

    // Verify OTP
    const result = await verifyPasswordResetOTP(emailLower, otp);

    if (!result.success) {
      return errorResponse(res, result.error, "INVALID_OTP", 400);
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.account.update({
      where: { id: result.account.id },
      data: { passwordHash },
    });

    // Revoke all existing refresh tokens (force re-login)
    await revokeAllRefreshTokens(result.account.id);

    return successResponse(res, null, "Password reset successfully. Please login with your new password.");
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// GET CURRENT USER (ME)
// ───────────────────────────────────────────────
// GET /api/auth/me
export async function getCurrentUser(req, res, next) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.account.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
            bikesLimit: true,
            inviteCode: true,
          },
        },
      },
    });

    if (!account) {
      return notFoundResponse(res, "Account");
    }

    // Get organization user count
    const usersCount = await prisma.account.count({
      where: { organizationId: account.organizationId },
    });

    return successResponse(res, {
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
        createdAt: account.createdAt,
      },
      organization: {
        ...account.organization,
        usersCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// UPDATE PROFILE
// ───────────────────────────────────────────────
// PATCH /api/auth/profile
export async function updateProfile(req, res, next) {
  try {
    const { name, phone } = req.body;

    const updateData = {};

    if (name) {
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      if (phone === "" || phone === null) {
        updateData.phone = null;
      } else {
        const phoneValidation = validatePhone(phone);
        if (!phoneValidation.isValid) {
          return errorResponse(res, phoneValidation.error, ERROR_CODES.INVALID_PHONE, 400);
        }
        updateData.phone = phoneValidation.normalized;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, "No fields to update", ERROR_CODES.MISSING_FIELDS, 400);
    }

    const account = await prisma.account.update({
      where: { id: req.account.id },
      data: updateData,
    });

    return successResponse(
      res,
      {
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
      },
      "Profile updated successfully"
    );
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// CHANGE PASSWORD
// ───────────────────────────────────────────────
// POST /api/auth/change-password
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, "Current password and new password are required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    if (newPassword.length < 8) {
      return errorResponse(res, "New password must be at least 8 characters", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const account = await prisma.account.findUnique({
      where: { id: req.account.id },
    });

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, account.passwordHash);

    if (!isCurrentPasswordValid) {
      return errorResponse(res, "Current password is incorrect", ERROR_CODES.INVALID_CREDENTIALS, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.account.update({
      where: { id: req.account.id },
      data: { passwordHash },
    });

    // Optionally revoke all refresh tokens to force re-login on all devices
    // Uncomment if you want to force re-login after password change:
    // await revokeAllRefreshTokens(req.account.id);

    return successResponse(res, null, "Password changed successfully");
  } catch (err) {
    next(err);
  }
}

// ───────────────────────────────────────────────
// REGISTER FCM TOKEN (for push notifications)
// ───────────────────────────────────────────────
// POST /api/auth/fcm-token
export async function registerFcmToken(req, res, next) {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return errorResponse(res, "FCM token is required", ERROR_CODES.MISSING_FIELDS, 400);
    }

    await prisma.account.update({
      where: { id: req.account.id },
      data: { fcmToken },
    });

    return successResponse(res, null, "FCM token registered successfully");
  } catch (err) {
    next(err);
  }
}
