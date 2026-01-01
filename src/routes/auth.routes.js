import { Router } from "express";
import {
  registerOrg,
  login,
  joinOrg,
  refreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  updateProfile,
  changePassword,
  registerFcmToken,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  loginLimiter,
  registrationLimiter,
  passwordResetLimiter,
  refreshTokenLimiter,
} from "../utils/rateLimiter.js";

const router = Router();

// ─── PUBLIC ROUTES (with rate limiting) ────────────────────────────────

// Registration - 3 per hour per IP
router.post("/register-org", registrationLimiter, registerOrg);

// Login - 5 attempts per 15 minutes per IP/email
router.post("/login", loginLimiter, login);

// Join organization - 3 per hour per IP
router.post("/join-org", registrationLimiter, joinOrg);

// Refresh token - 10 per minute
router.post("/refresh-token", refreshTokenLimiter, refreshToken);

// Password reset - 3 per hour per email
router.post("/forgot-password", passwordResetLimiter, forgotPassword);
router.post("/reset-password", passwordResetLimiter, resetPassword);

// ─── PROTECTED ROUTES ──────────────────────────────────────────────────

// Logout (can work with or without valid token)
router.post("/logout", logout);

// Logout from all devices (requires valid token)
router.post("/logout-all", authenticate, logoutAll);

// Get current user
router.get("/me", authenticate, getCurrentUser);

// Update profile
router.patch("/profile", authenticate, updateProfile);

// Change password
router.post("/change-password", authenticate, changePassword);

// Register FCM token for push notifications
router.post("/fcm-token", authenticate, registerFcmToken);

export default router;
