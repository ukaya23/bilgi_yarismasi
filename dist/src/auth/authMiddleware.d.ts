/**
 * Authentication Middleware for Express Routes
 */
import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, UserRole } from '../types';
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
export declare function authenticateRefreshToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
export declare function requireRole(...roles: UserRole[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=authMiddleware.d.ts.map