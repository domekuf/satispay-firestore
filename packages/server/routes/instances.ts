import type { FastifyPluginAsync } from 'fastify';
import { SatispayApiError, getSatispayHost, registerInstance, type SatispayKeys } from '../satispay';
import { EncryptionKeyMismatchError, encrypt, decrypt } from '../crypto';
import { getAdminDb } from '../firebase-admin';
import type { CreateInstanceRequest, CreateInstanceResponse, Payment, SatispayInstance } from '@muvat/shared';

function mapInstanceRegistrationError(error: unknown): { statusCode: number; message: string } | null {
  if (!(error instanceof SatispayApiError)) return null;
  if (error.status === 403 && error.code === 45) {
    const supportRef = error.wlt ? ` Riferimento Satispay: ${error.wlt}.` : '';
    return {
      statusCode: 400,
      message: `Satispay ha rifiutato il codice di attivazione. Di solito significa che il codice e gia stato usato oppure che stai usando l'ambiente sbagliato. Host corrente: ${getSatispayHost()}. Se stai usando sandbox imposta SATISPAY_ENV=sandbox.${supportRef}`,
    };
  }
  return {
    statusCode: 502,
    message: `Errore Satispay (${error.status}). ${error.message}`,
  };
}

export class InstanceKeyDecryptError extends Error {
  instanceId: string;

  constructor(instanceId: string) {
    super(`Instance ${instanceId} private key cannot be decrypted with the configured encryption key`);
    this.name = 'InstanceKeyDecryptError';
    this.instanceId = instanceId;
  }
}

export async function loadInstanceKeys(tenantId: string, instanceId: string): Promise<SatispayKeys> {
  const db = getAdminDb();
  const snap = await db.collection('tenants').doc(tenantId).collection('instances').doc(instanceId).get();
  if (!snap.exists) throw new Error(`Instance ${instanceId} not found`);
  const data = snap.data();
  if (!data) throw new Error(`Instance ${instanceId} has no data`);
  let privateKey: string;
  try {
    privateKey = decrypt(data['encryptedPrivateKey'] as string);
  } catch (error) {
    if (error instanceof EncryptionKeyMismatchError) {
      throw new InstanceKeyDecryptError(instanceId);
    }
    throw error;
  }
  return {
    keyId: data['keyId'] as string,
    privateKey,
  };
}

function mapInstance(tenantId: string, id: string, data: Record<string, unknown>): SatispayInstance {
  const encryptedPrivateKey = data['encryptedPrivateKey'];
  let credentialsStatus: SatispayInstance['credentialsStatus'] = 'unavailable';
  let credentialsError: string | undefined = 'Chiave privata mancante o non valida.';

  if (typeof encryptedPrivateKey === 'string' && encryptedPrivateKey.length > 0) {
    try {
      decrypt(encryptedPrivateKey);
      credentialsStatus = 'ok';
      credentialsError = undefined;
    } catch (error) {
      if (error instanceof EncryptionKeyMismatchError) {
        credentialsStatus = 'key_mismatch';
        credentialsError = 'La chiave privata non e decifrabile con la ENCRYPTION_KEY corrente.';
      }
    }
  }

  return {
    id,
    tenantId,
    label: String(data['label'] ?? ''),
    keyId: String(data['keyId'] ?? id),
    createdAt: String(data['createdAt'] ?? ''),
    credentialsStatus,
    credentialsError,
  };
}

function mapPayment(id: string, data: Record<string, unknown>): Payment {
  return {
    id,
    tenantId: String(data['tenantId'] ?? ''),
    instanceId: String(data['instanceId'] ?? ''),
    orderId: String(data['orderId'] ?? ''),
    phoneNumber: typeof data['phoneNumber'] === 'string' ? data['phoneNumber'] : undefined,
    amountUnit: Number(data['amountUnit'] ?? 0),
    currency: 'EUR',
    status: (data['status'] as Payment['status']) ?? 'PENDING',
    createdAt: String(data['createdAt'] ?? ''),
    updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : undefined,
  };
}

const instancesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/instances', async (request, reply) => {
    const { tenantId } = request.user;
    const db = getAdminDb();
    const snap = await db.collection('tenants').doc(tenantId).collection('instances').get();
    const instances = snap.docs.map((d) => mapInstance(tenantId, d.id, d.data() as Record<string, unknown>));
    return reply.send(instances);
  });

  fastify.get('/instances/:instanceId', async (request, reply) => {
    const { tenantId } = request.user;
    const { instanceId } = request.params as { instanceId: string };
    const db = getAdminDb();
    const snap = await db.collection('tenants').doc(tenantId).collection('instances').doc(instanceId).get();
    if (!snap.exists) return reply.status(404).send({ error: 'Instance not found' });
    return reply.send(mapInstance(tenantId, snap.id, snap.data() as Record<string, unknown>));
  });

  fastify.get('/instances/:instanceId/payments', async (request, reply) => {
    const { tenantId } = request.user;
    const { instanceId } = request.params as { instanceId: string };
    const db = getAdminDb();
    const snap = await db.collection('tenants').doc(tenantId).collection('payments').where('instanceId', '==', instanceId).get();
    const payments = snap.docs
      .map((d) => mapPayment(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return reply.send(payments);
  });

  fastify.post('/instances', async (request, reply) => {
    const { tenantId, role } = request.user;
    if (role !== 'admin') return reply.status(403).send({ error: 'Forbidden' });

    const body = request.body as CreateInstanceRequest;
    if (!body?.label || !body?.activationCode) {
      return reply.status(400).send({ error: 'Missing label or activationCode' });
    }

    const { label, activationCode } = body;
    let registered: Awaited<ReturnType<typeof registerInstance>>;
    try {
      registered = await registerInstance(activationCode);
    } catch (error) {
      const mapped = mapInstanceRegistrationError(error);
      if (!mapped) throw error;
      fastify.log.warn({ err: error }, 'Failed to register Satispay instance');
      return reply.status(mapped.statusCode).send({ error: mapped.message });
    }
    const encryptedPrivateKey = encrypt(registered.privateKey);
    const createdAt = new Date().toISOString();
    const id = registered.keyId;

    const db = getAdminDb();
    await db.collection('tenants').doc(tenantId).collection('instances').doc(id).set({
      id,
      label,
      keyId: registered.keyId,
      encryptedPrivateKey,
      createdAt,
    });

    const response: CreateInstanceResponse = { id, label, keyId: registered.keyId, createdAt };
    return reply.status(201).send(response);
  });

  fastify.delete('/instances/:instanceId', async (request, reply) => {
    const { tenantId, role } = request.user;
    if (role !== 'admin') return reply.status(403).send({ error: 'Forbidden' });

    const { instanceId } = request.params as { instanceId: string };
    const db = getAdminDb();
    await db.collection('tenants').doc(tenantId).collection('instances').doc(instanceId).delete();
    return reply.status(204).send();
  });
};

export default instancesPlugin;
