import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { AuthUser, MachineTokenResponse, TenantRole, TokenClaims } from '@muvat/shared';
import { getAdminAuth } from './firebase-admin';

const adminAuth = getAdminAuth();
const DEFAULT_M2M_ISSUER = 'muvat-m2m';

interface MachineClientConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  role: TenantRole;
  subject: string;
  email?: string;
}

interface MachineAuthConfig {
  issuer: string;
  audience?: string;
  secret: string;
  ttlSeconds: number | null;
  clients: Map<string, MachineClientConfig>;
}

interface MachineTokenClaims extends TokenClaims {
  iss: string;
  sub: string;
  aud?: string;
  iat: number;
  exp?: number;
  jti: string;
  gty: 'client_credentials';
  clientId: string;
  email?: string;
}

interface JwtHeader {
  alg: string;
  typ: string;
}

let machineAuthConfigCache: MachineAuthConfig | null | undefined;

export class MachineAuthError extends Error {
  statusCode: number;
  code: 'invalid_client' | 'server_error';

  constructor(statusCode: number, code: 'invalid_client' | 'server_error', message: string) {
    super(message);
    this.name = 'MachineAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string when provided`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseRole(value: unknown, path: string): TenantRole {
  if (value === undefined) return 'member';
  if (value === 'admin' || value === 'member') return value;
  throw new Error(`${path}.role must be "admin" or "member"`);
}

function parseMachineClients(raw: string): Map<string, MachineClientConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`M2M_CLIENTS must be valid JSON: ${error}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('M2M_CLIENTS must be a non-empty JSON array');
  }

  const clients = new Map<string, MachineClientConfig>();

  parsed.forEach((entry, index) => {
    const path = `M2M_CLIENTS[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${path} must be an object`);
    }

    const clientId = readRequiredString(entry, 'clientId', path);
    if (clients.has(clientId)) {
      throw new Error(`M2M_CLIENTS contains duplicate clientId "${clientId}"`);
    }

    clients.set(clientId, {
      clientId,
      clientSecret: readRequiredString(entry, 'clientSecret', path),
      tenantId: readRequiredString(entry, 'tenantId', path),
      role: parseRole(entry['role'], path),
      subject: readOptionalString(entry, 'subject') ?? `m2m:${clientId}`,
      email: readOptionalString(entry, 'email'),
    });
  });

  return clients;
}

function parseMachineTokenTtl(raw: string | undefined): number | null {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized || normalized === 'infinite' || normalized === 'never' || normalized === '0') {
    return null;
  }

  const ttlSeconds = Number.parseInt(normalized, 10);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 60) {
    throw new Error('M2M_TOKEN_TTL_SECONDS must be "infinite" or an integer >= 60');
  }
  return ttlSeconds;
}

function getMachineAuthConfig(): MachineAuthConfig | null {
  if (machineAuthConfigCache !== undefined) {
    return machineAuthConfigCache;
  }

  const secret = process.env.M2M_JWT_SECRET?.trim();
  const clientsRaw = process.env.M2M_CLIENTS?.trim();

  if (!secret && !clientsRaw) {
    machineAuthConfigCache = null;
    return machineAuthConfigCache;
  }

  if (!secret || !clientsRaw) {
    throw new Error('Machine-to-machine auth requires both M2M_JWT_SECRET and M2M_CLIENTS');
  }

  machineAuthConfigCache = {
    issuer: process.env.M2M_JWT_ISSUER?.trim() || DEFAULT_M2M_ISSUER,
    audience: process.env.M2M_JWT_AUDIENCE?.trim() || undefined,
    secret,
    ttlSeconds: parseMachineTokenTtl(process.env.M2M_TOKEN_TTL_SECONDS),
    clients: parseMachineClients(clientsRaw),
  };

  return machineAuthConfigCache;
}

function normalizeBearerToken(bearerToken: string): string {
  const token = bearerToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('Missing bearer token');
  }
  return token;
}

function createSignature(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function parseTokenSegments(token: string): {
  header: JwtHeader;
  claims: MachineTokenClaims;
  signingInput: string;
  signature: string;
} {
  const [headerPart, payloadPart, signature] = token.split('.');
  if (!headerPart || !payloadPart || !signature) {
    throw new Error('Malformed JWT');
  }

  const header = decodeJwtPart(headerPart);
  const claims = decodeJwtPart(payloadPart);
  if (!isRecord(header) || !isRecord(claims)) {
    throw new Error('JWT header or payload is invalid');
  }

  return {
    header: {
      alg: String(header['alg'] ?? ''),
      typ: String(header['typ'] ?? ''),
    },
    claims: claims as unknown as MachineTokenClaims,
    signingInput: `${headerPart}.${payloadPart}`,
    signature,
  };
}

function looksLikeMachineToken(token: string): boolean {
  const config = getMachineAuthConfig();
  if (!config) return false;

  try {
    const [, payloadPart] = token.split('.');
    if (!payloadPart) return false;
    const payload = decodeJwtPart(payloadPart);
    if (!isRecord(payload)) return false;
    return payload['iss'] === config.issuer
      && payload['gty'] === 'client_credentials'
      && typeof payload['clientId'] === 'string';
  } catch {
    return false;
  }
}

function verifyMachineToken(token: string): AuthUser {
  const config = getMachineAuthConfig();
  if (!config) {
    throw new Error('Machine-to-machine auth is not configured');
  }

  const { header, claims, signingInput, signature } = parseTokenSegments(token);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Invalid machine token header');
  }

  if (claims.iss !== config.issuer || claims.gty !== 'client_credentials') {
    throw new Error('Invalid machine token issuer');
  }

  if (config.audience && claims.aud !== config.audience) {
    throw new Error('Invalid machine token audience');
  }

  if (!secureEqual(createSignature(signingInput, config.secret), signature)) {
    throw new Error('Invalid machine token signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp !== undefined && (!Number.isInteger(claims.exp) || claims.exp <= now)) {
    throw new Error('Machine token expired');
  }
  if (!Number.isInteger(claims.iat) || claims.iat > now + 60) {
    throw new Error('Machine token issued in the future');
  }
  if (typeof claims.clientId !== 'string' || !claims.clientId) {
    throw new Error('Machine token missing clientId');
  }

  const client = config.clients.get(claims.clientId);
  if (!client) {
    throw new Error('Unknown machine client');
  }
  if (claims.sub !== client.subject || claims.tenantId !== client.tenantId) {
    throw new Error('Machine token claims mismatch');
  }

  return {
    uid: client.subject,
    email: client.email,
    tenantId: client.tenantId,
    role: client.role,
    authType: 'm2m',
    clientId: client.clientId,
  };
}

export function validateMachineAuthConfig(): void {
  void getMachineAuthConfig();
}

export function issueMachineToken(clientId: string, clientSecret: string): MachineTokenResponse {
  const config = getMachineAuthConfig();
  if (!config) {
    throw new MachineAuthError(
      503,
      'server_error',
      'Machine-to-machine auth is not configured on this server',
    );
  }

  const client = config.clients.get(clientId);
  if (!client || !secureEqual(client.clientSecret, clientSecret)) {
    throw new MachineAuthError(401, 'invalid_client', 'Invalid client credentials');
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: MachineTokenClaims = {
    iss: config.issuer,
    sub: client.subject,
    iat: now,
    jti: randomUUID(),
    gty: 'client_credentials',
    clientId: client.clientId,
    tenantId: client.tenantId,
    role: client.role,
    ...(config.ttlSeconds !== null ? { exp: now + config.ttlSeconds } : {}),
    ...(config.audience ? { aud: config.audience } : {}),
    ...(client.email ? { email: client.email } : {}),
  };

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const headerPart = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadPart = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${headerPart}.${payloadPart}`;
  const accessToken = `${signingInput}.${createSignature(signingInput, config.secret)}`;

  const response: MachineTokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
  };
  if (config.ttlSeconds !== null) {
    response.expires_in = config.ttlSeconds;
  }

  return response;
}

export async function verifyToken(bearerToken: string): Promise<AuthUser> {
  const token = normalizeBearerToken(bearerToken);

  if (looksLikeMachineToken(token)) {
    return verifyMachineToken(token);
  }

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
    authType: 'firebase',
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

export async function deleteUser(uid: string): Promise<void> {
  await adminAuth.deleteUser(uid);
}
