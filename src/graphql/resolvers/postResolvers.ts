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
import { publishPostCreated } from './subscriptionResolvers';

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
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          authorId: post.authorId,
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
     */
    posts: async (
      parent: any,
      { 
        orderBy = 'NEWEST', 
        first = 10, 
        after 
      }: {
        orderBy?: 'NEWEST' | 'OLDEST' | 'TOP';
        first?: number;
        after?: string;
      },
      context: GraphQLContext
    ) => {
      try {
        const startTime = Date.now();

        // Validate and limit pagination size (max 50)
        const limit = Math.min(Math.max(first || 10, 1), 50);

        // Parse cursor (format: "timestamp|id" or just "timestamp" for backward compatibility)
        let cursorTime: Date | null = null;
        let cursorId: string | null = null;
        if (after) {
          if (after.includes('|')) {
            // Compound cursor: timestamp|id
            const [timestamp, id] = after.split('|');
            cursorTime = new Date(timestamp);
            cursorId = id;
            if (isNaN(cursorTime.getTime())) {
              throw new ValidationError('Invalid cursor format. Expected ISO timestamp|id.');
            }
          } else {
            // Legacy cursor: just timestamp (for backward compatibility)
            cursorTime = new Date(after);
            if (isNaN(cursorTime.getTime())) {
              throw new ValidationError('Invalid cursor format. Expected ISO timestamp.');
            }
          }
        }

        // Build WHERE clause
        const where: any = {
          deletedAt: null
        };

        // Add cursor condition for pagination
        if (cursorTime) {
          if (cursorId) {
            // Compound cursor: (createdAt < cursorTime) OR (createdAt = cursorTime AND id < cursorId)
            where.AND = [
              { deletedAt: null },
              {
                OR: [
                  { createdAt: { lt: cursorTime } },
                  {
                    AND: [
                      { createdAt: cursorTime },
                      { id: { lt: cursorId } }
                    ]
                  }
                ]
              }
            ];
            // Remove the top-level deletedAt since it's now in AND
            delete where.deletedAt;
          } else {
            // Legacy cursor: just timestamp
            where.createdAt = { lt: cursorTime };
          }
        }

        // Build ORDER BY clause (add ID as secondary sort for deterministic ordering)
        let orderByClause: any[] = [];
        
        switch (orderBy) {
          case 'OLDEST':
            orderByClause = [{ createdAt: 'asc' }, { id: 'asc' }];
            break;
          case 'TOP':
            orderByClause = [{ views: 'desc' }, { id: 'desc' }];
            break;
          case 'NEWEST':
          default:
            orderByClause = [{ createdAt: 'desc' }, { id: 'desc' }];
        }

        // Fetch posts (fetch one extra to determine hasNextPage)
        const posts = await prisma.post.findMany({
          where,
          orderBy: orderByClause,
          take: limit + 1,
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
          posts.pop();
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
          const postVotes = allVotes.filter((v: any) => v.votableId === post.id);
          
          return {
            node: {
              id: post.id,
              title: post.title,
              content: post.content,
              createdAt: post.createdAt,
              updatedAt: post.updatedAt,
              author: post.users,
              voteCount: calculateVoteCount(postVotes),
              userVote: context.user ? getUserVote(postVotes, context.user.userId) : null,
              bookmarked: context.user ? isPostBookmarked(allBookmarks, context.user.userId) : false,
              commentCount: post._count.comments
            },
            cursor: `${post.createdAt?.toISOString() ?? new Date().toISOString()}|${post.id}`
          };
        });

        // Build pageInfo
        const pageInfo = {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor || null,
          endCursor: edges[edges.length - 1]?.cursor || null
        };

        const result = {
          edges,
          pageInfo,
          totalCount
        };

        const duration = Date.now() - startTime;
        logger.info('Posts query executed', {
          duration,
          count: posts.length,
          hasNextPage,
          totalCount,
          orderBy
        });

        return result;

      } catch (error) {
        logger.error('Error fetching posts:', error);
        throw error;
      }
    },

    /**
     * Get user's bookmarked posts with cursor-based pagination
     */
    bookmarkedPosts: async (
      parent: any,
      {
        first = 10,
        after,
        orderBy = 'NEWEST'
      }: {
        first?: number;
        after?: string;
        orderBy?: 'NEWEST' | 'OLDEST' | 'TOP';
      },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to view bookmarks');
      }

      try {
        const startTime = Date.now();
        const limit = Math.min(Math.max(first || 10, 1), 50);

        let cursor: Date | null = null;
        if (after) {
          cursor = new Date(after);
          if (isNaN(cursor.getTime())) {
            throw new ValidationError('Invalid cursor format. Expected ISO timestamp.');
          }
        }

        const bookmarkWhere: any = {
          userId: context.user.userId,
        };

        if (cursor) {
          bookmarkWhere.createdAt = { lt: cursor };
        }

        const orderByClause = orderBy === 'OLDEST' 
          ? { createdAt: 'asc' as const }
          : { createdAt: 'desc' as const };

        const bookmarks = await prisma.bookmark.findMany({
          where: bookmarkWhere,
          orderBy: orderByClause,
          take: limit + 1,
          include: {
            posts: {
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
                _count: {
                  select: {
                    comments: true
                  }
                }
              }
            }
          }
        });

        // Filter out bookmarks where the post was deleted
        const validBookmarks = bookmarks.filter(
          (bookmark: any) => bookmark.posts && bookmark.posts.deletedAt === null
        );

        const hasNextPage = validBookmarks.length > limit;
        if (hasNextPage) {
          validBookmarks.pop();
        }

        const totalCount = await prisma.bookmark.count({
          where: {
            userId: context.user.userId,
            posts: {
              deletedAt: null
            }
          }
        });

        const postIds = validBookmarks.map((bookmark: any) => bookmark.posts.id);
        const allVotes = await prisma.vote.findMany({
          where: {
            votableId: { in: postIds },
            votableType: 'post'
          }
        });

        const edges = validBookmarks.map((bookmark: any) => {
          const post = bookmark.posts;
          const postVotes = allVotes.filter((v: any) => v.votableId === post.id);

          return {
            node: {
              id: post.id,
              title: post.title,
              content: post.content,
              createdAt: post.createdAt,
              updatedAt: post.updatedAt,
              author: post.users,
              voteCount: calculateVoteCount(postVotes),
              userVote: getUserVote(postVotes, context.user!.userId),
              bookmarked: true,
              commentCount: post._count.comments
            },
            cursor: bookmark.createdAt?.toISOString() ?? new Date().toISOString()
          };
        });

        const pageInfo = {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor || null,
          endCursor: edges[edges.length - 1]?.cursor || null
        };

        const duration = Date.now() - startTime;
        logger.info('Bookmarked posts query executed', {
          duration,
          count: edges.length,
          hasNextPage,
          totalCount,
          userId: context.user.userId
        });

        return {
          edges,
          pageInfo,
          totalCount
        };

      } catch (error) {
        logger.error('Error fetching bookmarked posts:', error);
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
      { input }: { input: { title: string; content: string } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to create a post');
      }

      try {
        const { title, content } = input;

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
            threadType: 'DISCUSSION',
            authorId: context.user.userId
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
            }
          }
        });

        // Publish post created event
        publishPostCreated({
          ...post,
          author: post.users,
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
     * Edit a post (only owner can edit)
     */
    editPost: async (
      parent: any,
      { input }: { input: { id: string; title?: string; content?: string } },
      context: GraphQLContext
    ) => {
      if (!context.user) {
        throw new AuthenticationError('You must be logged in to edit a post');
      }

      try {
        const { id, title, content } = input;

        // Validate that at least one field is provided
        if (!title && !content) {
          throw new ValidationError('At least one field (title or content) must be provided');
        }

        // Find the post
        const post = await prisma.post.findUnique({
          where: { id },
          include: {
            users: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                reputation: true,
                isVerified: true
              }
            }
          }
        });

        if (!post) {
          throw new NotFoundError('Post not found');
        }

        if (post.deletedAt) {
          throw new NotFoundError('Post not found');
        }

        // Check authorization - only owner can edit
        if (post.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only edit your own posts');
        }

        // Validate input
        const updateData: any = {};
        
        if (title !== undefined) {
          if (!title || title.trim().length === 0) {
            throw new ValidationError('Post title cannot be empty');
          }
          if (title.length > 300) {
            throw new ValidationError('Post title must be less than 300 characters');
          }
          updateData.title = title.trim();
        }

        if (content !== undefined) {
          if (!content || content.trim().length === 0) {
            throw new ValidationError('Post content cannot be empty');
          }
          updateData.content = content.trim();
        }

        // Update the post
        const updatedPost = await prisma.post.update({
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
            }
          }
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

        logger.info('Post edited', {
          postId: id,
          userId: context.user.userId
        });

        return {
          id: updatedPost.id,
          title: updatedPost.title,
          content: updatedPost.content,
          createdAt: updatedPost.createdAt,
          updatedAt: updatedPost.updatedAt,
          author: updatedPost.users,
          voteCount: calculateVoteCount(votes),
          userVote: context.user ? getUserVote(votes, context.user.userId) : null,
          bookmarked: context.user ? isPostBookmarked(bookmarks, context.user.userId) : false
        };

      } catch (error) {
        logger.error('Error editing post:', error);
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
        const post = await prisma.post.findUnique({
          where: { id }
        });

        if (!post) {
          throw new NotFoundError('Post not found');
        }

        if (post.authorId !== context.user.userId && !context.user.isAdmin) {
          throw new AuthorizationError('You can only delete your own posts');
        }

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
