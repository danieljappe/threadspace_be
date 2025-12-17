import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub } from 'graphql-subscriptions';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { logger } from './config/logger';
import { typeDefs } from './graphql/schema';
import { resolvers, createContext } from './graphql/resolvers';
import { optionalAuth } from './config/auth';

const PORT = process.env.PORT || 4000;

// Create PubSub instance for subscriptions
export const pubsub = new PubSub();

async function startServer() {
  try {
    // Create Express app
    const app = express();

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for GraphQL Playground
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    app.use(cors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8080',
        'https://studio.apollographql.com', // Apollo Sandbox
        'https://apollo-studio-embed.herokuapp.com', // Apollo Studio
      ],
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'apollographql-client-name', 'apollographql-client-version', 'Cache-Control', 'Last-Event-ID'],
      exposedHeaders: ['Content-Type', 'Cache-Control'],
    }));

    // Compression middleware - but skip for SSE endpoints
    app.use((req, res, next) => {
      // Skip compression for SSE endpoints to prevent buffering
      if (req.path && req.path.startsWith('/api/posts/') && req.path.endsWith('/events')) {
        return next();
      }
      compression()(req, res, next);
    });

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Cookie parsing middleware
    app.use(cookieParser());

    // Authentication middleware (optional for GraphQL)
    app.use('/graphql', optionalAuth);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // SSE endpoint for post updates (votes, comments, etc.)
    app.get('/api/posts/:postId/events', optionalAuth, async (req, res) => {
      const postId = req.params.postId;
      const user = (req as any).user;
      
      logger.info('[SSE] Connection established for post:', { postId, userId: user?.userId });
      console.log('[SSE Backend] New SSE connection for post:', postId);

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      // Send initial connection message
      const connectedMessage = JSON.stringify({ type: 'connected', postId });
      const connectedData = `data: ${connectedMessage}\n\n`;
      console.log('[SSE Backend] Writing connected message:', connectedData);
      res.write(connectedData);
      console.log('[SSE Backend] ✓ Connected message written, response writable:', !res.writableEnded && !res.destroyed);
      
      // Flush the response to ensure it's sent immediately
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
        console.log('[SSE Backend] Response flushed');
      }

      // Subscribe to vote updates from PubSub
      const voteSubscriptionId = await pubsub.subscribe('VOTE_UPDATED', (payload: any) => {
        try {
          console.log('[SSE Backend] Vote update received from PubSub (full payload):', JSON.stringify(payload, null, 2));
          const voteData = payload.voteUpdated;
          
          if (!voteData) {
            console.log('[SSE Backend] No voteData in payload');
            return;
          }
          
          console.log('[SSE Backend] Checking vote update:', {
            targetId: voteData.targetId,
            targetType: voteData.targetType,
            expectedPostId: postId,
            matches: voteData.targetType === 'post' && voteData.targetId === postId
          });
          
          // Send updates for posts matching this postId, or comments in this post
          const isPostVote = voteData.targetType === 'post' && voteData.targetId === postId;
          const isCommentVote = voteData.targetType === 'comment' && voteData.commentPostId === postId;
          
          // Only send vote updates for this post (either post votes or comment votes in this post)
          if (isPostVote || isCommentVote) {
            // Check if response is still writable
            if (res.writableEnded || res.destroyed) {
              console.log('[SSE Backend] ✗ Response closed, cannot send vote update');
              return;
            }
            
            const eventData = {
              type: 'voteUpdated',
              data: {
                targetId: voteData.targetId,
                targetType: voteData.targetType,
                voteCount: voteData.voteCount,
                userVote: voteData.userVote, // This will be null when vote is removed
              },
            };
            const message = `data: ${JSON.stringify(eventData)}\n\n`;
            console.log('[SSE Backend] ✓ Sending vote update to client:', JSON.stringify(eventData, null, 2));
            
            try {
              res.write(message);
              console.log('[SSE Backend] ✓ Vote update written successfully');
              // Flush to ensure immediate delivery
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            } catch (writeError) {
              console.error('[SSE Backend] ✗ Error writing vote update:', writeError);
            }
          } else {
            console.log('[SSE Backend] ✗ Vote update filtered out (not post or comment):', {
              targetId: voteData.targetId,
              targetType: voteData.targetType,
              expectedPostId: postId,
            });
          }
        } catch (error) {
          logger.error('[SSE Backend] Error in vote update:', error);
          console.error('[SSE Backend] Error in vote update:', error);
          console.error('[SSE Backend] Error stack:', error instanceof Error ? error.stack : 'No stack');
        }
      });
      
      console.log('[SSE Backend] Subscribed to VOTE_UPDATED with subscriptionId:', voteSubscriptionId);

      // Subscribe to comment added events from PubSub
      const commentAddedSubscriptionId = await pubsub.subscribe('COMMENT_ADDED', (payload: any) => {
        try {
          console.log('[SSE Backend] Comment added received (full payload):', JSON.stringify(payload, null, 2));
          const commentData = payload.commentAdded;
          
          if (!commentData) {
            console.log('[SSE Backend] No commentData in payload');
            return;
          }
          
          // Extract postId - could be from commentData.postId or commentData.posts?.id
          const commentPostId = commentData.postId || commentData.posts?.id || commentData.post?.id;
          console.log('[SSE Backend] Comment postId:', commentPostId, 'Expected postId:', postId);
          
          // Only send updates for this specific post
          if (commentPostId === postId) {
            // Check if response is still writable
            if (res.writableEnded || res.destroyed) {
              console.log('[SSE Backend] ✗ Response closed, cannot send comment update');
              return;
            }
            
            // Extract author info - could be from users, author, or authorId
            const author = commentData.users || commentData.author || {
              id: commentData.authorId,
              username: 'Unknown',
              avatarUrl: null,
            };
            
            const eventData = {
              type: 'commentAdded',
              data: {
                id: commentData.id,
                content: commentData.content,
                author: {
                  id: author.id || commentData.authorId,
                  username: author.username || 'Unknown',
                  avatarUrl: author.avatarUrl || null,
                },
                postId: commentPostId,
                parentId: commentData.parentId || commentData.comments?.id || commentData.parent?.id || null,
                depth: commentData.depth || 0,
                createdAt: commentData.createdAt,
              },
            };
            const message = `data: ${JSON.stringify(eventData)}\n\n`;
            console.log('[SSE Backend] Sending comment added:', JSON.stringify(eventData, null, 2));
            
            try {
              res.write(message);
              console.log('[SSE Backend] ✓ Comment added written successfully');
              // Flush to ensure immediate delivery
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            } catch (writeError) {
              console.error('[SSE Backend] ✗ Error writing comment update:', writeError);
            }
          } else {
            console.log('[SSE Backend] Comment update filtered out (wrong post):', {
              commentPostId,
              expectedPostId: postId
            });
          }
        } catch (error) {
          logger.error('[SSE Backend] Error in comment update:', error);
          console.error('[SSE Backend] Error in comment update:', error);
          console.error('[SSE Backend] Error stack:', error instanceof Error ? error.stack : 'No stack');
        }
      });

      // Subscribe to comment deleted events from PubSub
      const commentDeletedSubscriptionId = await pubsub.subscribe('COMMENT_DELETED', (payload: any) => {
        try {
          console.log('[SSE Backend] Comment deleted received (full payload):', JSON.stringify(payload, null, 2));
          const commentData = payload.commentDeleted;
          
          if (!commentData) {
            console.log('[SSE Backend] No commentData in payload');
            return;
          }
          
          // Only send updates for this specific post
          if (commentData.postId === postId) {
            // Check if response is still writable
            if (res.writableEnded || res.destroyed) {
              console.log('[SSE Backend] ✗ Response closed, cannot send comment deleted update');
              return;
            }
            
            const eventData = {
              type: 'commentDeleted',
              data: {
                id: commentData.id,
                postId: commentData.postId,
                parentId: commentData.parentId || null,
              },
            };
            const message = `data: ${JSON.stringify(eventData)}\n\n`;
            console.log('[SSE Backend] Sending comment deleted:', JSON.stringify(eventData, null, 2));
            
            try {
              res.write(message);
              console.log('[SSE Backend] ✓ Comment deleted written successfully');
              // Flush to ensure immediate delivery
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            } catch (writeError) {
              console.error('[SSE Backend] ✗ Error writing comment deleted update:', writeError);
            }
          } else {
            console.log('[SSE Backend] Comment deleted filtered out (wrong post):', {
              commentPostId: commentData.postId,
              expectedPostId: postId
            });
          }
        } catch (error) {
          logger.error('[SSE Backend] Error in comment deleted update:', error);
          console.error('[SSE Backend] Error in comment deleted update:', error);
          console.error('[SSE Backend] Error stack:', error instanceof Error ? error.stack : 'No stack');
        }
      });

      // Keep connection alive with periodic heartbeat
      const heartbeat = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
        } catch (error) {
          console.log('[SSE Backend] Error sending heartbeat, cleaning up');
          clearInterval(heartbeat);
          try {
            pubsub.unsubscribe(voteSubscriptionId);
            pubsub.unsubscribe(commentAddedSubscriptionId);
            pubsub.unsubscribe(commentDeletedSubscriptionId);
          } catch (unsubError) {
            console.error('[SSE Backend] Error unsubscribing:', unsubError);
          }
        }
      }, 30000); // Send heartbeat every 30 seconds

      // Handle client disconnect
      req.on('close', () => {
        logger.info('[SSE] Connection closed for post:', { postId, userId: user?.userId });
        console.log('[SSE Backend] Client disconnected for post:', postId);
        clearInterval(heartbeat);
        try {
          pubsub.unsubscribe(voteSubscriptionId);
          pubsub.unsubscribe(commentAddedSubscriptionId);
          pubsub.unsubscribe(commentDeletedSubscriptionId);
          console.log('[SSE Backend] Unsubscribed from all channels');
        } catch (error) {
          logger.error('[SSE Backend] Error unsubscribing from SSE:', error);
          console.error('[SSE Backend] Error unsubscribing:', error);
        }
        res.end();
      });
    });

    // Create GraphQL schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    // Create Apollo Server
    const server = new ApolloServer({
      schema,
      context: ({ req, res }) => createContext(req, res),
      introspection: true, // Enable introspection for Apollo Sandbox
      plugins: [
        {
          async serverWillStart() {
            return {
              async drainServer() {
              },
            };
          },
        },
      ],
    });

    // Start Apollo Server
    await server.start();

    // Apply Apollo GraphQL middleware
    server.applyMiddleware({ 
      app: app as any, 
      path: '/graphql',
      cors: {
        origin: [
          process.env.FRONTEND_URL || 'http://localhost:3000',
          'http://localhost:3000',
          'http://localhost:3001',
          'https://studio.apollographql.com', // Apollo Sandbox
          'https://apollo-studio-embed.herokuapp.com', // Apollo Studio
        ],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'apollographql-client-name', 'apollographql-client-version'],
      }
    });

    // Create HTTP server
    const httpServer = createServer(app);

    // Note: Real-time updates are handled via SSE (Server-Sent Events) at /api/posts/:postId/events

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => {
        logger.info(`🚀 Server ready at http://localhost:${PORT}`);
        logger.info(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
        logger.info(`🔍 Apollo Sandbox: http://localhost:${PORT}/graphql`);
        logger.info(`📡 SSE endpoint: http://localhost:${PORT}/api/posts/:postId/events`);
        logger.info(`❤️  Health check: http://localhost:${PORT}/health`);
        resolve();
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await server.stop();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await server.stop();
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
