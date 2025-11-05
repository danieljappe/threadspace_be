import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  validateEmail, 
  validateUsername, 
  validatePassword,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError
} from './utils';
import { DataLoaderContext } from './dataloaders';
import bcrypt from 'bcryptjs';

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
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          isActive: user.isActive
        };
      } catch (error) {
        logger.error('Error fetching current user:', error);
        throw error;
      }
    },

    user: async (parent: any, { id }: { id: string }, context: GraphQLContext) => {
      try {
        const user = await context.dataLoaders.userLoader.load(id);
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
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          isActive: user.isActive
        };
      } catch (error) {
        logger.error('Error fetching user:', error);
        throw error;
      }
    },

    userByUsername: async (parent: any, { username }: { username: string }, context: GraphQLContext) => {
      try {
        const user = await context.dataLoaders.userByUsernameLoader.load(username);
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
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          isActive: user.isActive
        };
      } catch (error) {
        logger.error('Error fetching user by username:', error);
        throw error;
      }
    },

    users: async (
      parent: any, 
      { search, first = 10, after }: { search?: string; first?: number; after?: string },
      context: GraphQLContext
    ) => {
      try {
        const where = search ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } }
          ]
        } : {};

        const users = await prisma.user.findMany({
          where,
          take: first + 1, // Take one extra to determine hasNextPage
          skip: after ? 1 : 0, // Skip the cursor item
          cursor: after ? { id: after } : undefined,
          orderBy: { createdAt: 'desc' }
        });

        const hasNextPage = users.length > first;
        const result = hasNextPage ? users.slice(0, -1) : users;

        return {
          edges: result.map(user => ({
            node: {
              id: user.id,
              username: user.username,
              email: user.email,
              bio: user.bio,
              avatarUrl: user.avatarUrl,
              reputation: user.reputation,
              isVerified: user.isVerified,
              isAdmin: user.isAdmin,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              lastLogin: user.lastLogin,
              isActive: user.isActive
            },
            cursor: user.id
          })),
          pageInfo: {
            hasNextPage,
            hasPreviousPage: !!after,
            startCursor: result.length > 0 ? result[0].id : null,
            endCursor: result.length > 0 ? result[result.length - 1].id : null
          },
          totalCount: await prisma.user.count({ where })
        };
      } catch (error) {
        logger.error('Error fetching users:', error);
        throw error;
      }
    }
  },

  Mutation: {
    updateProfile: async (
      parent: any, 
      { input }: { input: { bio?: string; avatarUrl?: string } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        const updatedUser = await prisma.user.update({
          where: { id: context.user.userId },
          data: {
            bio: input.bio,
            avatarUrl: input.avatarUrl
          }
        });

        // Clear user cache
        context.dataLoaders.userLoader.clear(context.user.userId);

        return {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          bio: updatedUser.bio,
          avatarUrl: updatedUser.avatarUrl,
          reputation: updatedUser.reputation,
          isVerified: updatedUser.isVerified,
          isAdmin: updatedUser.isAdmin,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
          lastLogin: updatedUser.lastLogin,
          isActive: updatedUser.isActive
        };
      } catch (error) {
        logger.error('Error updating profile:', error);
        throw error;
      }
    },

    followUser: async (
      parent: any, 
      { userId }: { userId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      if (userId === context.user.userId) {
        throw new ValidationError('Cannot follow yourself');
      }

      try {
        // Check if user exists
        const targetUser = await context.dataLoaders.userLoader.load(userId);
        if (!targetUser) {
          throw new NotFoundError('User not found');
        }

        // Check if already following
        const existingFollow = await context.dataLoaders.followLoader.load({
          followerId: context.user.userId,
          followingId: userId
        });

        if (existingFollow) {
          throw new ConflictError('Already following this user');
        }

        // Create follow relationship
        await prisma.follow.create({
          data: {
            followerId: context.user.userId,
            followingId: userId
          }
        });

        // Clear follow cache
        context.dataLoaders.followLoader.clear({
          followerId: context.user.userId,
          followingId: userId
        });

        return {
          id: targetUser.id,
          username: targetUser.username,
          email: targetUser.email,
          bio: targetUser.bio,
          avatarUrl: targetUser.avatarUrl,
          reputation: targetUser.reputation,
          isVerified: targetUser.isVerified,
          isAdmin: targetUser.isAdmin,
          createdAt: targetUser.createdAt,
          updatedAt: targetUser.updatedAt,
          lastLogin: targetUser.lastLogin,
          isActive: targetUser.isActive
        };
      } catch (error) {
        logger.error('Error following user:', error);
        throw error;
      }
    },

    unfollowUser: async (
      parent: any, 
      { userId }: { userId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if following
        const existingFollow = await context.dataLoaders.followLoader.load({
          followerId: context.user.userId,
          followingId: userId
        });

        if (!existingFollow) {
          throw new NotFoundError('Not following this user');
        }

        // Remove follow relationship
        await prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId: context.user.userId,
              followingId: userId
            }
          }
        });

        // Clear follow cache
        context.dataLoaders.followLoader.clear({
          followerId: context.user.userId,
          followingId: userId
        });

        return true;
      } catch (error) {
        logger.error('Error unfollowing user:', error);
        throw error;
      }
    }
  }
};

