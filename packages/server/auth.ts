import type { AuthUser, TokenClaims } from '@muvat/shared';
import { getAdminAuth } from './firebase-admin';

const adminAuth = getAdminAuth();

export async function verifyToken(bearerToken: string): Promise<AuthUser> {
  const token = bearerToken.startsWith('Bearer ')
    ? bearerToken.slice(7)
    : bearerToken;

  const decoded = await adminAuth.verifyIdToken(token);
  const claims = decoded as typeof decoded & Partial<TokenClaims>;

  if (!claims.tenantId) {
    throw new Error('Token missing tenantId claim');
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    tenantId: claims.tenantId,
    role: claims.role ?? 'member',
  };
}

export async function setUserClaims(
  uid: string,
  tenantId: string,
  role: TokenClaims['role'],
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { tenantId, role });
}

export async function createUser(email: string, password: string): Promise<string> {
  const user = await adminAuth.createUser({ email, password });
  return user.uid;
}
