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
