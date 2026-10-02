import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}

    interface Request {
      user?: AuthenticatedUser;
      userId?: string;
      workspaceId?: string;
    }
  }
}

export {};
