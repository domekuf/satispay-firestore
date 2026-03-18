import type { FastifyPluginAsync } from 'fastify';
import { createUser, setUserClaims } from '../auth';
import { getAdminDb } from '../firebase-admin';
import type { RegisterRequest, RegisterResponse } from '@muvat/shared';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
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
    const uid = await createUser(email, password);
    const db = getAdminDb();
    await db.collection('tenants').doc(tenantId).set({
      id: tenantId,
      name: tenantName,
      slug: slugify(tenantName),
      createdAt,
      ownerUid: uid,
    });
    await setUserClaims(uid, tenantId, 'admin');
    const response: RegisterResponse = { uid, tenantId };
    return reply.status(201).send(response);
  });
};

export default authPlugin;
