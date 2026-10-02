import { Role } from '@prisma/client';

/** Access-token claims — workspaceId is the tenant isolation key. */
export type AccessTokenPayload = {
  sub: string;
  workspaceId: string;
  role: Role;
  email: string;
};

/** Attached to `req.user` after JwtStrategy.validate(). */
export type AuthenticatedUser = {
  userId: string;
  workspaceId: string;
  role: Role;
  email: string;
};
