import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  getUserVote,
  isPostBookmarked,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  AuthorizationError,
  paginateResults
} from './utils';
import { DataLoaderContext } from './dataloaders';
import { publishPostCreated, publishPostUpdated } from './subscriptionResolvers';

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
}

export const postResolvers = {
  Query: {
    post: async (parent: any, { id }: { id: string }, context: GraphQLContext) => {
      try {
        const post = await context.dataLoaders.postLoader.load(id);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        // Increment view count
        await prisma.post.update({
          where: { id },
          data: { views: { increment: 1 } }
        });

        // Get votes for this post
        const votes = await prisma.vote.findMany({
          where: {
            votableId: id,
            votableType: 'post'
          }
        });

        // Get bookmarks for this post
        const bookmarks = context.user ? await prisma.bookmark.findMany({
          where: { postId: id }
        }) : [];

        return {
          id: post.id,
          title: post.title,
          content: post.content,
          threadType: post.threadType,
          views: post.views + 1, // Include the increment
          isPinned: post.isPinned,
          isLocked: post.isLocked,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          // These will be resolved by field resolvers
          authorId: post.authorId,
          topics: [],
          voteCount: calculateVoteCount(votes),
          userVote: context.user ? getUserVote(votes, context.user.userId) : null,
          bookmarked: context.user ? isPostBookmarked(bookmarks, context.user.userId) : false
        };
      } catch (error) {
        logger.error('Error fetching post:', error);
        throw error;
      }
    },

    posts: async (
      parent: any,
      { 
        topicId, 
        authorId, 
        search, 
        orderBy = 'NEWEST', 
        first = 10, 
        after 
      }: {
        topicId?: string;
        authorId?: string;
        search?: string;
        orderBy?: 'NEWEST' | 'OLDEST' | 'TRENDING' | 'TOP';
        first?: number;
        after?: string;
      },
      context: GraphQLContext
    ) => {
      try {
        const where: any = {
          deletedAt: null
        };

        // Note: Topic filtering is temporarily disabled due to schema changes
        // TODO: Implement topic filtering using PostTopic table directly

        if (authorId) {
          where.authorId = authorId;
        }

        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } }
          ];
        }

        // Determine ordering
        let orderByClause: any = {};
        switch (orderBy) {
          case 'OLDEST':
            orderByClause = { createdAt: 'asc' };
            break;
          case 'TRENDING':
            // For trending, we'll use a combination of recent posts with high engagement
            orderByClause = { createdAt: 'desc' };
            break;
          case 'TOP':
            // For top posts, we'll use views count
            orderByClause = { views: 'desc' };
            break;
          default: // NEWEST
            orderByClause = { createdAt: 'desc' };
        }

        const posts = await prisma.post.findMany({
          where,
          take: first + 1, // Take one extra to determine hasNextPage
          skip: after ? 1 : 0, // Skip the cursor item
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

          logger.debug('Processing post:', post.id, 'with topics:', []);
          const topics: any[] = [];
          logger.debug('Filtered topics for post', post.id, ':', topics);

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
              authorId: post.authorId,
              topics: topics,
              voteCount: calculateVoteCount(postVotes),
              userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
              bookmarked: context.user ? isPostBookmarked(postBookmarks, context.user.userId) : false
            },
            cursor: post.id
          };
        });

        const totalCount = await prisma.post.count({ where });

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
        logger.error('Error fetching posts:', error);
        throw error;
      }
    },

    trendingPosts: async (
      parent: any,
      { first = 10 }: { first: number },
      context: GraphQLContext
    ) => {
      try {
        // Get posts from the last 7 days with high engagement
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const posts = await prisma.post.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: sevenDaysAgo }
          },
          take: first,
          orderBy: [
            { views: 'desc' },
            { createdAt: 'desc' }
          ]
        });

        // Get votes and bookmarks for trending posts
        const postIds = posts.map(post => post.id);
        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: { in: postIds },
            votableType: 'post'
          }
        });

        const allBookmarks = context.user ? await prisma.bookmark.findMany({
          where: { postId: { in: postIds } }
        }) : [];

        return posts.map(post => {
          const postVotes = allVotes.filter(vote => vote.votableId === post.id);
          const postBookmarks = allBookmarks.filter(bookmark => bookmark.postId === post.id);

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
            authorId: post.authorId,
            topics: [],
            voteCount: calculateVoteCount(postVotes),
            userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
            bookmarked: context.user ? isPostBookmarked(postBookmarks, context.user.userId) : false
          };
        });
      } catch (error) {
        logger.error('Error fetching trending posts:', error);
        throw error;
      }
    }
  },

  Mutation: {
    createPost: async (
      parent: any,
      { input }: { input: { title: string; content: string; threadType: string; topicIds: string[] } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Validate input
        if (!input.title.trim()) {
          throw new ValidationError('Title is required');
        }

        if (!input.content.trim()) {
          throw new ValidationError('Content is required');
        }

        if (input.title.length > 300) {
          throw new ValidationError('Title must be less than 300 characters');
        }

        // Verify topics exist (only if topicIds are provided)
        if (input.topicIds && input.topicIds.length > 0) {
          const topics = await prisma.topic.findMany({
            where: { id: { in: input.topicIds } }
          });

          if (topics.length !== input.topicIds.length) {
            throw new ValidationError('One or more topics not found');
          }
        }

        // Create post
        const postData: any = {
          title: input.title.trim(),
          content: input.content.trim(),
          threadType: input.threadType as any,
          authorId: context.user.userId
        };

        // Only add topics if topicIds are provided
        if (input.topicIds && input.topicIds.length > 0) {
          postData.topics = {
            create: input.topicIds.map(topicId => ({
              topicId
            }))
          };
        }

        const post = await prisma.post.create({
          data: postData
        });

        logger.info('Post created successfully:', { postId: post.id, authorId: context.user.userId });

        // Publish real-time event
        publishPostCreated(post);

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
          authorId: post.authorId,
          topics: [],
          voteCount: 0,
          userVote: null,
          bookmarked: false
        };
      } catch (error) {
        logger.error('Error creating post:', error);
        throw error;
      }
    },

    updatePost: async (
      parent: any,
      { id, input }: { id: string; input: { title?: string; content?: string; threadType?: string; topicIds?: string[] } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if post exists and user owns it
        const existingPost = await context.dataLoaders.postLoader.load(id);
        if (!existingPost) {
          throw new NotFoundError('Post not found');
        }

        if (existingPost.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only edit your own posts');
        }

        // Validate input
        if (input.title && input.title.length > 300) {
          throw new ValidationError('Title must be less than 300 characters');
        }

        if (input.topicIds && input.topicIds.length === 0) {
          throw new ValidationError('At least one topic is required');
        }

        // Verify topics exist if provided
        if (input.topicIds) {
          const topics = await prisma.topic.findMany({
            where: { id: { in: input.topicIds } }
          });

          if (topics.length !== input.topicIds.length) {
            throw new ValidationError('One or more topics not found');
          }
        }

        // Update post
        const updateData: any = {};
        if (input.title !== undefined) updateData.title = input.title.trim();
        if (input.content !== undefined) updateData.content = input.content.trim();
        if (input.threadType !== undefined) updateData.threadType = input.threadType;

        const post = await prisma.post.update({
          where: { id },
          data: updateData
        });

        // Update topics if provided
        if (input.topicIds) {
          // Remove existing topic associations
          await prisma.postTopic.deleteMany({
            where: { postId: id }
          });

          // Add new topic associations
          await prisma.postTopic.createMany({
            data: input.topicIds.map(topicId => ({
              postId: id,
              topicId
            }))
          });

          // Reload post with updated topics
          const updatedPost = await prisma.post.findUnique({
            where: { id }
          });

          // Clear post cache
          context.dataLoaders.postLoader.clear(id);

          logger.info('Post updated successfully:', { postId: id, authorId: context.user.userId });

          // Publish real-time event
          publishPostUpdated(updatedPost!);

          return {
            id: updatedPost!.id,
            title: updatedPost!.title,
            content: updatedPost!.content,
            threadType: updatedPost!.threadType,
            views: updatedPost!.views,
            isPinned: updatedPost!.isPinned,
            isLocked: updatedPost!.isLocked,
            createdAt: updatedPost!.createdAt,
            updatedAt: updatedPost!.updatedAt,
            authorId: updatedPost!.authorId,
            topics: [],
            voteCount: 0, // Will be calculated by field resolver
            userVote: null, // Will be calculated by field resolver
            bookmarked: false // Will be calculated by field resolver
          };
        }

        // Clear post cache
        context.dataLoaders.postLoader.clear(id);

        logger.info('Post updated successfully:', { postId: id, authorId: context.user.userId });

        // Publish real-time event
        publishPostUpdated(post);

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
          authorId: post.authorId,
          topics: [],
          voteCount: 0, // Will be calculated by field resolver
          userVote: null, // Will be calculated by field resolver
          bookmarked: false // Will be calculated by field resolver
        };
      } catch (error) {
        logger.error('Error updating post:', error);
        throw error;
      }
    },

    deletePost: async (
      parent: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      try {
        // Check if post exists and user owns it
        const existingPost = await context.dataLoaders.postLoader.load(id);
        if (!existingPost) {
          throw new NotFoundError('Post not found');
        }

        if (existingPost.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only delete your own posts');
        }

        // Soft delete the post
        await prisma.post.update({
          where: { id },
          data: { deletedAt: new Date() }
        });

        // Clear post cache
        context.dataLoaders.postLoader.clear(id);

        logger.info('Post deleted successfully:', { postId: id, authorId: context.user.userId });

        return true;
      } catch (error) {
        logger.error('Error deleting post:', error);
        throw error;
      }
    }
  }
};

