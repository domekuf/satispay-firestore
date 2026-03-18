import crypto from 'crypto';
import type { CreatePaymentResponse, Payment } from '@muvat/shared';

const SATISPAY_API = '/g_business/v1';
const SATISPAY_ENV = process.env.SATISPAY_ENV === 'sandbox' ? 'sandbox' : 'production';
const SATISPAY_HOST = process.env.SATISPAY_HOST
  ?? (SATISPAY_ENV === 'sandbox' ? 'staging.authservices.satispay.com' : 'authservices.satispay.com');
const SATISPAY_BASE = `https://${SATISPAY_HOST}`;

const EMPTY_DIGEST = `SHA-256=${crypto.createHash('sha256').update('').digest('base64')}`;

export interface SatispayKeys {
  keyId: string;
  privateKey: string;
}

export interface RegisteredInstance {
  keyId: string;
  privateKey: string; // PEM — must be encrypted before storage
  publicKey: string;  // PEM
}

interface SatispayErrorBody {
  code?: number;
  message?: string;
  wlt?: string;
}

export class SatispayApiError extends Error {
  status: number;
  code?: number;
  wlt?: string;
  responseBody?: string;

  constructor(status: number, responseBody: string, payload?: SatispayErrorBody) {
    const details = payload?.message ?? responseBody;
    const code = payload?.code ? ` code ${payload.code}` : '';
    const wlt = payload?.wlt ? `, wlt ${payload.wlt}` : '';
    super(`Satispay API error ${status}:${code} ${details}${wlt}`.trim());
    this.name = 'SatispayApiError';
    this.status = status;
    this.code = payload?.code;
    this.wlt = payload?.wlt;
    this.responseBody = responseBody;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sign(signingString: string, privateKey: string): string {
  return crypto.createSign('RSA-SHA256').update(signingString).sign(privateKey, 'base64');
}

function authHeader(keyId: string, signature: string): string {
  return `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="(request-target) host date digest", signature="${signature}"`;
}

function buildGetHeaders(path: string, digest: string, date: string, keys: SatispayKeys): Record<string, string> {
  const signingString = [
    `(request-target): get ${path}`,
    `host: ${SATISPAY_HOST}`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n');

  return {
    accept: 'application/json',
    host: SATISPAY_HOST,
    date,
    digest,
    authorization: authHeader(keys.keyId, sign(signingString, keys.privateKey)),
  };
}

function buildPostHeaders(path: string, bodyStr: string, date: string, keys: SatispayKeys): Record<string, string> {
  const digest = `SHA-256=${crypto.createHash('sha256').update(bodyStr).digest('base64')}`;
  const signingString = [
    `(request-target): post ${path}`,
    `host: ${SATISPAY_HOST}`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n');

  return {
    accept: 'application/json',
    host: SATISPAY_HOST,
    'Content-Type': 'application/json',
    Date: date,
    Digest: digest,
    authorization: authHeader(keys.keyId, sign(signingString, keys.privateKey)),
  };
}

async function satispayFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    let payload: SatispayErrorBody | undefined;
    try {
      payload = JSON.parse(text) as SatispayErrorBody;
    } catch {
      payload = undefined;
    }
    throw new SatispayApiError(res.status, text, payload);
  }
  return JSON.parse(text) as T;
}

export function getSatispayHost(): string {
  return SATISPAY_HOST;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function registerInstance(activationCode: string): Promise<RegisteredInstance> {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const result = await satispayFetch<{ key_id: string }>(
    `${SATISPAY_BASE}${SATISPAY_API}/authentication_keys`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: publicKey, token: activationCode.trim().toUpperCase() }),
    },
  );

  return { keyId: result.key_id, privateKey, publicKey };
}

export type CreatePaymentResult = CreatePaymentResponse;
export type SatispayPayment = Pick<Payment, 'id' | 'status'> & Record<string, unknown>;

interface SatispayConsumer {
  id: string;
}

async function retrieveConsumer(
  phoneNumber: string,
  keys: SatispayKeys,
): Promise<SatispayConsumer> {
  const normalizedPhoneNumber = phoneNumber.trim();
  const path = `${SATISPAY_API}/consumers/${encodeURIComponent(normalizedPhoneNumber)}`;
  const date = new Date().toUTCString();
  const headers = buildGetHeaders(path, EMPTY_DIGEST, date, keys);
  return satispayFetch<SatispayConsumer>(
    `${SATISPAY_BASE}${path}`,
    { method: 'GET', headers },
  );
}

export async function createPayment(
  orderId: string,
  price: number,
  phoneNumber: string,
  callbackUrl: string,
  keys: SatispayKeys,
): Promise<CreatePaymentResult> {
  const consumer = await retrieveConsumer(phoneNumber, keys);
  const path = `${SATISPAY_API}/payments`;
  const date = new Date().toUTCString();
  const body = {
    flow: 'MATCH_USER',
    amount_unit: price,
    currency: 'EUR',
    consumer_uid: consumer.id,
    external_code: orderId,
    callback_url: callbackUrl,
    metadata: { orderId },
  };
  const bodyStr = JSON.stringify(body);
  const headers = buildPostHeaders(path, bodyStr, date, keys);

  const result = await satispayFetch<{ id: string }>(
    `${SATISPAY_BASE}${path}`,
    { method: 'POST', headers, body: bodyStr },
  );
  return { paymentId: result.id };
}

export async function getPayment(
  paymentId: string,
  keys: SatispayKeys,
): Promise<SatispayPayment> {
  const path = `${SATISPAY_API}/payments/${paymentId}`;
  const date = new Date().toUTCString();
  const headers = buildGetHeaders(path, EMPTY_DIGEST, date, keys);
  return satispayFetch<SatispayPayment>(
    `${SATISPAY_BASE}${path}`,
    { method: 'GET', headers },
  );
}
