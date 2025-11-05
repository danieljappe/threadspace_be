import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { publishNotification } from './subscriptionResolvers';
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

export const notificationResolvers = {
  Query: {
    notifications: async (
      parent: any,
      { first = 10, after }: { first?: number; after?: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        const notifications = await prisma.notification.findMany({
          where: {
            userId: context.user.userId
          },
          take: first + 1,
          skip: after ? 1 : 0,
          cursor: after ? { id: after } : undefined,
          orderBy: { createdAt: 'desc' }
        });

        const hasNextPage = notifications.length > first;
        const result = hasNextPage ? notifications.slice(0, -1) : notifications;

        return {
          edges: result.map(notification => ({
            node: {
              id: notification.id,
              type: notification.type,
              data: notification.data,
              isRead: notification.isRead,
              createdAt: notification.createdAt
            },
            cursor: notification.id
          })),
          pageInfo: {
            hasNextPage,
            hasPreviousPage: !!after,
            startCursor: result.length > 0 ? result[0].id : null,
            endCursor: result.length > 0 ? result[result.length - 1].id : null
          },
          totalCount: await prisma.notification.count({
            where: { userId: context.user.userId }
          })
        };
      } catch (error) {
        logger.error('Error fetching notifications:', error);
        throw error;
      }
    },

    unreadNotificationCount: async (
      parent: any,
      args: any,
      context: GraphQLContext
    ) => {
      if (!context.user) {
        return 0;
      }

      try {
        const count = await prisma.notification.count({
          where: {
            userId: context.user.userId,
            isRead: false
          }
        });

        return count;
      } catch (error) {
        logger.error('Error fetching unread notification count:', error);
        throw error;
      }
    }
  },

  Mutation: {
    markNotificationAsRead: async (
      parent: any,
      { notificationId }: { notificationId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        const notification = await prisma.notification.update({
          where: {
            id: notificationId,
            userId: context.user.userId
          },
          data: {
            isRead: true
          }
        });

        logger.info('Notification marked as read:', { notificationId, userId: context.user.userId });

        return notification;
      } catch (error) {
        logger.error('Error marking notification as read:', error);
        throw error;
      }
    },

    markAllNotificationsAsRead: async (
      parent: any,
      args: any,
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      try {
        await prisma.notification.updateMany({
          where: {
            userId: context.user.userId,
            isRead: false
          },
          data: {
            isRead: true
          }
        });

        logger.info('All notifications marked as read:', { userId: context.user.userId });

        return true;
      } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        throw error;
      }
    }
  }
};

// Helper function to create notifications
export const createNotification = async (
  userId: string,
  type: 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'VOTE',
  data: any,
  publishEvent: boolean = true
) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        data: JSON.stringify(data),
        isRead: false
      }
    });

    if (publishEvent) {
      publishNotification(notification);
    }

    logger.info('Notification created:', { 
      notificationId: notification.id, 
      userId, 
      type 
    });

    return notification;
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
};
