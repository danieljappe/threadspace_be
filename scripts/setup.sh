#!/bin/bash

# ThreadSpace Backend Setup Script

echo "🚀 Setting up ThreadSpace Backend with Docker Compose..."

# Stop any existing containers
echo "📦 Stopping existing containers..."
docker-compose down

# Remove old volumes if they exist
echo "🧹 Cleaning up old volumes..."
docker volume rm threadspace_backend_postgres_data threadspace_backend_redis_data 2>/dev/null || true

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 30

# Run database migrations
echo "🗄️ Running database setup..."
docker-compose exec backend npx prisma db push

# Check service health
echo "🏥 Checking service health..."
docker-compose ps

echo "✅ Setup complete!"
echo ""
echo "🌐 Services available at:"
echo "   Backend API: http://localhost:4000"
echo "   GraphQL Playground: http://localhost:4000/graphql"
echo "   Health Check: http://localhost:4000/health"
echo ""
echo "📊 To view logs:"
echo "   docker-compose logs -f backend"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"
