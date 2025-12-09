import { logger } from '../../config/logger';
import { NotFoundError } from './utils';
import { DataLoaderContext } from './dataloaders';

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
}

export const userResolvers = {
  Query: {
    me: async (parent: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        return null;
      }

      try {
        const user = await context.dataLoaders.userLoader.load(context.user.userId);
        if (!user) {
          throw new NotFoundError('User not found');
        }

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          reputation: user.reputation,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
      } catch (error) {
        logger.error('Error fetching current user:', error);
        throw error;
      }
    }
  }
};
