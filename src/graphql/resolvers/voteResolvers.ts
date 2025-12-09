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
        if (!['POST', 'COMMENT'].includes(targetType)) {
          throw new ValidationError('Invalid target type');
        }

        if (!['UPVOTE', 'DOWNVOTE'].includes(voteType)) {
          throw new ValidationError('Invalid vote type');
        }

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

        const dbTargetType = targetType.toLowerCase() as 'post' | 'comment';

        const existingVote = await context.dataLoaders.voteLoader.load({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        if (existingVote) {
          await prisma.vote.update({
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
          await prisma.vote.create({
            data: {
              userId: context.user.userId,
              votableId: targetId,
              votableType: dbTargetType,
              voteType
            }
          });
        }

        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: targetId,
            votableType: dbTargetType
          }
        });

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

        const voteCount = calculateVoteCount(allVotes);
        publishVoteUpdated({
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: voteType,
          commentPostId
        });

        return {
          success: true,
          voteCount,
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
        if (!['POST', 'COMMENT'].includes(targetType)) {
          throw new ValidationError('Invalid target type');
        }

        const dbTargetType = targetType.toLowerCase() as 'post' | 'comment';

        const existingVote = await context.dataLoaders.voteLoader.load({
          userId: context.user.userId,
          votableId: targetId,
          votableType: dbTargetType
        });

        if (!existingVote) {
          throw new NotFoundError('Vote not found');
        }

        await prisma.vote.delete({
          where: {
            userId_votableId_votableType: {
              userId: context.user.userId,
              votableId: targetId,
              votableType: dbTargetType
            }
          }
        });

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

        let commentPostId: string | undefined;
        if (targetType === 'COMMENT') {
          const comment = await context.dataLoaders.commentLoader.load(targetId);
          commentPostId = comment?.postId || undefined;
        }

        const remainingVotes = await prisma.vote.findMany({
          where: {
            votableId: targetId,
            votableType: dbTargetType
          }
        });

        const voteCount = calculateVoteCount(remainingVotes);
        publishVoteUpdated({
          targetId,
          targetType: dbTargetType,
          voteCount,
          userVote: null,
          commentPostId
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
        const post = await context.dataLoaders.postLoader.load(postId);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        const existingBookmark = await context.dataLoaders.bookmarkLoader.load({
          userId: context.user.userId,
          postId
        });

        if (existingBookmark) {
          throw new ValidationError('Post already bookmarked');
        }

        await prisma.bookmark.create({
          data: {
            userId: context.user.userId,
            postId
          }
        });

        context.dataLoaders.bookmarkLoader.clear({
          userId: context.user.userId,
          postId
        });

        logger.info('Post bookmarked:', { postId, userId: context.user.userId });

        return {
          id: post.id,
          title: post.title,
          content: post.content,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          author: post.author,
          voteCount: 0,
          userVote: null,
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
        const existingBookmark = await context.dataLoaders.bookmarkLoader.load({
          userId: context.user.userId,
          postId
        });

        if (!existingBookmark) {
          logger.info('Bookmark not found, returning success:', { postId, userId: context.user.userId });
          return true;
        }

        await prisma.bookmark.delete({
          where: {
            userId_postId: {
              userId: context.user.userId,
              postId
            }
          }
        });

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
