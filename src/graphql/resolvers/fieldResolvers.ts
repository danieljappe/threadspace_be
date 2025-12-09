import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  getUserVote
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
      if (parent.author) {
        return parent.author;
      }
      return context.dataLoaders.userLoader.load(parent.authorId);
    },

    comments: async (
      parent: any, 
      { first = 10, after, orderBy = 'NEWEST' }: { first?: number; after?: string; orderBy?: 'NEWEST' | 'OLDEST' | 'TOP' },
      context: GraphQLContext
    ) => {
      let orderByClause: any = {};
      switch (orderBy) {
        case 'OLDEST':
          orderByClause = { createdAt: 'asc' };
          break;
        case 'TOP':
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
      if (parent.post) {
        return parent.post;
      }
      return context.dataLoaders.postLoader.load(parent.postId);
    },

    parent: async (parent: any, args: any, context: GraphQLContext) => {
      if (parent.parent !== undefined) {
        return parent.parent;
      }

      if (!parent.parentId) {
        return null;
      }
      
      return context.dataLoaders.commentLoader.load(parent.parentId);
    },

    author: async (parent: any, args: any, context: GraphQLContext) => {
      if (parent.author) {
        return parent.author;
      }
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

      const replyIds = result.map(reply => reply.id);
      const allVotes = await prisma.vote.findMany({
        where: {
          votableId: { in: replyIds },
          votableType: 'comment'
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
  }
};
