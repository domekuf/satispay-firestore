import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars
const KEY_HEX_REGEX = /^[0-9a-fA-F]{64}$/;

export class EncryptionKeyMismatchError extends Error {
  constructor() {
    super('Stored data cannot be decrypted with the configured encryption key(s)');
    this.name = 'EncryptionKeyMismatchError';
  }
}

function parseKey(hex: string | undefined, envName: string): Buffer {
  if (!hex || !KEY_HEX_REGEX.test(hex) || hex.length !== KEY_HEX_LENGTH) {
    throw new Error(`${envName} must be a ${KEY_HEX_LENGTH}-char hex string`);
  }
  return Buffer.from(hex, 'hex');
}

function getKey(): Buffer {
  return parseKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
}

function getDecryptionKeys(): Buffer[] {
  const keys = [getKey()];
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (previous && previous !== process.env.ENCRYPTION_KEY) {
    keys.push(parseKey(previous, 'ENCRYPTION_KEY_PREVIOUS'));
  }
  return keys;
}

export function validateEncryptionConfig(): void {
  getKey();
  if (process.env.ENCRYPTION_KEY_PREVIOUS) {
    parseKey(process.env.ENCRYPTION_KEY_PREVIOUS, 'ENCRYPTION_KEY_PREVIOUS');
  }
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  for (const key of getDecryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(data) + decipher.final('utf8');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('authenticate data')) {
        throw error;
      }
    }
  }

  throw new EncryptionKeyMismatchError();
}
