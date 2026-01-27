# IFTA Summarizer Pro - Setup Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+
- Docker and Docker Compose (optional, for containerized setup)
- OpenAI API key (for AI summarization)

## Quick Start

### 1. Install Dependencies

```bash
npm run install-all
```

### 2. Database Setup

#### Option A: Using Docker (Recommended)

```bash
docker-compose up -d postgres
```

This will start a PostgreSQL container on port 5432.

#### Option B: Local PostgreSQL

Create a database:
```sql
CREATE DATABASE ifta_db;
CREATE USER ifta_user WITH PASSWORD 'ifta_password';
GRANT ALL PRIVILEGES ON DATABASE ifta_db TO ifta_user;
```

### 3. Environment Variables

Copy the example environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env` and set:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - A secure random string for JWT tokens
- `OPENAI_API_KEY` - Your OpenAI API key
- `FRONTEND_URL` - Frontend URL (http://localhost:3000 for dev)

### 4. Initialize Database Schema

The schema will be automatically created on first server start, or run manually:

```bash
cd server
npm run migrate
```

### 5. Start Development Servers

```bash
npm run dev
```

This starts both:
- Backend server on http://localhost:5000
- Frontend dev server on http://localhost:3000

## Production Deployment

### Vercel Deployment

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Docker Production

```bash
docker-compose up -d
```

## Features Implemented

✅ **Authentication System**
- User registration with company info and logo
- JWT-based authentication
- Password management

✅ **IFTA Report Processing**
- PDF upload and parsing
- Intelligent quarter detection from document content
- AI-powered summarization using OpenAI
- 6-month age warning system

✅ **Report Generation**
- Multi-quarter summary reports
- Custom branding (logo and colors)
- Chronological organization (Q1-Q4)

✅ **Subscription Management**
- Free tier (5 reports/month)
- Premium tier (unlimited reports + custom branding)
- Upgrade flow

✅ **Admin Dashboard**
- User management
- Usage analytics
- Platform statistics

✅ **Notifications**
- Real-time notification system
- Unread count tracking
- Actionable notifications

✅ **Professional UI**
- Tailwind CSS styling
- Responsive design
- Modern, polished interface

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Reports
- `POST /api/reports/upload` - Upload IFTA report
- `GET /api/reports` - List all reports
- `GET /api/reports/:id` - Get report details
- `DELETE /api/reports/:id` - Delete report
- `POST /api/reports/generate-summary` - Generate summary report
- `GET /api/reports/generated/list` - List generated reports
- `GET /api/reports/generated/:id` - Get generated report

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/password` - Change password

### Subscriptions
- `GET /api/subscriptions/current` - Get current subscription
- `GET /api/subscriptions/pricing` - Get pricing tiers
- `POST /api/subscriptions/upgrade` - Upgrade subscription

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

### Admin
- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET /api/admin/users` - List users
- `GET /api/admin/users/:id` - User details
- `PUT /api/admin/users/:id/subscription` - Update user subscription

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database and user exist

### File Upload Issues
- Check uploads directory permissions
- Verify MAX_FILE_SIZE setting
- Ensure sufficient disk space

### AI Summarization Not Working
- Verify OPENAI_API_KEY is set
- Check API key has sufficient credits
- Review server logs for errors

## Support

For issues or questions, please contact support@iftasummarizer.com
