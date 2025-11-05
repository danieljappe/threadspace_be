import { logger } from '../../config/logger';
import { publishUserTyping } from './subscriptionResolvers';
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

// Store active typing users per post
const typingUsers = new Map<string, Map<string, { username: string; lastTyping: number }>>();

// Clean up inactive typing users (older than 5 seconds)
const cleanupTypingUsers = () => {
  const now = Date.now();
  const timeout = 5000; // 5 seconds

  typingUsers.forEach((users, postId) => {
    users.forEach((userData, userId) => {
      if (now - userData.lastTyping > timeout) {
        users.delete(userId);
        logger.debug('Removed inactive typing user:', { userId, postId });
      }
    });

    // Remove empty post maps
    if (users.size === 0) {
      typingUsers.delete(postId);
    }
  });
};

// Run cleanup every 2 seconds
setInterval(cleanupTypingUsers, 2000);

export const typingResolvers = {
  Mutation: {
    startTyping: async (
      parent: any,
      { postId }: { postId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        const now = Date.now();
        
        // Get or create post typing map
        if (!typingUsers.has(postId)) {
          typingUsers.set(postId, new Map());
        }
        
        const postTypingUsers = typingUsers.get(postId)!;
        
        // Update user typing status
        postTypingUsers.set(context.user.userId, {
          username: context.user.username,
          lastTyping: now
        });

        // Publish typing event
        publishUserTyping({
          userId: context.user.userId,
          username: context.user.username,
          postId
        });

        logger.debug('User started typing:', { 
          userId: context.user.userId, 
          username: context.user.username, 
          postId 
        });

        return true;
      } catch (error) {
        logger.error('Error starting typing:', error);
        throw error;
      }
    },

    stopTyping: async (
      parent: any,
      { postId }: { postId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        if (typingUsers.has(postId)) {
          const postTypingUsers = typingUsers.get(postId)!;
          postTypingUsers.delete(context.user.userId);

          // Remove empty post maps
          if (postTypingUsers.size === 0) {
            typingUsers.delete(postId);
          }
        }

        logger.debug('User stopped typing:', { 
          userId: context.user.userId, 
          postId 
        });

        return true;
      } catch (error) {
        logger.error('Error stopping typing:', error);
        throw error;
      }
    }
  },

  Query: {
    getTypingUsers: async (
      parent: any,
      { postId }: { postId: string },
      context: GraphQLContext
    ) => {
      try {
        const postTypingUsers = typingUsers.get(postId);
        
        if (!postTypingUsers) {
          return [];
        }

        const now = Date.now();
        const timeout = 5000; // 5 seconds
        const activeUsers: Array<{ userId: string; username: string }> = [];

        postTypingUsers.forEach((userData, userId) => {
          if (now - userData.lastTyping <= timeout) {
            activeUsers.push({
              userId,
              username: userData.username
            });
          }
        });

        return activeUsers;
      } catch (error) {
        logger.error('Error getting typing users:', error);
        throw error;
      }
    }
  }
};
