# Login Troubleshooting Guide

## Test User Credentials

**Email:** `test@example.com`  
**Password:** `password123`

## Common Issues and Solutions

### 1. "Invalid credentials" Error

**Possible causes:**
- Wrong email or password
- Password hash mismatch
- User doesn't exist

**Solutions:**
1. Verify credentials are correct (case-sensitive)
2. Reset the test user password:
   ```bash
   docker exec ifta_server node create-test-user.js
   ```
3. Check if user exists:
   ```bash
   docker exec ifta_postgres psql -U ifta_user -d ifta_db -c "SELECT email FROM users WHERE email = 'test@example.com';"
   ```

### 2. "Too many requests" Error

**Cause:** Rate limiting is blocking requests

**Solutions:**
1. Wait 15 minutes for rate limit to reset
2. Or restart the server to reset limits:
   ```bash
   docker-compose -f docker-compose.dev.yml restart server
   ```

### 3. Network/CORS Errors

**Check:**
1. Server is running: `docker ps`
2. API is accessible: Open http://localhost:5000/api/health
3. Frontend can reach backend: Check browser console for errors

### 4. Token Issues

**Symptoms:**
- Login succeeds but can't access protected routes
- "Invalid token" errors

**Solutions:**
1. Clear browser localStorage:
   - Open browser DevTools (F12)
   - Go to Application/Storage tab
   - Clear Local Storage
   - Try logging in again

2. Check JWT_SECRET is set in server

### 5. Database Connection Issues

**Check:**
```bash
docker logs ifta_server | grep -i "database\|error"
```

**Solution:**
```bash
docker-compose -f docker-compose.dev.yml restart
```

## Manual Login Test

Test the login API directly:

**PowerShell:**
```powershell
$body = @{
    email = 'test@example.com'
    password = 'password123'
} | ConvertTo-Json

Invoke-WebRequest -Uri 'http://localhost:5000/api/auth/login' `
    -Method POST `
    -ContentType 'application/json' `
    -Body $body `
    -UseBasicParsing
```

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Create New Test User

If the test user doesn't work, create a new one:

1. **Via Web UI:**
   - Go to http://localhost:3000/register
   - Fill in the form
   - Register new account

2. **Via Script:**
   ```bash
   docker exec ifta_server node create-test-user.js
   ```

3. **Via API:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -F "email=newuser@test.com" \
     -F "password=password123" \
     -F "companyName=Test Company"
   ```

## Check Server Logs

View real-time login attempts:
```bash
docker logs ifta_server -f | grep -i "login\|auth\|error"
```

## Still Not Working?

1. Check browser console (F12) for JavaScript errors
2. Check Network tab for API request/response
3. Verify server is running: `docker ps`
4. Check server logs: `docker logs ifta_server --tail=50`
5. Try registering a new account instead
