import { withFilter } from 'graphql-subscriptions';
import { logger } from '../../config/logger';
import { pubsub } from '../../server';
import { DataLoaderContext } from './dataloaders';

// Custom async iterator implementation for subscriptions
class SubscriptionAsyncIterator {
  private listeners: Array<(value: any) => void> = [];
  private isComplete = false;

  constructor(private triggerName: string) {
    this.setupSubscription();
  }

  private async setupSubscription() {
    try {
      await pubsub.subscribe(this.triggerName, (payload) => {
        this.listeners.forEach(listener => listener(payload));
      });
    } catch (error) {
      logger.error(`Failed to subscribe to ${this.triggerName}:`, error);
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<any, any>> {
    if (this.isComplete) {
      return { done: true, value: undefined };
    }

    return new Promise((resolve) => {
      const listener = (value: any) => {
        this.listeners = this.listeners.filter(l => l !== listener);
        resolve({ done: false, value });
      };
      this.listeners.push(listener);
    });
  }

  async return(): Promise<IteratorResult<any, any>> {
    this.isComplete = true;
    this.listeners = [];
    return { done: true, value: undefined };
  }

  async throw(error: any): Promise<IteratorResult<any, any>> {
    this.isComplete = true;
    this.listeners = [];
    throw error;
  }
}

// Helper function to create async iterator
function createAsyncIterator(triggerName: string) {
  return new SubscriptionAsyncIterator(triggerName);
}

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
}

// Subscription event names
export const SUBSCRIPTION_EVENTS = {
  COMMENT_ADDED: 'COMMENT_ADDED',
  COMMENT_DELETED: 'COMMENT_DELETED',
  POST_UPDATED: 'POST_UPDATED',
  POST_CREATED: 'POST_CREATED',
  VOTE_UPDATED: 'VOTE_UPDATED',
  NOTIFICATION_RECEIVED: 'NOTIFICATION_RECEIVED',
  USER_TYPING: 'USER_TYPING',
} as const;

export const subscriptionResolvers = {
  Subscription: {
    commentAdded: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.COMMENT_ADDED),
        (payload, variables) => {
          // Only send to subscribers of the specific post
          return payload.commentAdded.postId === variables.postId;
        }
      ),
    },

    postUpdated: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.POST_UPDATED),
        (payload, variables) => {
          // Only send to subscribers of the specific post
          return payload.postUpdated.id === variables.postId;
        }
      ),
    },

    postCreated: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.POST_CREATED),
        (payload, variables) => {
          // If topicId is specified, only send to subscribers of that topic
          if (variables.topicId) {
            return payload.postCreated.topics.some((topic: any) => topic.id === variables.topicId);
          }
          // Otherwise, send to all subscribers
          return true;
        }
      ),
    },

    voteUpdated: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.VOTE_UPDATED),
        (payload, variables) => {
          // Send to subscribers of the specific post or comment
          if (variables.postId) {
            return payload.voteUpdated.targetType === 'POST' && payload.voteUpdated.targetId === variables.postId;
          }
          if (variables.commentId) {
            return payload.voteUpdated.targetType === 'COMMENT' && payload.voteUpdated.targetId === variables.commentId;
          }
          return false;
        }
      ),
    },

    notificationReceived: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.NOTIFICATION_RECEIVED),
        (payload, variables, context) => {
          // Only send to the authenticated user
          if (!context.user) return false;
          return payload.notificationReceived.userId === context.user.userId;
        }
      ),
    },

    userTyping: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.USER_TYPING),
        (payload, variables) => {
          // Only send to subscribers of the specific post
          return payload.userTyping.postId === variables.postId;
        }
      ),
    },
  },
};

// Helper functions to publish events
export const publishCommentAdded = (comment: any) => {
  logger.info('Publishing comment added event:', { commentId: comment.id, postId: comment.postId });
  pubsub.publish(SUBSCRIPTION_EVENTS.COMMENT_ADDED, {
    commentAdded: comment,
  });
};

export const publishPostUpdated = (post: any) => {
  logger.info('Publishing post updated event:', { postId: post.id });
  pubsub.publish(SUBSCRIPTION_EVENTS.POST_UPDATED, {
    postUpdated: post,
  });
};

export const publishPostCreated = (post: any) => {
  logger.info('Publishing post created event:', { postId: post.id });
  pubsub.publish(SUBSCRIPTION_EVENTS.POST_CREATED, {
    postCreated: post,
  });
};

export const publishVoteUpdated = (voteData: { targetId: string; targetType: string; voteCount: number; userVote: any; commentPostId?: string }) => {
  logger.info('Publishing vote updated event:', { targetId: voteData.targetId, targetType: voteData.targetType });
  console.log('[PubSub] Publishing VOTE_UPDATED:', JSON.stringify(voteData, null, 2));
  pubsub.publish(SUBSCRIPTION_EVENTS.VOTE_UPDATED, {
    voteUpdated: voteData,
  });
  console.log('[PubSub] VOTE_UPDATED published to channel:', SUBSCRIPTION_EVENTS.VOTE_UPDATED);
};

export const publishNotification = (notification: any) => {
  logger.info('Publishing notification event:', { notificationId: notification.id, userId: notification.userId });
  pubsub.publish(SUBSCRIPTION_EVENTS.NOTIFICATION_RECEIVED, {
    notificationReceived: notification,
  });
};

export const publishUserTyping = (typingData: { userId: string; username: string; postId: string }) => {
  logger.debug('Publishing user typing event:', typingData);
  pubsub.publish(SUBSCRIPTION_EVENTS.USER_TYPING, {
    userTyping: typingData,
  });
};

export const publishCommentDeleted = (commentData: { id: string; postId: string; parentId?: string | null }) => {
  logger.info('Publishing comment deleted event:', { commentId: commentData.id, postId: commentData.postId });
  console.log('[PubSub] Publishing COMMENT_DELETED:', JSON.stringify(commentData, null, 2));
  pubsub.publish(SUBSCRIPTION_EVENTS.COMMENT_DELETED, {
    commentDeleted: commentData,
  });
  console.log('[PubSub] COMMENT_DELETED published to channel:', SUBSCRIPTION_EVENTS.COMMENT_DELETED);
};
