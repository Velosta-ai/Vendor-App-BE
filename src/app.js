import express from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes/index.js";
import { generalLimiter } from "./utils/rateLimiter.js";
import { serverErrorResponse } from "./utils/response.js";

const app = express();

// ─── SECURITY MIDDLEWARE ───────────────────────────────────────────────

// Helmet - Security headers
app.use(helmet());

// CORS Configuration
const corsOptions = {
  origin: process.env.NODE_ENV === "production"
    ? process.env.CORS_ORIGINS?.split(",") || []
    : true, // Allow all origins in development
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Trust proxy for rate limiting behind reverse proxy
app.set("trust proxy", 1);

// ─── RATE LIMITING ─────────────────────────────────────────────────────

// Apply general rate limiting to all routes (disabled in development)
if (process.env.NODE_ENV === "production") {
  app.use(generalLimiter);
}

// ─── ROUTES ────────────────────────────────────────────────────────────

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// API routes
app.use("/api", router);

// ─── 404 HANDLER ───────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    code: "NOT_FOUND",
  });
});

// ─── GLOBAL ERROR HANDLER ──────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);

  // Prisma errors
  if (err.code) {
    // Unique constraint violation
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "A record with this value already exists",
        code: "CONFLICT",
      });
    }

    // Record not found
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: "Record not found",
        code: "NOT_FOUND",
      });
    }

    // Foreign key constraint
    if (err.code === "P2003") {
      return res.status(400).json({
        success: false,
        error: "Related record not found",
        code: "INVALID_REFERENCE",
      });
    }
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
      code: "TOKEN_INVALID",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: "Token has expired",
      code: "TOKEN_EXPIRED",
    });
  }

  // Validation errors
  if (err.name === "ZodError") {
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

  // Syntax error in JSON
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON in request body",
      code: "INVALID_JSON",
    });
  }

  // Default server error
  return serverErrorResponse(res, err);
});

export default app;
