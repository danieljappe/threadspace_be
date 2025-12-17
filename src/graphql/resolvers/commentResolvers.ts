import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  getUserVote,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  AuthorizationError
} from './utils';
import { DataLoaderContext } from './dataloaders';
import { publishCommentAdded, publishCommentDeleted } from './subscriptionResolvers';

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
}

export const commentResolvers = {
  Query: {
    comment: async (parent: any, { id }: { id: string }, context: GraphQLContext) => {
      try {
        const comment = await context.dataLoaders.commentLoader.load(id);
        if (!comment) {
          throw new NotFoundError('Comment not found');
        }

        // Get votes for this comment
        const votes = await prisma.vote.findMany({
          where: {
            votableId: id,
            votableType: 'comment'
          }
        });

        return {
          id: comment.id,
          content: comment.content,
          depth: comment.depth,
          isEdited: comment.isEdited,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          postId: comment.postId,
          parentId: comment.parentId,
          authorId: comment.authorId,
          voteCount: calculateVoteCount(votes),
          userVote: context.user ? getUserVote(votes, context.user.userId) : null
        };
      } catch (error) {
        logger.error('Error fetching comment:', error);
        throw error;
      }
    },

    comments: async (
      parent: any,
      { 
        postId, 
        first = 10, 
        after, 
        orderBy = 'NEWEST' 
      }: {
        postId: string;
        first?: number;
        after?: string;
        orderBy?: 'NEWEST' | 'OLDEST' | 'TOP';
      },
      context: GraphQLContext
    ) => {
      try {
        // Verify post exists
        const post = await context.dataLoaders.postLoader.load(postId);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        // Determine ordering
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
            postId,
            deletedAt: null
          },
          include: {
            users: true,
            posts: true,
            comments: true
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
              post: (comment as any).posts,
              parent: (comment as any).comments,
              author: (comment as any).users,
              voteCount: calculateVoteCount(commentVotes),
              userVote: context.user ? getUserVote(commentVotes, context.user.userId) : null
            },
            cursor: comment.id
          };
        });

        const totalCount = await prisma.comment.count({
          where: {
            postId,
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
      } catch (error) {
        logger.error('Error fetching comments:', error);
        throw error;
      }
    }
  },

  Mutation: {
    createComment: async (
      parent: any,
      { input }: { input: { postId: string; parentId?: string; content: string } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Validate input
        if (!input.content.trim()) {
          throw new ValidationError('Content is required');
        }

        if (input.content.length > 10000) {
          throw new ValidationError('Content must be less than 10,000 characters');
        }

        // Verify post exists
        const post = await context.dataLoaders.postLoader.load(input.postId);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        // Verify parent comment exists if provided
        let depth = 0;

        if (input.parentId) {
          const parentComment = await context.dataLoaders.commentLoader.load(input.parentId);
          if (!parentComment) {
            throw new NotFoundError('Parent comment not found');
          }

          if (parentComment.postId !== input.postId) {
            throw new ValidationError('Parent comment must belong to the same post');
          }

          // Calculate depth (limit to 5 levels)
          depth = parentComment.depth + 1;
          if (depth > 5) {
            throw new ValidationError('Comment nesting too deep (maximum 5 levels)');
          }
        }

        // Create comment
        const comment = await prisma.comment.create({
          data: {
            postId: input.postId,
            parentId: input.parentId || null,
            authorId: context.user.userId,
            content: input.content.trim(),
            depth
          },
          include: {
            users: true,
            posts: true,
            comments: true
          }
        });

        if (!comment) {
          throw new Error('Failed to create comment');
        }

        logger.info('Comment created successfully:', { 
          commentId: comment.id, 
          postId: input.postId,
          authorId: context.user.userId 
        });

        // Publish real-time event
        publishCommentAdded({
          ...comment,
          postId: input.postId
        });

        return {
          id: comment.id,
          content: comment.content,
          depth: comment.depth,
          isEdited: comment.isEdited,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          post: (comment as any).posts,
          parent: (comment as any).comments,
          author: (comment as any).users,
          voteCount: 0,
          userVote: null
        };
      } catch (error) {
        logger.error('Error creating comment:', error);
        throw error;
      }
    },

    editComment: async (
      parent: any,
      { input }: { input: { id: string; content: string } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to edit a comment');
      }

      try {
        const { id, content } = input;

        // Validate input
        if (!content || content.trim().length === 0) {
          throw new ValidationError('Content is required');
        }

        if (content.length > 10000) {
          throw new ValidationError('Content must be less than 10,000 characters');
        }

        // Find the comment
        const existingComment = await context.dataLoaders.commentLoader.load(id);
        if (!existingComment) {
          throw new NotFoundError('Comment not found');
        }

        if (existingComment.deletedAt) {
          throw new NotFoundError('Comment not found');
        }

        // Check authorization - only owner can edit
        if (existingComment.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only edit your own comments');
        }

        // Update the comment and set isEdited to true
        const updatedComment = await prisma.comment.update({
          where: { id },
          data: {
            content: content.trim(),
            isEdited: true
          },
          include: {
            users: true,
            posts: true,
            comments: true
          }
        });

        // Clear comment cache
        context.dataLoaders.commentLoader.clear(id);

        // Get votes for this comment
        const votes = await prisma.vote.findMany({
          where: {
            votableId: id,
            votableType: 'comment'
          }
        });

        logger.info('Comment edited successfully:', { 
          commentId: id, 
          authorId: context.user.userId 
        });

        return {
          id: updatedComment.id,
          content: updatedComment.content,
          depth: updatedComment.depth,
          isEdited: updatedComment.isEdited,
          createdAt: updatedComment.createdAt,
          updatedAt: updatedComment.updatedAt,
          post: (updatedComment as any).posts,
          parent: (updatedComment as any).comments,
          author: (updatedComment as any).users,
          voteCount: calculateVoteCount(votes),
          userVote: context.user ? getUserVote(votes, context.user.userId) : null
        };
      } catch (error) {
        logger.error('Error editing comment:', error);
        throw error;
      }
    },

    deleteComment: async (
      parent: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        const existingComment = await context.dataLoaders.commentLoader.load(id);
        if (!existingComment) {
          throw new NotFoundError('Comment not found');
        }

        if (existingComment.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only delete your own comments');
        }

        const postId = existingComment.postId;
        const parentId = existingComment.parentId;

        // Soft delete the comment
        await prisma.comment.update({
          where: { id },
          data: { deletedAt: new Date() }
        });

        // Clear comment cache
        context.dataLoaders.commentLoader.clear(id);

        logger.info('Comment deleted successfully:', { commentId: id, authorId: context.user.userId });

        // Publish real-time event
        if (postId) {
          publishCommentDeleted({
            id,
            postId,
            parentId: parentId || null,
          });
        }

        return true;
      } catch (error) {
        logger.error('Error deleting comment:', error);
        throw error;
      }
    }
  }
};
