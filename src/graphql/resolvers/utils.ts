import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger';

export interface PaginationArgs {
  first?: number | null;
  after?: string | null;
}

export interface PaginatedResult<T> {
  edges: Array<{ node: T; cursor: string }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number;
}

// Cursor-based pagination helper
export function createCursor(cursorData: any): string {
  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
}

export function parseCursor(cursor: string): any {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  } catch (error) {
    logger.warn('Invalid cursor:', cursor);
    return null;
  }
}

// Generic pagination function
export async function paginateResults<T>(
  items: T[],
  totalCount: number,
  first: number = 10,
  after?: string | null,
  getId: (item: T) => string = (item: any) => item.id
): Promise<PaginatedResult<T>> {
  const startIndex = after ? items.findIndex(item => getId(item) === after) + 1 : 0;
  const endIndex = Math.min(startIndex + first, items.length);
  
  const paginatedItems = items.slice(startIndex, endIndex);
  
  return {
    edges: paginatedItems.map(item => ({
      node: item,
      cursor: createCursor({ id: getId(item) })
    })),
    pageInfo: {
      hasNextPage: endIndex < items.length,
      hasPreviousPage: startIndex > 0,
      startCursor: paginatedItems.length > 0 ? createCursor({ id: getId(paginatedItems[0]) }) : null,
      endCursor: paginatedItems.length > 0 ? createCursor({ id: getId(paginatedItems[paginatedItems.length - 1]) }) : null
    },
    totalCount
  };
}

// Vote count calculation
export function calculateVoteCount(votes: Array<{ voteType: 'UPVOTE' | 'DOWNVOTE' }>): number {
  return votes.reduce((count, vote) => {
    return count + (vote.voteType === 'UPVOTE' ? 1 : -1);
  }, 0);
}

// Get user's vote on a votable item
export function getUserVote(
  votes: Array<{ userId: string; voteType: 'UPVOTE' | 'DOWNVOTE' }>,
  userId: string
): 'UPVOTE' | 'DOWNVOTE' | null {
  const userVote = votes.find(vote => vote.userId === userId);
  return userVote ? userVote.voteType : null;
}

// Check if user has bookmarked a post
export function isPostBookmarked(
  bookmarks: Array<{ userId: string }>,
  userId: string
): boolean {
  return bookmarks.some(bookmark => bookmark.userId === userId);
}

// Check if user is subscribed to a topic
export function isTopicSubscribed(
  subscriptions: Array<{ userId: string }>,
  userId: string
): boolean {
  return subscriptions.some(subscription => subscription.userId === userId);
}

// Generate topic slug from name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Input validation helpers
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
}

export function validatePassword(password: string): boolean {
  return password.length >= 8;
}

// Error handling
export class GraphQLError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

export class ValidationError extends GraphQLError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class AuthenticationError extends GraphQLError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends GraphQLError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends GraphQLError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends GraphQLError {
  constructor(message: string = 'Resource already exists') {
    super(message, 'CONFLICT', 409);
  }
}

