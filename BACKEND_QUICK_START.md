# Backend Quick Start Guide

## ✅ Backend is Running!

Your backend API is live at: **http://localhost:5000**

## 🧪 Test the Backend

### Option 1: Visual HTML Tester (Recommended)

1. Open `server/test-api.html` in your browser
2. Test registration, login, and profile endpoints
3. See responses in real-time

**To serve the HTML file:**
```bash
# In the server directory
cd server
python -m http.server 8080
# Then open: http://localhost:8080/test-api.html
```

### Option 2: PowerShell Test Script

```bash
.\test-backend.ps1
```

This automatically tests:
- ✅ Health check
- ✅ User registration
- ✅ User login
- ✅ Get profile (authenticated)

### Option 3: Manual Testing

**Health Check:**
```bash
curl http://localhost:5000/api/health
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 📚 Documentation

- **`BACKEND_API.md`** - Complete API reference with all endpoints
- **`server/TEST_API.md`** - Testing guide and examples
- **`server/test-api.html`** - Visual API tester

## 🔑 Test Credentials

After running the test script, you can use:
- **Email:** test@example.com
- **Password:** password123

## 🎯 Key Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | No | Health check |
| `/api/auth/register` | POST | No | Register new user |
| `/api/auth/login` | POST | No | Login user |
| `/api/users/profile` | GET | Yes | Get user profile |
| `/api/reports` | GET | Yes | List reports |
| `/api/reports/upload` | POST | Yes | Upload IFTA report |

## 🔐 Authentication

After logging in, you'll receive a JWT token. Use it in the Authorization header:

```
Authorization: Bearer <your_token_here>
```

## 📊 Backend Architecture

```
server/
├── index.js              # Main server file
├── config/
│   └── database.js      # Database connection
├── routes/
│   ├── auth.js          # Authentication
│   ├── users.js         # User management
│   ├── reports.js       # IFTA reports
│   ├── subscriptions.js # Subscriptions
│   ├── notifications.js # Notifications
│   └── admin.js         # Admin dashboard
├── services/
│   ├── pdfParser.js     # PDF parsing
│   ├── aiService.js     # AI summarization
│   └── reportGenerator.js # Report generation
└── middleware/
    └── auth.js          # JWT authentication
```

## 🚀 Next Steps

1. **Test the API** using the HTML tester or test script
2. **Review the API docs** in `BACKEND_API.md`
3. **Try logging in** through the frontend at http://localhost:3000
4. **Upload a test report** to see the full workflow

## 🐛 Troubleshooting

**Backend not responding?**
- Check if server is running: `docker ps` (look for `ifta_server`)
- Check server logs: `docker-compose -f docker-compose.dev.yml logs server`

**Can't login?**
- Make sure you've registered first
- Check email/password are correct
- Verify token is being sent in requests

**Database errors?**
- Wait for database to be healthy: `docker ps` (should show "healthy")
- Check database logs: `docker-compose -f docker-compose.dev.yml logs postgres`
