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
  POST_CREATED: 'POST_CREATED',
  VOTE_UPDATED: 'VOTE_UPDATED',
} as const;

export const subscriptionResolvers = {
  Subscription: {
    commentAdded: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.COMMENT_ADDED),
        (payload, variables) => {
          return payload.commentAdded.postId === variables.postId;
        }
      ),
    },

    voteUpdated: {
      subscribe: withFilter(
        () => createAsyncIterator(SUBSCRIPTION_EVENTS.VOTE_UPDATED),
        (payload, variables) => {
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
  },
};

// Helper functions to publish events
export const publishCommentAdded = (comment: any) => {
  logger.info('Publishing comment added event:', { commentId: comment.id, postId: comment.postId });
  pubsub.publish(SUBSCRIPTION_EVENTS.COMMENT_ADDED, {
    commentAdded: comment,
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
  pubsub.publish(SUBSCRIPTION_EVENTS.VOTE_UPDATED, {
    voteUpdated: voteData,
  });
};

export const publishCommentDeleted = (commentData: { id: string; postId: string; parentId?: string | null }) => {
  logger.info('Publishing comment deleted event:', { commentId: commentData.id, postId: commentData.postId });
  pubsub.publish(SUBSCRIPTION_EVENTS.COMMENT_DELETED, {
    commentDeleted: commentData,
  });
};
