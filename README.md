# ThreadSpace Backend

A robust Node.js backend API built with Express, GraphQL, TypeScript, and PostgreSQL for the ThreadSpace discussion platform.

## 🚀 Features

- **GraphQL API** - Flexible and efficient data querying with Apollo Server
- **Real-time Subscriptions** - WebSocket support for live updates
- **Authentication & Authorization** - JWT-based auth with refresh tokens
- **Database Integration** - PostgreSQL with Prisma ORM
- **Caching** - Redis for session management and performance
- **Type Safety** - Full TypeScript support throughout
- **Security** - Helmet, CORS, input validation, and rate limiting
- **Logging** - Structured logging with Winston
- **Health Checks** - Built-in health monitoring

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **API**: GraphQL with Apollo Server
- **Database**: PostgreSQL 15
- **ORM**: Prisma
- **Cache**: Redis
- **Authentication**: JWT with Argon2 hashing
- **Validation**: Class Validator
- **Logging**: Winston
- **Security**: Helmet, CORS
- **Real-time**: GraphQL Subscriptions with WebSockets

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker (for containerized development)

## 🚀 Quick Start

### Using Docker (Recommended)

From the project root:

```bash
# Start all services including backend
docker-compose up -d

# Access the API
# GraphQL Playground: http://localhost:4000/graphql
# Health Check: http://localhost:4000/health
```

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Set up the database**
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run database migrations
   npm run db:migrate
   
   # Seed the database (optional)
   npm run db:seed
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Access the API**
   - GraphQL Playground: http://localhost:4000/graphql
   - Health Check: http://localhost:4000/health

## 📁 Project Structure

```
threadspace_backend/
├── src/
│   ├── config/                 # Configuration files
│   │   ├── auth.ts            # JWT configuration
│   │   ├── database.ts        # Database configuration
│   │   ├── logger.ts          # Logging configuration
│   │   └── redis.ts           # Redis configuration
│   ├── graphql/               # GraphQL implementation
│   │   ├── resolvers/         # GraphQL resolvers
│   │   │   └── index.ts       # Main resolvers
│   │   └── schema.ts          # GraphQL schema
│   └── index.ts               # Main server file
├── prisma/                    # Database schema and migrations
│   └── schema.prisma          # Prisma schema
├── database/                  # SQL scripts
│   ├── schema.sql            # Database schema
│   └── seed.sql              # Seed data
├── logs/                     # Log files
├── Dockerfile                # Docker configuration
└── package.json
```

## 🔧 Available Scripts

```bash
# Development
npm run dev           # Start development server with nodemon
npm run build         # Build TypeScript to JavaScript
npm run start         # Start production server

# Database
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema changes to database
npm run db:migrate    # Create and run migrations
npm run db:reset      # Reset database
npm run db:seed       # Seed database with sample data

# Code Quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm test              # Run tests
```

## 🌐 Environment Variables

Create a `.env` file in the backend directory:

```env
# Application
NODE_ENV=development
PORT=4000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://admin:password@localhost:5432/threadspace

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: External Services
SENTRY_DSN=your-sentry-dsn-here
```

## 🗄️ Database

The application uses PostgreSQL with Prisma ORM for type-safe database operations.

### Database Schema

The database schema is defined in `prisma/schema.prisma` and includes:
- Users and authentication
- Posts and comments
- Topics and categories
- Voting system
- User relationships

### Database Commands

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Push schema changes to database (development)
npm run db:push

# Create and run migrations (production)
npm run db:migrate

# Reset database (WARNING: deletes all data)
npm run db:reset

# Seed database with sample data
npm run db:seed
```

### Database Access

```bash
# Using Docker
docker-compose exec postgres psql -U admin -d threadspace

# Using local PostgreSQL
psql -U admin -d threadspace -h localhost
```

## 🔌 GraphQL API

The API is built with Apollo Server and provides:

### Queries
- User authentication and profiles
- Posts and comments
- Topics and categories
- Search and filtering

### Mutations
- User registration and login
- Post and comment creation/editing
- Voting and reactions
- User management

### Subscriptions
- Real-time post updates
- Live comment threads
- User activity notifications

### GraphQL Playground

Access the interactive GraphQL playground at:
- Development: http://localhost:4000/graphql
- Production: https://your-domain.com/graphql

## 🔐 Authentication

Authentication is handled using JWT tokens:

- **Access Tokens**: Short-lived (15 minutes) for API access
- **Refresh Tokens**: Long-lived (7 days) for token renewal
- **Password Hashing**: Argon2 for secure password storage
- **Token Storage**: HTTP-only cookies for security

### Auth Flow

1. User registers/logs in
2. Server validates credentials
3. JWT tokens are generated and stored in cookies
4. Client includes tokens in subsequent requests
5. Server validates tokens and grants access

## 🚀 Performance

### Caching Strategy

- **Redis**: Session storage and query caching
- **Database**: Connection pooling and query optimization
- **GraphQL**: Query result caching with DataLoader

### Optimization Features

- Database connection pooling
- Query batching with DataLoader
- Redis caching for frequently accessed data
- Compression middleware
- Request/response logging

## 📊 Logging

Structured logging with Winston:

- **Log Levels**: error, warn, info, debug
- **Log Files**: Combined and error-specific logs
- **Console Output**: Colored output for development
- **Request Logging**: HTTP request/response logging

### Log Files

- `logs/combined.log` - All log levels
- `logs/error.log` - Error logs only

## 🛡️ Security

Security features implemented:

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request rate limiting
- **Input Validation**: Class Validator for input sanitization
- **SQL Injection Protection**: Prisma ORM prevents SQL injection
- **XSS Protection**: Input sanitization and validation

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testNamePattern="User"
```

## 🚀 Deployment

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm run start
```

### Docker Deployment

The backend is containerized and can be deployed using Docker:

```bash
# Build Docker image
docker build -t threadspace-backend .

# Run container
docker run -p 4000:4000 threadspace-backend
```

### Environment-Specific Configuration

For different environments, update the environment variables:

```env
# Production
NODE_ENV=production
DATABASE_URL=postgresql://user:password@prod-db:5432/threadspace
REDIS_HOST=prod-redis
JWT_SECRET=your-production-jwt-secret
```

## 📈 Monitoring

### Health Checks

- **Health Endpoint**: `/health` - Basic service health
- **Database Health**: Connection status and query performance
- **Redis Health**: Cache connectivity and performance

### Metrics

- Request/response times
- Database query performance
- Memory and CPU usage
- Error rates and types

## 🔧 Development Tips

### Hot Reloading

The development server supports hot reloading for:
- TypeScript files
- GraphQL resolvers
- Configuration changes
- Database schema updates

### Debugging

- Use Node.js debugger
- GraphQL Playground for API testing
- Database query logging
- Winston log analysis

### Code Organization

- Keep resolvers focused and small
- Use TypeScript interfaces for type safety
- Follow GraphQL best practices
- Organize by feature, not file type

## 🤝 Contributing

1. Follow the existing code style
2. Use TypeScript for all new code
3. Write tests for new features
4. Update documentation as needed
5. Follow GraphQL best practices

## 📚 Resources

- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [GraphQL Documentation](https://graphql.org/learn)
- [Node.js Documentation](https://nodejs.org/docs)