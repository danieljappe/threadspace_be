import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { SessionManager } from './session';
import { logger } from './logger';

export interface AuthPayload {
  userId: string;
  username: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export class AuthService {
  static generateTokens(userId: string, username: string, email: string): { accessToken: string; refreshToken: string } {
    const payload: AuthPayload = { userId, username, email };
    
    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string): AuthPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch (error) {
      logger.debug('Invalid access token:', error);
      return null;
    }
  }

  static verifyRefreshToken(token: string): { userId: string } | null {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
    } catch (error) {
      logger.debug('Invalid refresh token:', error);
      return null;
    }
  }

  static async storeTokens(accessToken: string, refreshToken: string, userId: string): Promise<void> {
    const tokenId = refreshToken.split('.')[2]; // Use last part of JWT as ID
    await SessionManager.setRefreshToken(tokenId, userId);
  }

  static async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenId = refreshToken.split('.')[2];
    await SessionManager.deleteRefreshToken(tokenId);
  }

  static async isRefreshTokenValid(refreshToken: string): Promise<boolean> {
    const tokenId = refreshToken.split('.')[2];
    const storedUserId = await SessionManager.getRefreshToken(tokenId);
    return storedUserId !== null;
  }

  static setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  static clearAuthCookies(res: Response): void {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
  }
}

// Middleware for protecting routes
export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies.accessToken || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const payload = AuthService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid access token' });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check cookies, Authorization header, or query parameter (for SSE)
    const token = req.cookies.accessToken 
      || req.headers.authorization?.replace('Bearer ', '')
      || (req.query.token as string | undefined);

    if (token) {
      const payload = AuthService.verifyAccessToken(token);
      if (payload) {
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next(); // Continue without authentication
  }
};

// Rate limiting helper
export const createRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const [ip, data] of requests.entries()) {
      if (data.resetTime < windowStart) {
        requests.delete(ip);
      }
    }

    const userRequests = requests.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (userRequests.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    userRequests.count++;
    requests.set(key, userRequests);
    next();
  };
};

export default AuthService;
