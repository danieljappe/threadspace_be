import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { 
  calculateVoteCount,
  getUserVote,
  isPostBookmarked,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  AuthorizationError
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
    /**
     * Get a single post by ID
     */
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
          views: (post.views ?? 0) + 1,
          isPinned: post.isPinned,
          isLocked: post.isLocked,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
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

    /**
     * Get posts with cursor-based pagination (INFINITE SCROLL)
     * 
     * This implements efficient cursor-based pagination for infinite scroll.
     * Uses ISO timestamp cursors instead of offset-based pagination.
     */
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
        const startTime = Date.now();

        // Validate and limit pagination size (max 50)
        const limit = Math.min(Math.max(first || 10, 1), 50);

        // Parse cursor (ISO timestamp)
        let cursor: Date | null = null;
        if (after) {
          cursor = new Date(after);
          if (isNaN(cursor.getTime())) {
            throw new ValidationError('Invalid cursor format. Expected ISO timestamp.');
          }
        }

        // Build WHERE clause - use deletedAt: null instead of isActive
        const where: any = {
          deletedAt: null
        };

        // Add cursor condition for pagination
        if (cursor) {
          where.createdAt = { lt: cursor };
        }

        // Add topic filter
        if (topicId) {
          where.post_topics = {
            some: { topicId }
          };
        }

        // Add author filter
        if (authorId) {
          where.authorId = authorId;
        }

        // Add full-text search
        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } }
          ];
        }

        // Build ORDER BY clause - use available fields only
        let orderByClause: any = { createdAt: 'desc' };
        
        switch (orderBy) {
          case 'OLDEST':
            orderByClause = { createdAt: 'asc' };
            break;
          case 'TRENDING':
            // Trending = high views in recent posts
            orderByClause = [
              { views: 'desc' },
              { createdAt: 'desc' }
            ];
            break;
          case 'TOP':
            orderByClause = { views: 'desc' };
            break;
          case 'NEWEST':
          default:
            orderByClause = { createdAt: 'desc' };
        }

        // Fetch posts (fetch one extra to determine hasNextPage)
        const posts = await prisma.post.findMany({
          where,
          orderBy: orderByClause,
          take: limit + 1, // Fetch one extra
          include: {
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                avatarUrl: true,
                reputation: true,
                isVerified: true
              }
            },
            post_topics: {
              include: {
                topics: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    color: true
                  }
                }
              }
            },
            _count: {
              select: {
                comments: true
              }
            }
          }
        });

        // Determine if there are more posts
        const hasNextPage = posts.length > limit;
        if (hasNextPage) {
          posts.pop(); // Remove the extra post
        }

        // Get total count
        const totalCount = await prisma.post.count({ where });

        // Get votes and bookmarks for all posts
        const postIds = posts.map((p: any) => p.id);
        
        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: { in: postIds },
            votableType: 'post'
          }
        });

        const allBookmarks = context.user ? await prisma.bookmark.findMany({
          where: {
            postId: { in: postIds },
            userId: context.user.userId
          }
        }) : [];

        // Build edges with vote and bookmark data
        const edges = posts.map((post: any) => {
          // Get votes for this post
          const postVotes = allVotes.filter((v: any) => v.votableId === post.id);
          
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
              author: post.users,
              topics: post.post_topics.map((pt: any) => pt.topics),
              voteCount: calculateVoteCount(postVotes),
              userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
              bookmarked: context.user ? isPostBookmarked(allBookmarks, context.user.userId) : false,
              commentCount: post._count.comments
            },
            cursor: post.createdAt?.toISOString() ?? new Date().toISOString()
          };
        });

        // Build pageInfo
        const pageInfo = {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor || null,
          endCursor: edges[edges.length - 1]?.cursor || null
        };

        // Build result
        const result = {
          edges,
          pageInfo,
          totalCount
        };

        // Log query performance
        const duration = Date.now() - startTime;
        logger.info('Posts query executed', {
          duration,
          count: posts.length,
          hasNextPage,
          totalCount,
          orderBy
        });

        // Warn if query is slow
        if (duration > 500) {
          logger.warn('Slow posts query detected', {
            duration,
            args: { topicId, authorId, search, orderBy, first, after },
            userId: context.user?.userId
          });
        }

        return result;

      } catch (error) {
        logger.error('Error fetching posts:', error);
        throw error;
      }
    },

    /**
     * Get trending posts
     */
    trendingPosts: async (
      parent: any,
      { first = 10 }: { first: number },
      context: GraphQLContext
    ) => {
      const limit = Math.min(first, 20);

      try {
        // Fetch trending posts from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const posts = await prisma.post.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: sevenDaysAgo }
          },
          orderBy: [
            { views: 'desc' },
            { createdAt: 'desc' }
          ],
          take: limit,
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                reputation: true,
                isVerified: true
              }
            },
            post_topics: {
              include: {
                topics: true
              }
            },
            _count: {
              select: {
                comments: true
              }
            }
          }
        });

        // Get votes for all posts
        const postIds = posts.map((p: any) => p.id);
        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: { in: postIds },
            votableType: 'post'
          }
        });

        const allBookmarks = context.user ? await prisma.bookmark.findMany({
          where: {
            postId: { in: postIds },
            userId: context.user.userId
          }
        }) : [];

        const result = posts.map((post: any) => {
          const postVotes = allVotes.filter((v: any) => v.votableId === post.id);
          
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
            author: post.users,
            topics: post.post_topics.map((pt: any) => pt.topics),
            voteCount: calculateVoteCount(postVotes),
            userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
            bookmarked: context.user ? isPostBookmarked(allBookmarks, context.user.userId) : false,
            commentCount: post._count.comments
          };
        });

        return result;

      } catch (error) {
        logger.error('Error fetching trending posts:', error);
        throw error;
      }
    }
  },

  Mutation: {
    /**
     * Create a new post
     */
    createPost: async (
      parent: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to create a post');
      }

      try {
        const { title, content, threadType = 'DISCUSSION', topicIds = [] } = input;

        // Validate input
        if (!title || title.trim().length === 0) {
          throw new ValidationError('Post title is required');
        }
        if (!content || content.trim().length === 0) {
          throw new ValidationError('Post content is required');
        }
        if (title.length > 300) {
          throw new ValidationError('Post title must be less than 300 characters');
        }

        // Create post
        const post = await prisma.post.create({
          data: {
            title: title.trim(),
            content: content.trim(),
            threadType,
            authorId: context.user.userId,
            post_topics: {
              create: topicIds.map((topicId: string) => ({
                topicId
              }))
            }
          },
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                reputation: true,
                isVerified: true
              }
            },
            post_topics: {
              include: {
                topics: true
              }
            }
          }
        });

        // Publish post created event
        publishPostCreated({
          ...post,
          author: post.users,
          topics: post.post_topics.map((pt: any) => pt.topics),
          voteCount: 0,
          userVote: null,
          bookmarked: false,
          commentCount: 0
        });

        logger.info('Post created', {
          postId: post.id,
          authorId: context.user.userId
        });

        return {
          ...post,
          author: post.users,
          topics: post.post_topics.map((pt: any) => pt.topics),
          voteCount: 0,
          userVote: null,
          bookmarked: false,
          commentCount: 0
        };

      } catch (error) {
        logger.error('Error creating post:', error);
        throw error;
      }
    },

    /**
     * Update a post
     */
    updatePost: async (
      parent: any,
      { id, input }: { id: string; input: any },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to update a post');
      }

      try {
        // Check if post exists and user is author
        const existingPost = await prisma.post.findUnique({
          where: { id }
        });

        if (!existingPost) {
          throw new NotFoundError('Post not found');
        }

        if (existingPost.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only update your own posts');
        }

        const { title, content, threadType, topicIds } = input;

        // Validate input
        if (title && title.length > 300) {
          throw new ValidationError('Post title must be less than 300 characters');
        }

        // Update post
        const updateData: any = {};
        if (title !== undefined) updateData.title = title.trim();
        if (content !== undefined) updateData.content = content.trim();
        if (threadType !== undefined) updateData.threadType = threadType;

        // Update topics if provided
        if (topicIds !== undefined) {
          // Delete existing topics
          await prisma.postTopic.deleteMany({
            where: { postId: id }
          });

          // Create new topics
          updateData.post_topics = {
            create: topicIds.map((topicId: string) => ({
              topicId
            }))
          };
        }

        const post = await prisma.post.update({
          where: { id },
          data: updateData,
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                reputation: true,
                isVerified: true
              }
            },
            post_topics: {
              include: {
                topics: true
              }
            },
            _count: {
              select: {
                comments: true
              }
            }
          }
        });

        // Get vote data
        const votes = await prisma.vote.findMany({
          where: {
            votableId: id,
            votableType: 'post'
          }
        });

        const bookmarks = context.user ? await prisma.bookmark.findMany({
          where: { postId: id }
        }) : [];

        const result = {
          ...post,
          author: post.users,
          topics: post.post_topics.map((pt: any) => pt.topics),
          voteCount: calculateVoteCount(votes),
          userVote: context.user ? getUserVote(votes, context.user.userId) : null,
          bookmarked: context.user ? isPostBookmarked(bookmarks, context.user.userId) : false,
          commentCount: post._count.comments
        };

        // Publish post updated event
        publishPostUpdated(result);

        logger.info('Post updated', {
          postId: id,
          userId: context.user.userId
        });

        return result;

      } catch (error) {
        logger.error('Error updating post:', error);
        throw error;
      }
    },

    /**
     * Delete a post (soft delete)
     */
    deletePost: async (
      parent: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to delete a post');
      }

      try {
        // Check if post exists and user is author
        const post = await prisma.post.findUnique({
          where: { id }
        });

        if (!post) {
          throw new NotFoundError('Post not found');
        }

        if (post.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only delete your own posts');
        }

        // Soft delete (set deletedAt timestamp)
        await prisma.post.update({
          where: { id },
          data: { deletedAt: new Date() }
        });

        logger.info('Post deleted', {
          postId: id,
          userId: context.user.userId
        });

        return true;

      } catch (error) {
        logger.error('Error deleting post:', error);
        throw error;
      }
    }
  },

  Post: {
    /**
     * Resolve author field
     */
    author: async (parent: any, args: any, context: GraphQLContext) => {
      if (parent.author) return parent.author;
      if (!parent.authorId) return null;
      return context.dataLoaders.userLoader.load(parent.authorId);
    },

    /**
     * Resolve topics field
     */
    topics: async (parent: any, args: any, context: GraphQLContext) => {
      if (parent.topics) return parent.topics;

      const postTopics = await prisma.postTopic.findMany({
        where: { postId: parent.id },
        include: { topics: true }
      });

      return postTopics.map((pt: any) => pt.topics);
    },

    /**
     * Resolve comments field with pagination
     */
    comments: async (
      parent: any,
      { first = 20, after, orderBy = 'NEWEST' }: any,
      context: GraphQLContext
    ) => {
      const limit = Math.min(first, 50);
      let cursor: Date | null = null;

      if (after) {
        cursor = new Date(after);
      }

      const where: any = {
        postId: parent.id,
        deletedAt: null
      };

      if (cursor) {
        where.createdAt = { lt: cursor };
      }

      // Use valid orderBy - createdAt or views-based ordering
      const orderByClause: any = orderBy === 'OLDEST' 
        ? { createdAt: 'asc' as const }
        : { createdAt: 'desc' as const };

      const comments = await prisma.comment.findMany({
        where,
        orderBy: orderByClause,
        take: limit + 1,
        include: {
          users: true,
          _count: {
            select: { other_comments: true }
          }
        }
      });

      const hasNextPage = comments.length > limit;
      if (hasNextPage) comments.pop();

      const edges = comments.map((comment: any) => ({
        node: {
          ...comment,
          author: comment.users,
          replyCount: comment._count.other_comments
        },
        cursor: comment.createdAt?.toISOString() ?? new Date().toISOString()
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          endCursor: edges[edges.length - 1]?.cursor || null
        },
        totalCount: await prisma.comment.count({ where: { postId: parent.id, deletedAt: null } })
      };
    }
  }
};
