import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  generateSlug,
  isTopicSubscribed,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError
} from './utils';
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

export const topicResolvers = {
  Query: {
    topic: async (parent: any, { id }: { id: string }, context: GraphQLContext) => {
      try {
        const topic = await context.dataLoaders.topicLoader.load(id);
        if (!topic) {
          throw new NotFoundError('Topic not found');
        }

        // Get subscription status for current user
        let isSubscribed = false;
        if (context.user) {
          const subscription = await context.dataLoaders.topicSubscriptionLoader.load({
            userId: context.user.userId,
            topicId: id
          });
          isSubscribed = !!subscription;
        }

        return {
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          description: topic.description,
          color: topic.color,
          subscriberCount: topic.subscriberCount,
          createdAt: topic.createdAt,
          isSubscribed
        };
      } catch (error) {
        logger.error('Error fetching topic:', error);
        throw error;
      }
    },

    topicBySlug: async (parent: any, { slug }: { slug: string }, context: GraphQLContext) => {
      try {
        const topic = await context.dataLoaders.topicBySlugLoader.load(slug);
        if (!topic) {
          throw new NotFoundError('Topic not found');
        }

        // Get subscription status for current user
        let isSubscribed = false;
        if (context.user) {
          const subscription = await context.dataLoaders.topicSubscriptionLoader.load({
            userId: context.user.userId,
            topicId: topic.id
          });
          isSubscribed = !!subscription;
        }

        return {
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          description: topic.description,
          color: topic.color,
          subscriberCount: topic.subscriberCount,
          createdAt: topic.createdAt,
          isSubscribed
        };
      } catch (error) {
        logger.error('Error fetching topic by slug:', error);
        throw error;
      }
    },

    topics: async (
      parent: any,
      { search, first = 20, after }: { search?: string; first?: number; after?: string },
      context: GraphQLContext
    ) => {
      try {
        const where = search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } }
          ]
        } : {};

        const topics = await prisma.topic.findMany({
          where,
          take: first + 1, // Take one extra to determine hasNextPage
          skip: after ? 1 : 0, // Skip the cursor item
          cursor: after ? { id: after } : undefined,
          orderBy: { subscriberCount: 'desc' }
        });

        const hasNextPage = topics.length > first;
        const result = hasNextPage ? topics.slice(0, -1) : topics;

        // Get subscription status for all topics if user is authenticated
        let subscriptionMap = new Map<string, boolean>();
        if (context.user) {
          const topicIds = result.map(topic => topic.id);
          const subscriptions = await prisma.userTopic.findMany({
            where: {
              userId: context.user.userId,
              topicId: { in: topicIds }
            }
          });

          subscriptions.forEach(subscription => {
            subscriptionMap.set(subscription.topicId, true);
          });
        }

        const edges = result.map(topic => ({
          node: {
            id: topic.id,
            name: topic.name,
            slug: topic.slug,
            description: topic.description,
            color: topic.color,
            subscriberCount: topic.subscriberCount,
            createdAt: topic.createdAt,
            isSubscribed: subscriptionMap.get(topic.id) || false
          },
          cursor: topic.id
        }));

        const totalCount = await prisma.topic.count({ where });

        return {
          edges,
          pageInfo: {
            hasNextPage,
            hasPreviousPage: !!after,
            startCursor: result.length > 0 ? result[0].id : null,
            endCursor: result.length > 0 ? result[result.length - 1].id : null
          },
          totalCount
        };
      } catch (error) {
        logger.error('Error fetching topics:', error);
        throw error;
      }
    }
  },

  Mutation: {
    subscribeTopic: async (
      parent: any,
      { topicId }: { topicId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if topic exists
        const topic = await context.dataLoaders.topicLoader.load(topicId);
        if (!topic) {
          throw new NotFoundError('Topic not found');
        }

        // Check if already subscribed
        const existingSubscription = await context.dataLoaders.topicSubscriptionLoader.load({
          userId: context.user.userId,
          topicId
        });

        if (existingSubscription) {
          throw new ConflictError('Already subscribed to this topic');
        }

        // Create subscription
        await prisma.userTopic.create({
          data: {
            userId: context.user.userId,
            topicId
          }
        });

        // Update subscriber count
        await prisma.topic.update({
          where: { id: topicId },
          data: {
            subscriberCount: { increment: 1 }
          }
        });

        // Clear caches
        context.dataLoaders.topicSubscriptionLoader.clear({
          userId: context.user.userId,
          topicId
        });
        context.dataLoaders.topicLoader.clear(topicId);

        // Reload topic with updated subscriber count
        const updatedTopic = await prisma.topic.findUnique({
          where: { id: topicId }
        });

        logger.info('Topic subscription created:', { 
          topicId, 
          userId: context.user.userId 
        });

        return {
          id: updatedTopic!.id,
          name: updatedTopic!.name,
          slug: updatedTopic!.slug,
          description: updatedTopic!.description,
          color: updatedTopic!.color,
          subscriberCount: updatedTopic!.subscriberCount,
          createdAt: updatedTopic!.createdAt,
          isSubscribed: true
        };
      } catch (error) {
        logger.error('Error subscribing to topic:', error);
        throw error;
      }
    },

    unsubscribeTopic: async (
      parent: any,
      { topicId }: { topicId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if subscribed
        const existingSubscription = await context.dataLoaders.topicSubscriptionLoader.load({
          userId: context.user.userId,
          topicId
        });

        if (!existingSubscription) {
          throw new NotFoundError('Not subscribed to this topic');
        }

        // Remove subscription
        await prisma.userTopic.delete({
          where: {
            userId_topicId: {
              userId: context.user.userId,
              topicId
            }
          }
        });

        // Update subscriber count
        await prisma.topic.update({
          where: { id: topicId },
          data: {
            subscriberCount: { decrement: 1 }
          }
        });

        // Clear caches
        context.dataLoaders.topicSubscriptionLoader.clear({
          userId: context.user.userId,
          topicId
        });
        context.dataLoaders.topicLoader.clear(topicId);

        logger.info('Topic subscription removed:', { 
          topicId, 
          userId: context.user.userId 
        });

        return true;
      } catch (error) {
        logger.error('Error unsubscribing from topic:', error);
        throw error;
      }
    }
  }
};

