import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  ValidationError,
  AuthenticationError,
  NotFoundError
} from './utils';
import { DataLoaderContext } from './dataloaders';
import { publishVoteUpdated } from './subscriptionResolvers';

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
}

export const voteResolvers = {
  Mutation: {
    vote: async (
      parent: any,
      { targetId, targetType, voteType }: { targetId: string; targetType: 'POST' | 'COMMENT'; voteType: 'UPVOTE' | 'DOWNVOTE' },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Validate target type
        if (!['POST', 'COMMENT'].includes(targetType)) {
          throw new ValidationError('Invalid target type');
        }

        // Validate vote type
        if (!['UPVOTE', 'DOWNVOTE'].includes(voteType)) {
          throw new ValidationError('Invalid vote type');
        }

        // Check if target exists and get postId for comments
        let commentPostId: string | undefined;
        if (targetType === 'POST') {
          const post = await context.dataLoaders.postLoader.load(targetId);
          if (!post) {
            throw new NotFoundError('Post not found');
          }
        } else if (targetType === 'COMMENT') {
          const comment = await context.dataLoaders.commentLoader.load(targetId);
          if (!comment) {
            throw new NotFoundError('Comment not found');
          }
          commentPostId = comment.postId || undefined;
        }

        // Convert targetType to database enum value
        const dbTargetType = targetType.toLowerCase() as 'post' | 'comment';

        // Check if user already voted
        const existingVote = await context.dataLoaders.voteLoader.load({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        let newVote;
        if (existingVote) {
          // Update existing vote
          newVote = await prisma.vote.update({
            where: {
              userId_votableId_votableType: {
                userId: context.user.userId,
                votableId: targetId,
                votableType: dbTargetType
              }
            },
            data: { voteType }
          });
        } else {
        // Create new vote
        newVote = await prisma.vote.create({
          data: {
            userId: context.user.userId,
            votableId: targetId,
            votableType: dbTargetType,
            voteType
          }
        });
        }

        // Get all votes for this target to calculate total
        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: targetId,
            votableType: dbTargetType
          }
        });

        // Clear vote cache
        context.dataLoaders.voteLoader.clear({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        logger.info('Vote recorded:', { 
          targetId, 
          targetType, 
          voteType,
          userId: context.user.userId 
        });

        // Publish real-time vote update
        const voteCount = calculateVoteCount(allVotes);
        console.log('[VoteResolver] Publishing vote update:', {
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: voteType,
          commentPostId
        });
        publishVoteUpdated({
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: voteType,
          commentPostId // Include postId for comment votes so SSE can filter properly
        });

        return {
          success: true,
          voteCount: calculateVoteCount(allVotes),
          userVote: voteType
        };
      } catch (error) {
        logger.error('Error recording vote:', error);
        throw error;
      }
    },

    removeVote: async (
      parent: any,
      { targetId, targetType }: { targetId: string; targetType: 'POST' | 'COMMENT' },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Validate target type
        if (!['POST', 'COMMENT'].includes(targetType)) {
          throw new ValidationError('Invalid target type');
        }

        // Convert targetType to database enum value
        const dbTargetType = targetType.toLowerCase() as 'post' | 'comment';

        // Check if vote exists
        const existingVote = await context.dataLoaders.voteLoader.load({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        if (!existingVote) {
          throw new NotFoundError('Vote not found');
        }

        // Remove vote
        await prisma.vote.delete({
          where: {
            userId_votableId_votableType: {
              userId: context.user.userId,
              votableId: targetId,
              votableType: dbTargetType
            }
          }
        });

        // Clear vote cache
        context.dataLoaders.voteLoader.clear({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        logger.info('Vote removed:', { 
          targetId, 
          targetType,
          userId: context.user.userId 
        });

        // Get postId for comment votes before removing
        let commentPostId: string | undefined;
        if (targetType === 'COMMENT') {
          const comment = await context.dataLoaders.commentLoader.load(targetId);
          commentPostId = comment?.postId || undefined;
        }

        // Get updated vote count after removal
        const remainingVotes = await prisma.vote.findMany({
          where: {
            votableId: targetId,
            votableType: dbTargetType
          }
        });

        // Publish real-time vote update
        const voteCount = calculateVoteCount(remainingVotes);
        console.log('[VoteResolver] Publishing vote removal update:', {
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: null,
          commentPostId
        });
        publishVoteUpdated({
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: null,
          commentPostId // Include postId for comment votes
        });

        return true;
      } catch (error) {
        logger.error('Error removing vote:', error);
        throw error;
      }
    }
  }
};

export const bookmarkResolvers = {
  Mutation: {
    bookmarkPost: async (
      parent: any,
      { postId }: { postId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if post exists
        const post = await context.dataLoaders.postLoader.load(postId);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        // Check if already bookmarked
        const existingBookmark = await context.dataLoaders.bookmarkLoader.load({
          userId: context.user.userId,
          postId
        });

        if (existingBookmark) {
          throw new ValidationError('Post already bookmarked');
        }

        // Create bookmark
        await prisma.bookmark.create({
          data: {
            userId: context.user.userId,
            postId
          }
        });

        // Clear bookmark cache
        context.dataLoaders.bookmarkLoader.clear({
          userId: context.user.userId,
          postId
        });

        logger.info('Post bookmarked:', { postId, userId: context.user.userId });

        // Return the post with updated bookmark status
        return {
          id: post.id,
          title: post.title,
          content: post.content,
          threadType: post.threadType,
          views: post.views,
          isPinned: post.isPinned,
          isLocked: post.isLocked,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          author: post.author,
          topics: [],
          voteCount: 0, // Will be calculated by field resolver
          userVote: null, // Will be calculated by field resolver
          bookmarked: true
        };
      } catch (error) {
        logger.error('Error bookmarking post:', error);
        throw error;
      }
    },

    unbookmarkPost: async (
      parent: any,
      { postId }: { postId: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if bookmark exists
        const existingBookmark = await context.dataLoaders.bookmarkLoader.load({
          userId: context.user.userId,
          postId
        });

        if (!existingBookmark) {
          // Bookmark doesn't exist, return success (idempotent operation)
          logger.info('Bookmark not found, returning success:', { postId, userId: context.user.userId });
          return true;
        }

        // Remove bookmark
        await prisma.bookmark.delete({
          where: {
            userId_postId: {
              userId: context.user.userId,
              postId
            }
          }
        });

        // Clear bookmark cache
        context.dataLoaders.bookmarkLoader.clear({
          userId: context.user.userId,
          postId
        });

        logger.info('Post unbookmarked:', { postId, userId: context.user.userId });

        return true;
      } catch (error) {
        logger.error('Error unbookmarking post:', error);
        throw error;
      }
    }
  }
};

