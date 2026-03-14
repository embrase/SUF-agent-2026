import { Request, Response, NextFunction } from 'express';
import { Auth } from 'firebase-admin/auth';
import { sendError } from '../lib/errors.js';
import { AdminRole, AdminUser } from '../types/index.js';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: AdminUser;
}

const VALID_ROLES: AdminRole[] = ['admin', 'moderator'];

export function createAdminAuthMiddleware(auth: Auth) {
  return async (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'unauthorized', 'Missing or invalid Authorization header. Use: Bearer <firebase_id_token>');
      return;
    }

    const idToken = authHeader.slice(7);

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const role = decoded.role as AdminRole | undefined;

      if (!role || !VALID_ROLES.includes(role)) {
        sendError(res, 403, 'forbidden', 'Insufficient permissions. Admin or moderator role required.');
        return;
      }

      req.adminUser = {
        uid: decoded.uid,
        email: decoded.email || '',
        role,
      };

      next();
    } catch (error) {
      sendError(res, 401, 'unauthorized', 'Invalid or expired Firebase ID token');
    }
  };
}

/**
 * Additional middleware to restrict an endpoint to admin-only (not moderator).
 * Use after createAdminAuthMiddleware.
 */
export function requireAdmin(req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.adminUser || req.adminUser.role !== 'admin') {
    sendError(res, 403, 'forbidden', 'This action requires admin role. Moderator access is insufficient.');
    return;
  }
  next();
}
