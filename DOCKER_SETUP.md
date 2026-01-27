# Docker Setup Guide

## Quick Start with Docker

### 1. Create Environment File

Create a `.env` file in the root directory:

```env
JWT_SECRET=your-super-secret-jwt-key-change-this
OPENAI_API_KEY=your-openai-api-key-here
```

### 2. Start All Services

```bash
docker-compose -f docker-compose.dev.yml up --build
```

Or for detached mode (runs in background):

```bash
docker-compose -f docker-compose.dev.yml up -d --build
```

### 3. Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **PostgreSQL:** localhost:5432

### 4. View Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f client
docker-compose -f docker-compose.dev.yml logs -f server
docker-compose -f docker-compose.dev.yml logs -f postgres
```

### 5. Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

To also remove volumes (database data):

```bash
docker-compose -f docker-compose.dev.yml down -v
```

## Troubleshooting

### Port Already in Use

If port 3000 or 5000 is already in use:

1. Stop the service using the port:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   
   # Mac/Linux
   lsof -ti:3000 | xargs kill
   ```

2. Or change ports in `docker-compose.dev.yml`:
   ```yaml
   ports:
     - "3001:3000"  # Change 3001 to any available port
   ```

### Client Not Loading

1. Check if client container is running:
   ```bash
   docker ps
   ```

2. Check client logs:
   ```bash
   docker-compose -f docker-compose.dev.yml logs client
   ```

3. Verify environment variable:
   ```bash
   docker-compose -f docker-compose.dev.yml exec client env | grep VITE_API_URL
   ```

### Database Connection Issues

1. Wait for database to be healthy:
   ```bash
   docker-compose -f docker-compose.dev.yml ps
   ```
   Wait until postgres shows as "healthy"

2. Check database logs:
   ```bash
   docker-compose -f docker-compose.dev.yml logs postgres
   ```

### Rebuild After Code Changes

If you make changes to dependencies:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

### Clear Everything and Start Fresh

```bash
# Stop and remove everything
docker-compose -f docker-compose.dev.yml down -v

# Remove all images
docker-compose -f docker-compose.dev.yml down --rmi all

# Rebuild from scratch
docker-compose -f docker-compose.dev.yml up --build
```

## Development Workflow

The setup uses volume mounts for hot-reload:
- Code changes in `./client` automatically reflect in the container
- Code changes in `./server` automatically reflect in the container
- Database persists in a Docker volume

## Production Build

For production, use the regular `docker-compose.yml`:

```bash
docker-compose up --build
```

This builds optimized production images.
