import { createCipheriv, createDecipheriv, randomBytes, publicEncrypt, createHash, constants } from 'crypto'

export function encryptAes256Cbc(plaintext: string, key: Buffer, iv: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return encrypted
}

export function decryptAes256Cbc(ciphertext: Buffer, key: Buffer, iv: Buffer): string {
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

export function wrapKeyRsaOaep(aesKey: Buffer, publicKeyPem: string): Buffer {
  return publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey,
  )
}

export function sha256Hash(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function sha256HashBase64(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('base64')
}

export function generateAesKeyPair(): { key: Buffer; iv: Buffer } {
  return {
    key: randomBytes(32),
    iv: randomBytes(16),
  }
}

/**
 * Encrypt KSeF authorization token for /v2/auth/ksef-token endpoint.
 *
 * KSeF v2 spec: plaintext is `token|timestampMs` encrypted directly with RSA-OAEP (SHA-256).
 * No AES wrapping — the token+timestamp fits within RSA-2048 OAEP limits (~190 bytes).
 *
 * @param token - The KSeF authorization token
 * @param timestampMs - Unix timestamp in milliseconds (from challenge response)
 * @param publicKeyPem - PEM-encoded RSA public key (from KsefTokenEncryption certificate)
 */
export function encryptTokenForKsef(token: string, timestampMs: number, publicKeyPem: string): string {
  const plaintext = `${token}|${timestampMs}`
  const encrypted = publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(plaintext, 'utf8'),
  )
  return encrypted.toString('base64')
}

export function prepareInvoiceForSubmission(
  invoiceXml: string,
  sessionEncryptionKey?: Buffer,
  sessionEncryptionIv?: Buffer,
): {
  invoiceBody: string
  hashValue: string
  fileSize: number
  encrypted: boolean
} {
  const xmlBytes = Buffer.from(invoiceXml, 'utf8')
  const hashValue = sha256HashBase64(xmlBytes)
  const fileSize = xmlBytes.length

  if (sessionEncryptionKey && sessionEncryptionIv) {
    const encrypted = encryptAes256Cbc(invoiceXml, sessionEncryptionKey, sessionEncryptionIv)
    return {
      invoiceBody: encrypted.toString('base64'),
      hashValue,
      fileSize,
      encrypted: true,
    }
  }

  return {
    invoiceBody: Buffer.from(invoiceXml, 'utf8').toString('base64'),
    hashValue,
    fileSize,
    encrypted: false,
  }
}
