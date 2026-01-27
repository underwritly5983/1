# PowerShell script to test backend API

$API_BASE = "http://localhost:5000/api"

Write-Host "Testing IFTA Backend API" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/health" -Method GET -UseBasicParsing
    Write-Host "[OK] Health Check: Success" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure the server is running on port 5000" -ForegroundColor Yellow
    exit
}

Write-Host ""

# Test 2: Register
Write-Host "2. Testing Registration..." -ForegroundColor Yellow
$registerData = @{
    email = "test@example.com"
    password = "password123"
    companyName = "Test Company"
    phone = "555-1234"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$API_BASE/auth/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerData `
        -UseBasicParsing
    
    $result = $response.Content | ConvertFrom-Json
    Write-Host "[OK] Registration: Success" -ForegroundColor Green
    Write-Host "   User ID: $($result.user.id)" -ForegroundColor Gray
    Write-Host "   Email: $($result.user.email)" -ForegroundColor Gray
    
    $global:authToken = $result.token
    Write-Host "   Token saved!" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "[WARNING] User already exists (this is OK)" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] Registration Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 3: Login
Write-Host "3. Testing Login..." -ForegroundColor Yellow
$loginData = @{
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$API_BASE/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginData `
        -UseBasicParsing
    
    $result = $response.Content | ConvertFrom-Json
    Write-Host "[OK] Login: Success" -ForegroundColor Green
    Write-Host "   Company: $($result.user.companyName)" -ForegroundColor Gray
    Write-Host "   Tier: $($result.user.subscriptionTier)" -ForegroundColor Gray
    
    $global:authToken = $result.token
    Write-Host "   Token: $($authToken.Substring(0, 50))..." -ForegroundColor Gray
} catch {
    Write-Host "[ERROR] Login Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""

# Test 4: Get Profile
if ($global:authToken) {
    Write-Host "4. Testing Get Profile (Authenticated)..." -ForegroundColor Yellow
    try {
        $headers = @{
            "Authorization" = "Bearer $authToken"
        }
        
        $response = Invoke-WebRequest -Uri "$API_BASE/users/profile" `
            -Method GET `
            -Headers $headers `
            -UseBasicParsing
        
        $result = $response.Content | ConvertFrom-Json
        Write-Host "[OK] Get Profile: Success" -ForegroundColor Green
        Write-Host "   Email: $($result.email)" -ForegroundColor Gray
        Write-Host "   Company: $($result.companyName)" -ForegroundColor Gray
        Write-Host "   Subscription: $($result.subscriptionTier)" -ForegroundColor Gray
    } catch {
        Write-Host "[ERROR] Get Profile Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "All tests completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open server/test-api.html in your browser for visual testing" -ForegroundColor White
Write-Host "  2. See BACKEND_API.md for complete API documentation" -ForegroundColor White
Write-Host "  3. Use the token above for authenticated requests" -ForegroundColor White
