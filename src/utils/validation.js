import { z } from "zod";

/**
 * Indian Phone Number Validation
 * Accepts: 10-digit numbers, optionally prefixed with +91 or 91
 * Normalizes to: +91XXXXXXXXXX format
 */
export const phoneSchema = z
  .string()
  .transform((val) => {
    // Remove all non-digit characters except +
    let cleaned = val.replace(/[^\d+]/g, "");

    // Handle various formats
    if (cleaned.startsWith("+91")) {
      cleaned = cleaned.slice(3);
    } else if (cleaned.startsWith("91") && cleaned.length > 10) {
      cleaned = cleaned.slice(2);
    } else if (cleaned.startsWith("0")) {
      cleaned = cleaned.slice(1);
    }

    return cleaned;
  })
  .refine((val) => /^[6-9]\d{9}$/.test(val), {
    message: "Please enter a valid 10-digit Indian mobile number",
  })
  .transform((val) => `+91${val}`);

/**
 * Validate phone number and return normalized version
 * @param {string} phone - Phone number to validate
 * @returns {{ isValid: boolean, normalized: string|null, error: string|null }}
 */
export const validatePhone = (phone) => {
  try {
    const result = phoneSchema.parse(phone);
    return { isValid: true, normalized: result, error: null };
  } catch (err) {
    return {
      isValid: false,
      normalized: null,
      error: err.errors?.[0]?.message || "Invalid phone number",
    };
  }
};

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .toLowerCase()
  .trim();

/**
 * Password validation schema
 * Min 8 characters, at least one letter and one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Auth Schemas
 */
export const registerOrgSchema = z.object({
  orgName: z.string().min(2, "Organization name must be at least 2 characters").max(100),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const joinOrgSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Booking Schemas
 */
export const createBookingSchema = z.object({
  customerName: z.string().min(2, "Customer name must be at least 2 characters").max(100),
  phone: phoneSchema,
  bikeId: z.string().uuid("Invalid bike ID"),
  startDate: z.string().datetime({ message: "Invalid start date format" }),
  endDate: z.string().datetime({ message: "Invalid end date format" }),
  totalAmount: z.number().positive("Total amount must be positive").optional(),
  paidAmount: z.number().min(0, "Paid amount cannot be negative").optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER"]).optional(),
  paymentNotes: z.string().max(500).optional(),
});

export const updateBookingSchema = createBookingSchema.partial();

/**
 * Bike Schemas
 */
export const createBikeSchema = z.object({
  name: z.string().min(2, "Bike name must be at least 2 characters").max(100),
  model: z.string().max(100).optional(),
  registrationNumber: z
    .string()
    .min(1, "Registration number is required")
    .max(20)
    .transform((val) => val.toUpperCase().replace(/\s/g, "")),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  dailyRate: z.number().positive("Daily rate must be positive"),
});

export const updateBikeSchema = createBikeSchema.partial();

/**
 * Lead Schemas
 */
export const createLeadSchema = z.object({
  phone: phoneSchema,
  message: z.string().max(1000).optional(),
  source: z.string().max(50).optional().default("manual"),
});

export const updateLeadStatusSchema = z.object({
  status: z.enum(["new", "contacted", "in_progress", "converted", "lost"]),
});

/**
 * Pagination Schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Date Range Schema
 */
export const dateRangeSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

/**
 * Validate request body with Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware
 */
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: {
            errors: err.errors.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
        });
      }
      next(err);
    }
  };
};

/**
 * Validate query parameters with Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          code: "VALIDATION_ERROR",
          details: {
            errors: err.errors.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
        });
      }
      next(err);
    }
  };
};

