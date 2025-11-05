import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/config/logger';

const prisma = new PrismaClient();

async function setupDatabase() {
  try {
    console.log('Setting up database extensions...');
    logger.info('Setting up database extensions...');
    
    // Enable required PostgreSQL extensions
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✓ uuid-ossp extension enabled');
    logger.info('✓ uuid-ossp extension enabled');
    
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "ltree"');
    console.log('✓ ltree extension enabled');
    logger.info('✓ ltree extension enabled');
    
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');
    console.log('✓ pg_trgm extension enabled');
    logger.info('✓ pg_trgm extension enabled');
    
    console.log('Database extensions setup complete');
    logger.info('Database extensions setup complete');
  } catch (error) {
    console.error('Error setting up database extensions:', error);
    logger.error('Error setting up database extensions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase()
  .then(() => {
    console.log('Database setup completed successfully');
    logger.info('Database setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database setup failed:', error);
    logger.error('Database setup failed:', error);
    process.exit(1);
  });

