# Testing the Backend API

## Quick Test Methods

### 1. Using the HTML Tester

Open `server/test-api.html` in your browser to test the API with a visual interface.

**To serve it:**
```bash
# Option 1: Using Python
cd server
python -m http.server 8080
# Then open http://localhost:8080/test-api.html

# Option 2: Using Node.js http-server
npx http-server -p 8080
# Then open http://localhost:8080/test-api.html
```

### 2. Using cURL

#### Health Check
```bash
curl http://localhost:5000/api/health
```

#### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -F "email=test@example.com" \
  -F "password=password123" \
  -F "companyName=Test Company" \
  -F "phone=555-1234"
```

#### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

#### Get Profile (with token)
```bash
curl http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Using Postman

1. Import the collection (see below)
2. Set environment variable `base_url` to `http://localhost:5000/api`
3. Login first to get token
4. Token is automatically saved to `auth_token` variable

### 4. Using JavaScript/Fetch

```javascript
// Login
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'password123'
  })
});

const { token, user } = await response.json();

// Use token for authenticated requests
const profileResponse = await fetch('http://localhost:5000/api/users/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Test User Creation

1. **Register a test user:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -F "email=admin@test.com" \
     -F "password=admin123" \
     -F "companyName=Test Brokerage"
   ```

2. **Login to get token:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@test.com","password":"admin123"}'
   ```

3. **Save the token and use it for authenticated requests**

## Common Test Scenarios

### Scenario 1: Full User Flow
1. Register → Get token
2. Login → Get token
3. Get profile → Verify user data
4. Update profile → Modify company info
5. Upload report → Test file upload
6. Get reports → List uploaded reports

### Scenario 2: Error Handling
1. Try login with wrong password → Should get 401
2. Try register with existing email → Should get 400
3. Try access protected route without token → Should get 401
4. Try upload non-PDF file → Should get error

## Troubleshooting

### CORS Errors
If testing from browser, make sure:
- Server CORS is configured for your origin
- Using correct port (5000 for API)

### Connection Refused
- Check if server is running: `docker ps` or `npm run server`
- Verify port 5000 is not blocked
- Check server logs for errors

### Authentication Errors
- Verify token is being sent in Authorization header
- Check token hasn't expired (7 days default)
- Ensure token format: `Bearer <token>`
