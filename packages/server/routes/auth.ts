import type { FastifyPluginAsync } from 'fastify';
import { createUser, deleteUser, issueMachineToken, MachineAuthError, setUserClaims } from '../auth';
import { getAdminDb } from '../firebase-admin';
import type { MachineTokenRequest, RegisterRequest, RegisterResponse } from '@muvat/shared';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isFirestoreDatabaseMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && error.code === 5;
}

function parseBasicCredentials(authorizationHeader: string | undefined): {
  clientId: string;
  clientSecret: string;
} | null {
  if (!authorizationHeader?.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) return null;
    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      const params = new URLSearchParams(typeof body === 'string' ? body : body.toString('utf8'));
      const parsed: Record<string, string> = {};
      params.forEach((value, key) => {
        parsed[key] = value;
      });
      done(null, parsed);
    },
  );

  fastify.post('/auth/m2m/token', async (request, reply) => {
    const body = request.body as MachineTokenRequest | undefined;
    const basicCredentials = parseBasicCredentials(request.headers.authorization);
    const grantType = body?.grantType ?? body?.grant_type ?? 'client_credentials';

    if (grantType !== 'client_credentials') {
      return reply.status(400).send({
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant type is supported',
      });
    }

    const clientId = basicCredentials?.clientId ?? body?.clientId;
    const clientSecret = basicCredentials?.clientSecret ?? body?.clientSecret;
    if (!clientId || !clientSecret) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing clientId or clientSecret',
      });
    }

    try {
      const response = issueMachineToken(clientId, clientSecret);
      reply.header('Cache-Control', 'no-store');
      reply.header('Pragma', 'no-cache');
      return reply.send(response);
    } catch (error) {
      if (error instanceof MachineAuthError) {
        if (error.statusCode === 401) {
          reply.header('WWW-Authenticate', 'Basic realm="m2m"');
        }
        return reply.status(error.statusCode).send({
          error: error.code,
          error_description: error.message,
        });
      }
      throw error;
    }
  });

  fastify.post('/auth/register', async (request, reply) => {
    const body = request.body as RegisterRequest;
    const { email, password, tenantName } = body ?? {};
    if (!email || !password || !tenantName) {
      return reply.status(400).send({ error: 'Missing required fields: email, password, tenantName' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }
    const tenantId = slugify(tenantName) + '-' + Date.now();
    const createdAt = new Date().toISOString();
    const db = getAdminDb();
    const tenantDoc = db.collection('tenants').doc(tenantId);
    let uid: string | null = null;
    let tenantCreated = false;

    try {
      uid = await createUser(email, password);
      await tenantDoc.set({
        id: tenantId,
        name: tenantName,
        slug: slugify(tenantName),
        createdAt,
        ownerUid: uid,
      });
      tenantCreated = true;
      await setUserClaims(uid, tenantId, 'admin');
      const response: RegisterResponse = { uid, tenantId };
      return reply.status(201).send(response);
    } catch (error) {
      if (tenantCreated) {
        try {
          await tenantDoc.delete();
        } catch (cleanupError) {
          fastify.log.warn({ err: cleanupError, tenantId }, 'Failed to rollback tenant after register error');
        }
      }

      if (uid) {
        try {
          await deleteUser(uid);
        } catch (cleanupError) {
          fastify.log.warn({ err: cleanupError, uid }, 'Failed to rollback auth user after register error');
        }
      }

      fastify.log.error({ err: error, tenantId, uid }, 'Registration failed');

      if (isFirestoreDatabaseMissing(error)) {
        return reply.status(503).send({
          error: 'Firestore non e ancora configurato per questo progetto. Crea il database Firestore in modalita Native e riprova.',
        });
      }

      throw error;
    }
  });
};

export default authPlugin;
