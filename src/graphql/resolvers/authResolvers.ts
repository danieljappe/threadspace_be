import prisma from '../../config/database';
import { logger } from '../../config/logger';
import { AuthService } from '../../config/auth';
import { 
  validateEmail, 
  validateUsername, 
  validatePassword,
  generateSlug,
  ValidationError,
  AuthenticationError,
  ConflictError
} from './utils';
import { DataLoaderContext } from './dataloaders';
import bcrypt from 'bcryptjs';

export interface GraphQLContext {
  user?: {
    userId: string;
    username: string;
    email: string;
    isAdmin?: boolean;
  };
  dataLoaders: DataLoaderContext;
  res?: any; // Response object for setting cookies
}

export const authResolvers = {
  Mutation: {
    register: async (
      parent: any, 
      { input }: { input: { username: string; email: string; password: string; bio?: string } },
      context: GraphQLContext
    ) => {
      try {
        // Validate input
        if (!validateEmail(input.email)) {
          throw new ValidationError('Invalid email format');
        }

        if (!validateUsername(input.username)) {
          throw new ValidationError('Username must be 3-30 characters and contain only letters, numbers, and underscores');
        }

        if (!validatePassword(input.password)) {
          throw new ValidationError('Password must be at least 8 characters long');
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: input.email },
              { username: input.username }
            ]
          }
        });

        if (existingUser) {
          if (existingUser.email === input.email) {
            throw new ConflictError('Email already registered');
          }
          if (existingUser.username === input.username) {
            throw new ConflictError('Username already taken');
          }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 12);

        // Create user
        const user = await prisma.user.create({
          data: {
            username: input.username,
            email: input.email,
            passwordHash,
            bio: input.bio
          }
        });

        // Generate tokens
        const { accessToken, refreshToken } = AuthService.generateTokens(
          user.id,
          user.username,
          user.email
        );

        // Store refresh token in database
        await AuthService.storeTokens(accessToken, refreshToken, user.id);

        // Set auth cookies
        if (context.res) {
          AuthService.setAuthCookies(context.res, accessToken, refreshToken);
        }

        logger.info('User registered successfully:', { userId: user.id, username: user.username });

        return {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            reputation: user.reputation,
            isVerified: user.isVerified,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin,
            isActive: user.isActive
          },
          accessToken,
          refreshToken
        };
      } catch (error) {
        logger.error('Registration error:', error);
        throw error;
      }
    },

    login: async (
      parent: any, 
      { input }: { input: { email: string; password: string } },
      context: GraphQLContext
    ) => {
      try {
        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: input.email }
        });

        if (!user) {
          throw new AuthenticationError('Invalid credentials');
        }

        if (!user.isActive) {
          throw new AuthenticationError('Account is deactivated');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
        if (!isPasswordValid) {
          throw new AuthenticationError('Invalid credentials');
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        });

        // Generate tokens
        const { accessToken, refreshToken } = AuthService.generateTokens(
          user.id,
          user.username,
          user.email
        );

        // Store refresh token in database
        await AuthService.storeTokens(accessToken, refreshToken, user.id);

        // Set auth cookies
        if (context.res) {
          AuthService.setAuthCookies(context.res, accessToken, refreshToken);
        }

        logger.info('User logged in successfully:', { userId: user.id, username: user.username });

        return {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            reputation: user.reputation,
            isVerified: user.isVerified,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin,
            isActive: user.isActive
          },
          accessToken,
          refreshToken
        };
      } catch (error) {
        logger.error('Login error:', error);
        throw error;
      }
    },

    logout: async (parent: any, args: any, context: GraphQLContext) => {
      try {
        if (context.user) {
          // In a real implementation, you would revoke the refresh token here
          // For now, we'll just clear the cookies
          if (context.res) {
            AuthService.clearAuthCookies(context.res);
          }

          logger.info('User logged out:', { userId: context.user.userId });
        }

        return true;
      } catch (error) {
        logger.error('Logout error:', error);
        throw error;
      }
    },

    refreshToken: async (parent: any, args: any, context: GraphQLContext) => {
      try {
        // In a real implementation, you would get the refresh token from cookies or headers
        // For now, we'll return an error as this requires proper token handling
        throw new AuthenticationError('Refresh token not implemented in GraphQL context');
      } catch (error) {
        logger.error('Refresh token error:', error);
        throw error;
      }
    }
  }
};

