# Updated Login Credentials

## Test User Account

**Email:** `test@example.com`  
**Password:** `password123`

## How to Login

1. Go to http://localhost:3000/login
2. Enter the email and password above
3. Click "Sign in"

## If Login Still Doesn't Work

1. **Clear browser cache and localStorage:**
   - Press F12 (DevTools)
   - Go to Application tab
   - Clear Local Storage
   - Refresh page

2. **Check server is running:**
   ```bash
   docker ps
   ```
   Should show `ifta_server`, `ifta_client`, and `ifta_postgres` running

3. **Check server logs:**
   ```bash
   docker logs ifta_server --tail=50
   ```

4. **Create a new account:**
   - Go to http://localhost:3000/register
   - Use any email and password (min 8 chars)
   - Fill in company name
   - Register

## Server Status

The server has been restarted and the test user exists in the database.
