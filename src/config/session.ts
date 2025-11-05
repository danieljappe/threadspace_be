import prisma from './database';
import { logger } from './logger';
import crypto from 'crypto';

// Session management helpers using database
export class SessionManager {
  private static readonly REFRESH_TTL_DAYS = 7; // 7 days
  private static readonly SESSION_TTL_HOURS = 24; // 24 hours

  // Hash token for storage (using last part of JWT as identifier)
  private static hashToken(tokenPart: string): string {
    return crypto.createHash('sha256').update(tokenPart).digest('hex');
  }

  static async setRefreshToken(tokenId: string, userId: string): Promise<void> {
    try {
      const tokenHash = this.hashToken(tokenId);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TTL_DAYS);

      // Generate a unique tokenHash for the session (required field)
      // We use a prefix + hash to ensure uniqueness
      const sessionTokenHash = `refresh_${tokenHash}`;

      await prisma.session.upsert({
        where: { refreshTokenHash: tokenHash },
        update: {
          userId,
          tokenHash: sessionTokenHash,
          refreshTokenHash: tokenHash,
          expiresAt,
          lastActivity: new Date(),
        },
        create: {
          userId,
          tokenHash: sessionTokenHash,
          refreshTokenHash: tokenHash,
          expiresAt,
        },
      });

      logger.debug('Refresh token stored in database', { userId });
    } catch (error) {
      logger.error('Error storing refresh token:', error);
      throw error;
    }
  }

  static async getRefreshToken(tokenId: string): Promise<string | null> {
    try {
      const tokenHash = this.hashToken(tokenId);
      const session = await prisma.session.findUnique({
        where: { refreshTokenHash: tokenHash },
      });

      if (!session) {
        return null;
      }

      // Check if token is expired
      if (session.expiresAt < new Date()) {
        // Delete expired token
        await prisma.session.delete({
          where: { refreshTokenHash: tokenHash },
        });
        return null;
      }

      // Update last activity
      await prisma.session.update({
        where: { refreshTokenHash: tokenHash },
        data: { lastActivity: new Date() },
      });

      return session.userId || null;
    } catch (error) {
      logger.error('Error getting refresh token:', error);
      return null;
    }
  }

  static async deleteRefreshToken(tokenId: string): Promise<void> {
    try {
      const tokenHash = this.hashToken(tokenId);
      await prisma.session.deleteMany({
        where: { refreshTokenHash: tokenHash },
      });
      logger.debug('Refresh token deleted from database', { tokenId: tokenId.substring(0, 8) });
    } catch (error) {
      logger.error('Error deleting refresh token:', error);
      // Don't throw - allow cleanup to continue
    }
  }

  static async invalidateUserSessions(userId: string): Promise<void> {
    try {
      await prisma.session.deleteMany({
        where: { userId },
      });
      logger.info('All user sessions invalidated', { userId });
    } catch (error) {
      logger.error('Error invalidating user sessions:', error);
      throw error;
    }
  }

  // Clean up expired sessions (can be called periodically)
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      logger.debug(`Cleaned up ${result.count} expired sessions`);
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }
}

