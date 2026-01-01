# Velosta Vendor App - Backend API

A production-ready REST API for the Velosta bike rental vendor management app.

## Features

- 🔐 **Authentication & Authorization**
  - JWT access tokens (15-minute expiry)
  - Refresh token rotation
  - Password reset with OTP
  - Role-based access control (ADMIN, MANAGER, STAFF)
  - Token blacklisting for logout

- 🚴 **Bike Management**
  - CRUD operations with soft delete
  - Status tracking (AVAILABLE, RENTED, MAINTENANCE)
  - Document management (RC, Insurance, PUC)
  - Maintenance logs
  - Bike availability checking

- 📅 **Booking Management**
  - Full booking lifecycle
  - Overlap detection with helpful error messages
  - Payment tracking
  - Bulk operations
  - Pagination and filtering

- 📊 **Dashboard & Analytics**
  - Real-time statistics
  - Revenue tracking
  - Booking insights
  - Lead conversion metrics

- 🛡️ **Security**
  - Helmet security headers
  - CORS configuration
  - Rate limiting
  - Input validation (Zod)
  - Indian phone number validation

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Vendor-App-BE

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## API Documentation

### Base URL
```
Development: http://localhost:3001/api
Production: https://api.velosta.in/api
```

### Response Format

All endpoints return responses in a standardized format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

**Paginated Response:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Authentication Endpoints

### Register Organization
Creates a new organization with the first admin user.

```
POST /api/auth/register-org
```

**Body:**
```json
{
  "orgName": "My Bike Rentals",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phone": "9876543210"  // optional
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "uuid-refresh-token",
    "organization": { "id": "...", "name": "...", "inviteCode": "ORG-ABC123" },
    "account": { "id": "...", "name": "...", "email": "...", "role": "ADMIN" }
  }
}
```

### Login
```
POST /api/auth/login
```

**Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Rate Limit:** 5 attempts per 15 minutes per IP/email

### Refresh Token
```
POST /api/auth/refresh-token
```

**Body:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

### Logout
```
POST /api/auth/logout
```

**Body:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

### Forgot Password
```
POST /api/auth/forgot-password
```

**Body:**
```json
{
  "email": "john@example.com"
}
```

**Rate Limit:** 3 per hour per email

### Reset Password
```
POST /api/auth/reset-password
```

**Body:**
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newSecurePassword123"
}
```

### Get Current User
```
GET /api/auth/me
Authorization: Bearer <access-token>
```

### Update Profile
```
PATCH /api/auth/profile
Authorization: Bearer <access-token>
```

**Body:**
```json
{
  "name": "New Name",
  "phone": "9876543210"
}
```

### Change Password
```
POST /api/auth/change-password
Authorization: Bearer <access-token>
```

**Body:**
```json
{
  "currentPassword": "oldPassword",
  "newPassword": "newPassword123"
}
```

---

## Bikes Endpoints

All endpoints require authentication.

### List Bikes
```
GET /api/bikes?status=AVAILABLE&search=Honda&page=1&limit=20
```

### Get Bike by ID
```
GET /api/bikes/:id
```

### Create Bike
```
POST /api/bikes
```

**Body:**
```json
{
  "name": "Honda Activa",
  "model": "6G",
  "registrationNumber": "KA01AB1234",
  "year": 2023,
  "dailyRate": 500
}
```

### Update Bike
```
PUT /api/bikes/:id
```

### Delete Bike (Soft Delete)
```
DELETE /api/bikes/:id
```

### Get Bike Availability
```
GET /api/bikes/:id/availability
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bikeId": "...",
    "isAvailableNow": false,
    "currentBooking": { "customerName": "...", "endDate": "..." },
    "nextAvailableDate": "2025-01-15T00:00:00.000Z",
    "returnInDays": 3
  }
}
```

### Toggle Maintenance
```
PATCH /api/bikes/:id/maintenance
```

### Add Maintenance Log
```
POST /api/bikes/:id/maintenance-log
```

**Body:**
```json
{
  "type": "SERVICE",
  "description": "Regular oil change",
  "cost": 500,
  "notes": "Next service after 3000km"
}
```

### Add Document
```
POST /api/bikes/:id/documents
```

**Body:**
```json
{
  "type": "INSURANCE",
  "url": "https://...",
  "expiryDate": "2025-12-31"
}
```

### Get Expiring Documents
```
GET /api/bikes/documents/expiring?days=30
```

---

## Bookings Endpoints

### List Bookings
```
GET /api/bookings?status=ACTIVE&search=customer&page=1&limit=20&bikeId=...&dateFrom=...&dateTo=...
```

### Get Booking by ID
```
GET /api/bookings/:id
```

### Create Booking
```
POST /api/bookings
```

**Body:**
```json
{
  "customerName": "Customer Name",
  "phone": "9876543210",
  "bikeId": "bike-uuid",
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-01-05T23:59:59.999Z",
  "totalAmount": 2500,
  "paidAmount": 1000,
  "notes": "Extra helmet provided",
  "paymentMethod": "UPI"
}
```

**Overlap Error Response:**
```json
{
  "success": false,
  "error": "Bike not available for selected dates",
  "code": "BOOKING_OVERLAP",
  "nextAvailableDate": "2025-01-10T00:00:00.000Z",
  "details": {
    "returnInDays": 5,
    "blockingBooking": { ... }
  }
}
```

### Update Booking
```
PUT /api/bookings/:id
```

### Mark as Returned
```
PATCH /api/bookings/:id/returned
```

### Bulk Mark as Returned
```
POST /api/bookings/bulk-return
```

**Body:**
```json
{
  "bookingIds": ["id1", "id2", "id3"]
}
```

### Add Payment
```
POST /api/bookings/:id/payments
```

**Body:**
```json
{
  "amount": 500,
  "method": "CASH",
  "notes": "Partial payment"
}
```

### Delete Booking (Soft Delete)
```
DELETE /api/bookings/:id
```

---

## Dashboard Endpoints

### Get Full Dashboard
```
GET /api/dashboard
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bikes": { "total": 10, "available": 5, "rented": 4, "maintenance": 1 },
    "bookings": { "active": 4, "upcoming": 2, "pendingReturns": 1, "returnedToday": 2, "completedThisMonth": 15 },
    "leads": { "new": 5, "open": 3, "convertedThisMonth": 8 },
    "revenue": { "total": 150000, "thisMonth": 25000, "lastMonth": 22000, "pending": 5000 },
    "vendor": { "name": "...", "plan": "free", "bikesLimit": 10, "usersCount": 2 },
    "activity": { "recentBookings": [...], "dueToday": [...], "overdueReturns": [...] }
  }
}
```

### Get Quick Stats
```
GET /api/dashboard/stats
```

---

## Leads Endpoints

### List Leads
```
GET /api/leads?status=new&source=whatsapp&page=1&limit=20
```

### Get Lead Stats
```
GET /api/leads/stats
```

### Create Lead
```
POST /api/leads
```

**Body:**
```json
{
  "phone": "9876543210",
  "message": "Interested in renting bike for weekend",
  "source": "whatsapp"
}
```

### Update Lead Status
```
PATCH /api/leads/:id/status
```

**Body:**
```json
{
  "status": "contacted"  // new, contacted, in_progress, converted, lost
}
```

### Convert Lead to Booking
```
POST /api/leads/:id/convert
```

**Body:**
```json
{
  "customerName": "...",
  "bikeId": "...",
  "startDate": "...",
  "endDate": "..."
}
```

### Delete Lead
```
DELETE /api/leads/:id
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `MISSING_FIELDS` | Required fields are missing |
| `INVALID_PHONE` | Phone number validation failed |
| `INVALID_EMAIL` | Email validation failed |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Permission denied |
| `TOKEN_EXPIRED` | JWT token has expired |
| `TOKEN_INVALID` | JWT token is invalid |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `BOOKING_OVERLAP` | Bike already booked for dates |
| `BIKE_RENTED` | Bike is currently rented |
| `BIKE_IN_MAINTENANCE` | Bike is in maintenance |
| `ACTIVE_BOOKINGS_EXIST` | Cannot delete with active bookings |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `SERVER_ERROR` | Internal server error |

---

## Phone Number Validation

The API accepts Indian phone numbers in these formats:
- `9876543210`
- `09876543210`
- `919876543210`
- `+919876543210`

All are normalized and stored as `+919876543210`.

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 5 per 15 min per IP/email |
| Register | 3 per hour per IP |
| Forgot Password | 3 per hour per email |
| Refresh Token | 10 per minute |
| General API | 100 per 15 min |

---

## Development

```bash
# Run development server with hot reload
npm run dev

# Run Prisma Studio (database GUI)
npx prisma studio

# Generate Prisma client
npm run generate

# Run migrations
npm run migrate

# Format Prisma schema
npx prisma format
```

## Production Deployment

```bash
# Set NODE_ENV
export NODE_ENV=production

# Run migrations
npx prisma migrate deploy

# Start server
npm start
```

## License

MIT
