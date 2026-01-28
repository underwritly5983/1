# Test User Credentials

## Default Test User

If you need to access the application, you can use these test credentials:

**Email:** `test@example.com`  
**Password:** `password123`

## Creating a Test User

### Option 1: Register via Web UI (Recommended)

1. Go to http://localhost:3000/register
2. Fill in the registration form:
   - Email: `test@example.com` (or any email)
   - Password: `password123` (minimum 8 characters)
   - Company Name: `Test Company`
   - Phone: (optional)
3. Click "Sign up"
4. You'll be automatically logged in

### Option 2: Create via Script

Run the test user creation script:

```bash
# From the project root
docker exec ifta_server node create-test-user.js
```

Or if running locally (not Docker):

```bash
cd server
node create-test-user.js
```

### Option 3: Use API Directly

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -F "email=test@example.com" \
  -F "password=password123" \
  -F "companyName=Test Company" \
  -F "phone=555-1234"
```

## Login

Once you have a user account:

1. Go to http://localhost:3000/login
2. Enter your email and password
3. Click "Sign in"

## Troubleshooting

**Can't login?**
- Make sure the server is running: `docker ps`
- Check if user exists in database
- Try registering a new account
- Check server logs: `docker logs ifta_server`

**User already exists?**
- If you get "Email already registered", the user exists
- Try logging in with the credentials above
- Or use a different email to register

**Forgot password?**
- Currently, password reset is not implemented
- You'll need to create a new account with a different email
- Or manually update the password in the database
