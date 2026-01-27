#!/bin/bash

# Quick start script for Docker

echo "🚀 Starting IFTA Summarizer Pro with Docker..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Creating .env file from template..."
    cat > .env << EOF
JWT_SECRET=$(openssl rand -base64 32)
OPENAI_API_KEY=your-openai-api-key-here
EOF
    echo "✅ Created .env file. Please add your OPENAI_API_KEY!"
fi

# Create uploads directories
mkdir -p uploads/logos uploads/reports

# Start services
echo "📦 Starting Docker containers..."
docker-compose -f docker-compose.dev.yml up --build
