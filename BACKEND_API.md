# Backend API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 🔐 Authentication Endpoints

### POST `/api/auth/register`
Register a new user account.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `email` (string, required) - User email
  - `password` (string, required, min 8 chars) - User password
  - `companyName` (string, required) - Company name
  - `phone` (string, optional) - Phone number
  - `logo` (file, optional) - Company logo image
  - `brandColorPrimary` (string, optional) - Hex color code (e.g., #2563eb)
  - `brandColorSecondary` (string, optional) - Hex color code

**Response:**
```json
{
  "message": "User created successfully",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "companyName": "My Company",
    "phone": "555-1234",
    "logoUrl": "/uploads/logos/logo-123.jpg",
    "brandColorPrimary": "#2563eb",
    "brandColorSecondary": "#1e40af",
    "subscriptionTier": "free"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -F "email=test@example.com" \
  -F "password=password123" \
  -F "companyName=Test Company" \
  -F "phone=555-1234"
```

---

### POST `/api/auth/login`
Login with email and password.

**Request:**
- Content-Type: `application/json`
- Body:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "companyName": "My Company",
    "subscriptionTier": "free",
    "subscriptionStatus": "active",
    "isAdmin": false
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

---

## 👤 User Endpoints

### GET `/api/users/profile`
Get current user profile. **Requires authentication.**

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "companyName": "My Company",
  "phone": "555-1234",
  "logoUrl": "/uploads/logos/logo-123.jpg",
  "brandColorPrimary": "#2563eb",
  "brandColorSecondary": "#1e40af",
  "subscriptionTier": "free",
  "subscriptionStatus": "active",
  "createdAt": "2026-01-27T00:00:00.000Z",
  "lastLogin": "2026-01-27T12:00:00.000Z"
}
```

---

### PUT `/api/users/profile`
Update user profile. **Requires authentication.**

**Request:** `multipart/form-data`
- `companyName` (string, optional)
- `phone` (string, optional)
- `logo` (file, optional)
- `brandColorPrimary` (string, optional)
- `brandColorSecondary` (string, optional)

---

### PUT `/api/users/password`
Change password. **Requires authentication.**

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

---

## 📄 Report Endpoints

### POST `/api/reports/upload`
Upload an IFTA report PDF. **Requires authentication.**

**Request:** `multipart/form-data`
- `file` (file, required) - PDF file (max 10MB)

**Response:**
```json
{
  "message": "Report uploaded successfully",
  "report": {
    "id": 1,
    "fileName": "IFTA_Q1_2025.pdf",
    "quarter": "Q1",
    "year": 2025,
    "detectedDate": "2025-01-15",
    "status": "processing",
    "isOldReport": false
  },
  "warning": null
}
```

---

### GET `/api/reports`
Get all user's reports. **Requires authentication.**

**Response:**
```json
{
  "reports": [
    {
      "id": 1,
      "fileName": "IFTA_Q1_2025.pdf",
      "quarter": "Q1",
      "year": 2025,
      "detectedDate": "2025-01-15",
      "status": "completed",
      "createdAt": "2026-01-27T00:00:00.000Z",
      "summary": { ... }
    }
  ]
}
```

---

### GET `/api/reports/:id`
Get single report details. **Requires authentication.**

---

### DELETE `/api/reports/:id`
Delete a report. **Requires authentication.**

---

### POST `/api/reports/generate-summary`
Generate summary report from multiple reports. **Requires authentication.**

**Request:**
```json
{
  "reportIds": [1, 2, 3, 4],
  "reportName": "2024 Annual Summary"
}
```

---

## 💳 Subscription Endpoints

### GET `/api/subscriptions/current`
Get current subscription. **Requires authentication.**

**Response:**
```json
{
  "tier": "free",
  "status": "active",
  "currentPeriodStart": null,
  "currentPeriodEnd": null,
  "cancelAtPeriodEnd": false
}
```

---

### GET `/api/subscriptions/pricing`
Get pricing tiers (public).

**Response:**
```json
{
  "tiers": [
    {
      "id": "free",
      "name": "Free",
      "price": 0,
      "features": [...]
    },
    {
      "id": "premium",
      "name": "Premium",
      "price": 49,
      "pricePeriod": "month",
      "features": [...]
    }
  ]
}
```

---

### POST `/api/subscriptions/upgrade`
Upgrade to premium. **Requires authentication.**

**Request:**
```json
{
  "tier": "premium"
}
```

---

## 🔔 Notification Endpoints

### GET `/api/notifications`
Get user notifications. **Requires authentication.**

**Query Parameters:**
- `unreadOnly` (boolean, optional) - Filter unread only

**Response:**
```json
{
  "notifications": [
    {
      "id": 1,
      "type": "report_processed",
      "title": "Report Processed",
      "message": "Your IFTA report has been processed",
      "read": false,
      "actionUrl": "/reports/1",
      "createdAt": "2026-01-27T00:00:00.000Z"
    }
  ]
}
```

---

### PUT `/api/notifications/:id/read`
Mark notification as read. **Requires authentication.**

---

### PUT `/api/notifications/read-all`
Mark all notifications as read. **Requires authentication.**

---

## 👨‍💼 Admin Endpoints

### GET `/api/admin/dashboard`
Get admin dashboard stats. **Requires admin authentication.**

**Response:**
```json
{
  "stats": {
    "totalUsers": 100,
    "premiumUsers": 25,
    "freeUsers": 75,
    "totalReports": 500,
    "monthlyReports": 50,
    "recentSignups": 10
  },
  "analytics": [...]
}
```

---

### GET `/api/admin/users`
Get all users. **Requires admin authentication.**

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50)
- `search` (string, optional)

---

## 🏥 Health Check

### GET `/api/health`
Check API health (public).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-27T12:00:00.000Z"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

- 100 requests per 15 minutes per IP address
- Applied to all `/api/*` routes

---

## File Uploads

- **Logo:** Max 5MB, formats: JPEG, JPG, PNG, GIF, SVG
- **IFTA Reports:** Max 10MB, format: PDF only

---

## Database Schema

See `server/schema.sql` for complete database structure.

**Main Tables:**
- `users` - User accounts
- `ifta_reports` - Uploaded IFTA reports
- `generated_reports` - Summary reports
- `notifications` - User notifications
- `subscriptions` - Subscription management
- `usage_analytics` - Platform analytics
