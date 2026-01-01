/**
 * Standardized API Response Utilities
 * All API responses follow a consistent format for better frontend handling
 */

/**
 * Success Response
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const successResponse = (res, data = {}, message = null, statusCode = 200) => {
  const response = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
};

/**
 * Error Response
 * @param {object} res - Express response object
 * @param {string} error - User-friendly error message
 * @param {string} code - Error code for frontend handling
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {object} details - Optional additional details
 */
export const errorResponse = (res, error, code = "ERROR", statusCode = 400, details = null) => {
  const response = {
    success: false,
    error,
    code,
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Validation Error Response
 * @param {object} res - Express response object
 * @param {array} errors - Array of validation errors
 */
export const validationErrorResponse = (res, errors) => {
  return res.status(400).json({
    success: false,
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    details: { errors },
  });
};

/**
 * Not Found Response
 * @param {object} res - Express response object
 * @param {string} resource - Name of the resource not found
 */
export const notFoundResponse = (res, resource = "Resource") => {
  return res.status(404).json({
    success: false,
    error: `${resource} not found`,
    code: "NOT_FOUND",
  });
};

/**
 * Unauthorized Response
 * @param {object} res - Express response object
 * @param {string} message - Custom message
 */
export const unauthorizedResponse = (res, message = "Unauthorized access") => {
  return res.status(401).json({
    success: false,
    error: message,
    code: "UNAUTHORIZED",
  });
};

/**
 * Forbidden Response
 * @param {object} res - Express response object
 * @param {string} message - Custom message
 */
export const forbiddenResponse = (res, message = "Access forbidden") => {
  return res.status(403).json({
    success: false,
    error: message,
    code: "FORBIDDEN",
  });
};

/**
 * Server Error Response
 * @param {object} res - Express response object
 * @param {Error} err - Error object (logged, not sent to client)
 */
export const serverErrorResponse = (res, err = null) => {
  if (err) {
    console.error("Server Error:", err);
  }

  return res.status(500).json({
    success: false,
    error: "An unexpected error occurred. Please try again later.",
    code: "SERVER_ERROR",
  });
};

/**
 * Conflict Response (for duplicate entries)
 * @param {object} res - Express response object
 * @param {string} message - Conflict message
 */
export const conflictResponse = (res, message = "Resource already exists") => {
  return res.status(409).json({
    success: false,
    error: message,
    code: "CONFLICT",
  });
};

/**
 * Rate Limit Response
 * @param {object} res - Express response object
 * @param {number} retryAfter - Seconds until rate limit resets
 */
export const rateLimitResponse = (res, retryAfter = 60) => {
  return res.status(429).json({
    success: false,
    error: "Too many requests. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
    details: { retryAfter },
  });
};

/**
 * Paginated Success Response
 * @param {object} res - Express response object
 * @param {array} data - Array of items
 * @param {number} total - Total count of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 */
export const paginatedResponse = (res, data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
};

// Error codes for consistent frontend handling
export const ERROR_CODES = {
  // Auth errors
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_FIELDS: "MISSING_FIELDS",
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_EMAIL: "INVALID_EMAIL",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ALREADY_EXISTS: "ALREADY_EXISTS",

  // Booking errors
  BOOKING_OVERLAP: "BOOKING_OVERLAP",
  BIKE_NOT_AVAILABLE: "BIKE_NOT_AVAILABLE",
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
  PAST_DATE: "PAST_DATE",

  // Bike errors
  BIKE_RENTED: "BIKE_RENTED",
  BIKE_IN_MAINTENANCE: "BIKE_IN_MAINTENANCE",
  ACTIVE_BOOKINGS_EXIST: "ACTIVE_BOOKINGS_EXIST",

  // Rate limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // Server errors
  SERVER_ERROR: "SERVER_ERROR",
};

