// ─── Auth ─────────────────────────────────────────────────────────────────────

export type TenantRole = 'admin' | 'member';

/** Shape of custom claims embedded in Firebase ID tokens */
export interface TokenClaims {
  tenantId: string;
  role: TenantRole;
}

/** Decoded & verified user attached to every authenticated request */
export interface AuthUser {
  uid: string;
  email: string | undefined;
  tenantId: string;
  role: TenantRole;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

// ─── Satispay Instance ────────────────────────────────────────────────────────

export type InstanceCredentialsStatus = 'ok' | 'key_mismatch' | 'unavailable';

export interface SatispayInstance {
  id: string;
  tenantId: string;
  label: string;
  keyId: string;
  createdAt: string;
  credentialsStatus?: InstanceCredentialsStatus;
  credentialsError?: string;
}

export interface CreateInstanceRequest {
  label: string;
  activationCode: string;
}

export interface CreateInstanceResponse {
  id: string;
  label: string;
  keyId: string;
  createdAt: string;
}

// ─── Register ─────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  tenantName: string;
}

export interface RegisterResponse {
  uid: string;
  tenantId: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentStatus = 'PENDING' | 'ACCEPTED' | 'CANCELED' | 'EXPIRED';

export interface Payment {
  id: string;
  tenantId: string;
  instanceId: string;
  orderId: string;
  phoneNumber?: string;
  amountUnit: number;
  currency: 'EUR';
  status: PaymentStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CreatePaymentRequest {
  orderId: string;
  phoneNumber: string;
  price: number;
}

export interface CreatePaymentResponse {
  paymentId: string;
}
