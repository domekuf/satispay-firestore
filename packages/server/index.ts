import Fastify from 'fastify';
import fastifyWebsocket, { WebSocket } from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { createPayment, getPayment, SatispayApiError } from './satispay';
import { verifyToken, setUserClaims } from './auth';
import { validateEncryptionConfig } from './crypto';
import instancesPlugin, { InstanceKeyDecryptError, loadInstanceKeys } from './routes/instances';
import authPlugin from './routes/auth';
import { getAdminDb } from './firebase-admin';
import type { AuthUser, CreatePaymentRequest, TenantRole } from '@muvat/shared';

// ─── Fastify type augmentation ───────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

// ─── App setup ───────────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: true,
  routerOptions: {
    // Satispay key IDs are used as instance IDs and can exceed the router default of 100 chars.
    maxParamLength: 1024,
  },
});
fastify.register(fastifyWebsocket);
fastify.register(fastifyCors);

const apiEndpoint = process.env.API_ENDPOINT ?? 'payment';
const host = process.env.HOST ?? '0.0.0.0';
const port = parseInt(process.env.PORT ?? '3000', 10);
const secret = process.env.SATISPAY_SECRET ?? 'XYZ';
const location = process.env.LOCATION;

validateEncryptionConfig();

const db = getAdminDb();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paymentDoc(tenantId: string, paymentId: string) {
  return db.collection('tenants').doc(tenantId).collection('payments').doc(paymentId);
}

function mapInstanceKeyError(reply: import('fastify').FastifyReply, error: unknown): boolean {
  if (!(error instanceof InstanceKeyDecryptError)) return false;
  reply.status(409).send({
    error: `Le credenziali dell'istanza non sono decifrabili con la ENCRYPTION_KEY corrente. Se hai cambiato chiave, reimposta la precedente in ENCRYPTION_KEY oppure ENCRYPTION_KEY_PREVIOUS, oppure ricrea l'istanza ${error.instanceId}.`,
  });
  return true;
}

function mapSatispayRequestError(reply: import('fastify').FastifyReply, error: unknown): boolean {
  if (!(error instanceof SatispayApiError)) return false;
  const currentEnv = process.env.SATISPAY_ENV === 'sandbox' ? 'sandbox' : 'production';
  if (error.status === 404 && error.code === 41) {
    reply.status(400).send({
      error: `Satispay non ha trovato la risorsa richiesta. Nel flusso pagamento via telefono questo di solito significa che il numero non corrisponde a un utente Satispay nell'ambiente corrente (${currentEnv}). Riferimento Satispay: ${error.wlt ?? 'n/d'}.`,
    });
    return true;
  }
  if (error.status === 401 && error.code === 34) {
    reply.status(400).send({
      error: `Satispay ha rifiutato l'autenticazione della richiesta. Molto spesso significa che stai usando credenziali ${currentEnv} contro l'host sbagliato, oppure viceversa. Verifica SATISPAY_ENV e riavvia il server. Riferimento Satispay: ${error.wlt ?? 'n/d'}.`,
    });
    return true;
  }
  if (error.status === 403 && error.code === 45) {
    reply.status(400).send({
      error: `Satispay ha rifiutato la richiesta. Verifica che l'istanza e il numero di telefono appartengano allo stesso ambiente (${currentEnv}). Riferimento Satispay: ${error.wlt ?? 'n/d'}.`,
    });
    return true;
  }
  reply.status(502).send({
    error: `Errore Satispay (${error.status}). ${error.message}`,
  });
  return true;
}

// ─── Auth hook ───────────────────────────────────────────────────────────────

async function authenticate(
  request: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
) {
  const auth = request.headers.authorization;
  if (!auth) {
    return reply.status(401).send({ error: 'Missing Authorization header' });
  }
  try {
    request.user = await verifyToken(auth);
  } catch (err) {
    fastify.log.warn(err, 'Auth failed');
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

// ─── Public auth routes (no auth required) ───────────────────────────────────

fastify.register(authPlugin);

// ─── Instance routes (behind auth) ───────────────────────────────────────────

fastify.register(async (app) => {
  app.addHook('preHandler', authenticate);
  app.register(instancesPlugin);
});

// ─── WebSocket: real-time payment status ─────────────────────────────────────

fastify.register(async (instance) => {
  instance.get(
    `/${apiEndpoint}/:instanceId/:paymentId/ws`,
    { websocket: true },
    (socket: WebSocket, request) => {
      const { paymentId } = request.params as { instanceId: string; paymentId: string };
      const token = (request.query as Record<string, string>)['token'];
      if (!token) { socket.close(); return; }

      verifyToken(token).then((user) => {
        const unsub = paymentDoc(user.tenantId, paymentId).onSnapshot((snapshot) => {
          const data = snapshot.data();
          socket.send(JSON.stringify(data));
          if (data?.['status'] === 'ACCEPTED') {
            socket.close();
          }
        });
        socket.on('close', () => unsub());
      }).catch(() => socket.close());
    },
  );
});

// ─── Payment routes ───────────────────────────────────────────────────────────

fastify.post(`/${apiEndpoint}/:instanceId`, { preHandler: authenticate }, async (request, reply) => {
  const { instanceId } = request.params as { instanceId: string };
  const body = request.body as CreatePaymentRequest;
  if (!body?.orderId || !body?.phoneNumber || !body?.price) {
    return reply.status(400).send({ error: 'Missing required fields: orderId, phoneNumber, price' });
  }

  const { orderId, phoneNumber, price } = body;
  const { tenantId } = request.user;

  let keys;
  try {
    keys = await loadInstanceKeys(tenantId, instanceId);
  } catch (error) {
    if (mapInstanceKeyError(reply, error)) return;
    throw error;
  }
  const payment = await createPayment(
    orderId, price, phoneNumber,
    `${location}/${secret}/${tenantId}/${instanceId}/{uuid}`,
    keys,
  ).catch((error) => {
    if (mapSatispayRequestError(reply, error)) return null;
    throw error;
  });
  if (!payment) return;

  await paymentDoc(tenantId, payment.paymentId).set({
    id: payment.paymentId,
    orderId,
    phoneNumber,
    tenantId,
    instanceId,
    status: 'PENDING',
    amountUnit: price,
    currency: 'EUR',
    createdAt: new Date().toISOString(),
  });

  return reply.send(payment);
});

fastify.get(`/${apiEndpoint}/:instanceId/:paymentId`, { preHandler: authenticate }, async (request, reply) => {
  const { instanceId, paymentId } = request.params as { instanceId: string; paymentId: string };
  const { tenantId } = request.user;
  const snapshot = await paymentDoc(tenantId, paymentId).get();
  const data = snapshot.data();
  if (!data) return reply.status(404).send({ error: 'Payment not found' });
  if (data['instanceId'] !== instanceId) return reply.status(404).send({ error: 'Payment not found' });
  return reply.send({ id: paymentId, ...data });
});

// ─── Satispay callback ────────────────────────────────────────────────────────

fastify.get(`/${secret}/:tenantId/:instanceId/:paymentId`, async (request, reply) => {
  const { tenantId, instanceId, paymentId } = request.params as {
    tenantId: string;
    instanceId: string;
    paymentId: string;
  };
  try {
    const keys = await loadInstanceKeys(tenantId, instanceId);
    const payment = await getPayment(paymentId, keys);
    await paymentDoc(tenantId, paymentId).update({
      updatedAt: new Date().toISOString(),
      status: payment.status,
    });
    return reply.send();
  } catch (error) {
    if (mapInstanceKeyError(reply, error)) return;
    if (mapSatispayRequestError(reply, error)) return;
    return reply.status(404).send(error);
  }
});

// ─── Admin: assign claims ─────────────────────────────────────────────────────

fastify.post('/admin/users/:uid/claims', { preHandler: authenticate }, async (request, reply) => {
  if (request.user.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }
  const { uid } = request.params as { uid: string };
  const { tenantId, role } = request.body as { tenantId: string; role: TenantRole };
  if (!tenantId || !role) {
    return reply.status(400).send({ error: 'Missing tenantId or role' });
  }
  await setUserClaims(uid, tenantId, role);
  return reply.send({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

fastify.listen({ port, host }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
