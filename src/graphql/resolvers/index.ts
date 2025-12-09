import { testDatabaseConnection } from '../../config/database';
import { logger } from '../../config/logger';
import { createDataLoaders, DataLoaderContext } from './dataloaders';
import { userResolvers } from './userResolvers';
import { authResolvers } from './authResolvers';
import { postResolvers } from './postResolvers';
import { commentResolvers } from './commentResolvers';
import { voteResolvers, bookmarkResolvers } from './voteResolvers';
import { fieldResolvers } from './fieldResolvers';
import { subscriptionResolvers } from './subscriptionResolvers';

// Health check resolver
export const healthResolver = {
  Query: {
    health: async (): Promise<string> => {
      logger.info('GraphQL health resolver called');
      try {
        // Test database connection
        const dbConnected = await testDatabaseConnection();
        logger.info('Database connection result:', dbConnected);
        
        if (dbConnected) {
          logger.info('Health check passed - database connected');
          return 'OK - Database connected';
        } else {
          logger.warn('Health check failed - database not connected');
          return 'FAIL - Database not connected';
        }
      } catch (error) {
        logger.error('Health check error:', error);
        return 'ERROR - Health check failed';
      }
    },
  },
};

// GraphQL Context interface
export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
  res?: any; // Response object for setting cookies
}

// Context creation function
export const createContext = (req: any, res?: any): GraphQLContext => {
  return {
    user: req.user, // Set by authentication middleware
    dataLoaders: createDataLoaders(),
    res
  };
};

// Combine all resolvers
export const resolvers = {
  Query: {
    ...healthResolver.Query,
    ...userResolvers.Query,
    ...postResolvers.Query,
    ...commentResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...postResolvers.Mutation,
    ...commentResolvers.Mutation,
    ...voteResolvers.Mutation,
    ...bookmarkResolvers.Mutation,
  },
  Subscription: {
    ...subscriptionResolvers.Subscription,
  },
  // Field resolvers for complex relationships
  ...fieldResolvers,
};
