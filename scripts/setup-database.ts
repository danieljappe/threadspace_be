import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/config/logger';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function setupDatabase() {
  try {
    console.log('Setting up database...');
    logger.info('Setting up database...');
    
    // Read the schema.sql file
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
    
    // Remove user creation statements (they require superuser privileges)
    // and split the SQL into executable chunks
    const lines = schemaSQL.split('\n');
    const executableSQL: string[] = [];
    let currentStatement = '';
    let skipUserCreation = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip user creation section
      if (trimmed.includes('CREATE USER') || trimmed.includes('GRANT') && trimmed.includes('TO threadspace')) {
        skipUserCreation = true;
        continue;
      }
      
      // Stop skipping after user creation section
      if (skipUserCreation && trimmed && !trimmed.startsWith('--') && !trimmed.includes('GRANT')) {
        skipUserCreation = false;
      }
      
      if (skipUserCreation) {
        continue;
      }
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      
      currentStatement += line + '\n';
      
      // If line ends with semicolon, it's a complete statement
      if (trimmed.endsWith(';')) {
        const statement = currentStatement.trim();
        if (statement.length > 0) {
          executableSQL.push(statement);
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      executableSQL.push(currentStatement.trim());
    }
    
    console.log(`Executing ${executableSQL.length} SQL statements...`);
    logger.info(`Executing ${executableSQL.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < executableSQL.length; i++) {
      const statement = executableSQL[i];
      if (statement.length > 0) {
        try {
          await prisma.$executeRawUnsafe(statement);
          if ((i + 1) % 20 === 0 || i === executableSQL.length - 1) {
            console.log(`  Progress: ${i + 1}/${executableSQL.length} statements executed`);
          }
        } catch (error: any) {
          // Ignore "already exists" errors for idempotency
          const errorMsg = error?.message || '';
          const errorCode = error?.code || '';
          
          if (errorMsg.includes('already exists') || 
              errorMsg.includes('duplicate') ||
              errorCode === '42P07' || // duplicate_table
              errorCode === '42710' || // duplicate_object
              errorCode === '42723') { // duplicate_function
            // Skip - object already exists
            continue;
          }
          // Log other errors but continue
          console.warn(`  Warning on statement ${i + 1}: ${errorMsg.substring(0, 100)}`);
          logger.warn(`Warning executing statement ${i + 1}:`, error);
        }
      }
    }
    
    console.log('✓ Database schema setup complete');
    logger.info('✓ Database schema setup complete');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    logger.error('Error setting up database:', error);
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

