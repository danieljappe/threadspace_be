import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  getUserVote,
  isPostBookmarked,
  isTopicSubscribed,
  paginateResults
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

export const fieldResolvers = {
  // Post field resolvers
  Post: {
    author: async (parent: any, args: any, context: GraphQLContext) => {
      // If author is already loaded (from include), return it
      if (parent.author) {
        return parent.author;
      }
      
      // Otherwise, use DataLoader
      return context.dataLoaders.userLoader.load(parent.authorId);
    },

    topics: async (parent: any, args: any, context: GraphQLContext) => {
      // Temporarily return empty array to test if this resolves the error
      logger.debug('Post.topics field resolver called for post:', parent.id);
      return [];
    },

    comments: async (
      parent: any, 
      { first = 10, after, orderBy = 'NEWEST' }: { first?: number; after?: string; orderBy?: 'NEWEST' | 'OLDEST' | 'TOP' },
      context: GraphQLContext
    ) => {
      // Determine ordering
      let orderByClause: any = {};
      switch (orderBy) {
        case 'OLDEST':
          orderByClause = { createdAt: 'asc' };
          break;
        case 'TOP':
          // For top comments, we'll order by depth first (to show top-level comments first)
          // then by creation time
          orderByClause = [{ depth: 'asc' }, { createdAt: 'desc' }];
          break;
        default: // NEWEST
          orderByClause = { createdAt: 'desc' };
      }

      const comments = await prisma.comment.findMany({
        where: {
          postId: parent.id,
          deletedAt: null
        },
        take: first + 1,
        skip: after ? 1 : 0,
        cursor: after ? { id: after } : undefined,
        orderBy: orderByClause
      });

      const hasNextPage = comments.length > first;
      const result = hasNextPage ? comments.slice(0, -1) : comments;

      // Get votes for all comments
      const commentIds = result.map(comment => comment.id);
      const allVotes = await prisma.vote.findMany({
        where: {
          votableId: { in: commentIds },
          votableType: 'comment'
        }
      });

      const edges = result.map(comment => {
        const commentVotes = allVotes.filter(vote => vote.votableId === comment.id);

        return {
          node: {
            id: comment.id,
            content: comment.content,
            depth: comment.depth,
            isEdited: comment.isEdited,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            postId: comment.postId,
            parentId: comment.parentId,
            authorId: comment.authorId,
            voteCount: calculateVoteCount(commentVotes),
            userVote: context.user ? getUserVote(commentVotes, context.user.userId) : null
          },
          cursor: comment.id
        };
      });

      const totalCount = await prisma.comment.count({
        where: {
          postId: parent.id,
          deletedAt: null
        }
      });

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
    },

    voteCount: async (parent: any, args: any, context: GraphQLContext) => {
      const votes = await prisma.vote.findMany({
        where: {
          votableId: parent.id,
          votableType: 'post'
        }
      });

      return calculateVoteCount(votes);
    },

    userVote: async (parent: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        return null;
      }

      const vote = await context.dataLoaders.voteLoader.load({
        userId: context.user.userId,
        votableId: parent.id,
        votableType: 'post'
      });

      return vote ? vote.voteType : null;
    },

    bookmarked: async (parent: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        return false;
      }

      const bookmark = await context.dataLoaders.bookmarkLoader.load({
        userId: context.user.userId,
        postId: parent.id
      });

      return !!bookmark;
    }
  },

  // Comment field resolvers
  Comment: {
    post: async (parent: any, args: any, context: GraphQLContext) => {
      // If post is already loaded (from include), return it
      if (parent.post) {
        return parent.post;
      }
      
      // Otherwise, use DataLoader
      return context.dataLoaders.postLoader.load(parent.postId);
    },

    parent: async (parent: any, args: any, context: GraphQLContext) => {
      // If parent is already loaded (from include), return it
      if (parent.parent !== undefined) {
        return parent.parent;
      }

      // If no parentId, return null
      if (!parent.parentId) {
        return null;
      }
      
      // Otherwise, use DataLoader
      return context.dataLoaders.commentLoader.load(parent.parentId);
    },

    author: async (parent: any, args: any, context: GraphQLContext) => {
      // If author is already loaded (from include), return it
      if (parent.author) {
        return parent.author;
      }
      
      // Otherwise, use DataLoader
      return context.dataLoaders.userLoader.load(parent.authorId);
    },

    replies: async (
      parent: any, 
      { first = 10, after }: { first?: number; after?: string },
      context: GraphQLContext
    ) => {
      const replies = await prisma.comment.findMany({
        where: {
          parentId: parent.id,
          deletedAt: null
        },
        take: first + 1,
        skip: after ? 1 : 0,
        cursor: after ? { id: after } : undefined,
        orderBy: { createdAt: 'asc' }
      });

      const hasNextPage = replies.length > first;
      const result = hasNextPage ? replies.slice(0, -1) : replies;

      // Get votes for all replies
      const replyIds = result.map(reply => reply.id);
      const allVotes = await prisma.vote.findMany({
        where: {
          votableId: { in: replyIds },
          votableType: 'comment' // Use lowercase for database constraint
        }
      });

      const edges = result.map(reply => {
        const replyVotes = allVotes.filter(vote => vote.votableId === reply.id);

        return {
          node: {
            id: reply.id,
            content: reply.content,
            depth: reply.depth,
            isEdited: reply.isEdited,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt,
            postId: reply.postId,
            parentId: reply.parentId,
            authorId: reply.authorId,
            voteCount: calculateVoteCount(replyVotes),
            userVote: context.user ? getUserVote(replyVotes, context.user.userId) : null
          },
          cursor: reply.id
        };
      });

      const totalCount = await prisma.comment.count({
        where: {
          parentId: parent.id,
          deletedAt: null
        }
      });

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
    },

    voteCount: async (parent: any, args: any, context: GraphQLContext) => {
      const votes = await prisma.vote.findMany({
        where: {
          votableId: parent.id,
          votableType: 'comment'
        }
      });

      return calculateVoteCount(votes);
    },

    userVote: async (parent: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        return null;
      }

      const vote = await context.dataLoaders.voteLoader.load({
        userId: context.user.userId,
        votableId: parent.id,
        votableType: 'comment'
      });

      return vote ? vote.voteType : null;
    }
  },

  // Topic field resolvers
  Topic: {
    posts: async (
      parent: any, 
      { first = 10, after, orderBy = 'NEWEST' }: { first?: number; after?: string; orderBy?: string },
      context: GraphQLContext
    ) => {
      // Determine ordering
      let orderByClause: any = {};
      switch (orderBy) {
        case 'OLDEST':
          orderByClause = { createdAt: 'asc' };
          break;
        case 'TRENDING':
          orderByClause = { createdAt: 'desc' };
          break;
        case 'TOP':
          orderByClause = { views: 'desc' };
          break;
        default: // NEWEST
          orderByClause = { createdAt: 'desc' };
      }

      const posts = await prisma.post.findMany({
        where: {
          deletedAt: null,
          post_topics: {
            some: { topicId: parent.id }
          }
        },
        take: first + 1,
        skip: after ? 1 : 0,
        cursor: after ? { id: after } : undefined,
        orderBy: orderByClause
      });

      const hasNextPage = posts.length > first;
      const result = hasNextPage ? posts.slice(0, -1) : posts;

      // Get votes and bookmarks for all posts
      const postIds = result.map(post => post.id);
      const allVotes = await prisma.vote.findMany({
        where: {
          votableId: { in: postIds },
          votableType: 'post'
        }
      });

      const allBookmarks = context.user ? await prisma.bookmark.findMany({
        where: { postId: { in: postIds } }
      }) : [];

      const edges = result.map(post => {
        const postVotes = allVotes.filter(vote => vote.votableId === post.id);
        const postBookmarks = allBookmarks.filter(bookmark => bookmark.postId === post.id);

        return {
          node: {
            id: post.id,
            title: post.title,
            content: post.content,
            threadType: post.threadType,
            views: post.views,
            isPinned: post.isPinned,
            isLocked: post.isLocked,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            author: null,
            topics: [],
            voteCount: calculateVoteCount(postVotes),
            userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
            bookmarked: context.user ? isPostBookmarked(postBookmarks, context.user.userId) : false
          },
          cursor: post.id
        };
      });

      const totalCount = await prisma.post.count({
        where: {
          deletedAt: null,
          post_topics: {
            some: { topicId: parent.id }
          }
        }
      });

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
    },

    isSubscribed: async (parent: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        return false;
      }

      const subscription = await context.dataLoaders.topicSubscriptionLoader.load({
        userId: context.user.userId,
        topicId: parent.id
      });

      return !!subscription;
    }
  }
};

