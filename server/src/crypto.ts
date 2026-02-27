import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(rawKey: string): Buffer {
  return crypto.scryptSync(rawKey, "ducktape-salt", 32);
}

export function encryptApiKey(
  plaintext: string,
  encryptionKey: string
): { encrypted: string; iv: string } {
  const key = deriveKey(encryptionKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();
  // Append auth tag to encrypted data
  encrypted += authTag.toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
  };
}

export function decryptApiKey(
  encrypted: string,
  iv: string,
  encryptionKey: string
): string {
  const key = deriveKey(encryptionKey);
  const ivBuffer = Buffer.from(iv, "hex");

  // Split encrypted data and auth tag
  const authTagHex = encrypted.slice(-AUTH_TAG_LENGTH * 2);
  const encryptedData = encrypted.slice(0, -AUTH_TAG_LENGTH * 2);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
