/** @jest-environment node */
import { randomBytes, generateKeyPairSync } from 'crypto'
import {
  encryptAes256Cbc,
  decryptAes256Cbc,
  sha256Hash,
  sha256HashBase64,
  generateAesKeyPair,
  wrapKeyRsaOaep,
  encryptTokenForKsef,
  prepareInvoiceForSubmission,
} from '../crypto'

describe('KSeF crypto', () => {
  describe('AES-256-CBC', () => {
    it('encrypts and decrypts a string round-trip', () => {
      const { key, iv } = generateAesKeyPair()
      const plaintext = '<Faktura>test invoice XML</Faktura>'

      const ciphertext = encryptAes256Cbc(plaintext, key, iv)

      expect(ciphertext).toBeInstanceOf(Buffer)
      expect(ciphertext.length).toBeGreaterThan(0)
      expect(ciphertext.toString('utf8')).not.toBe(plaintext)

      const decrypted = decryptAes256Cbc(ciphertext, key, iv)
      expect(decrypted).toBe(plaintext)
    })

    it('produces different ciphertext for different keys', () => {
      const iv = randomBytes(16)
      const key1 = randomBytes(32)
      const key2 = randomBytes(32)
      const plaintext = 'test data'

      const ct1 = encryptAes256Cbc(plaintext, key1, iv)
      const ct2 = encryptAes256Cbc(plaintext, key2, iv)

      expect(ct1.equals(ct2)).toBe(false)
    })

    it('fails to decrypt with wrong key', () => {
      const { key, iv } = generateAesKeyPair()
      const wrongKey = randomBytes(32)
      const ciphertext = encryptAes256Cbc('secret', key, iv)

      expect(() => decryptAes256Cbc(ciphertext, wrongKey, iv)).toThrow()
    })
  })

  describe('SHA-256', () => {
    it('produces consistent hex hash', () => {
      const hash1 = sha256Hash('test')
      const hash2 = sha256Hash('test')

      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces consistent base64 hash', () => {
      const hash = sha256HashBase64('test')

      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
      expect(Buffer.from(hash, 'base64').length).toBe(32)
    })

    it('produces different hashes for different inputs', () => {
      expect(sha256Hash('a')).not.toBe(sha256Hash('b'))
    })
  })

  describe('generateAesKeyPair', () => {
    it('generates 32-byte key and 16-byte IV', () => {
      const { key, iv } = generateAesKeyPair()

      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
      expect(iv).toBeInstanceOf(Buffer)
      expect(iv.length).toBe(16)
    })

    it('generates unique keys each time', () => {
      const pair1 = generateAesKeyPair()
      const pair2 = generateAesKeyPair()

      expect(pair1.key.equals(pair2.key)).toBe(false)
    })
  })

  describe('RSA-OAEP key wrapping', () => {
    let publicKeyPem: string
    let privateKeyPem: string

    beforeAll(() => {
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      publicKeyPem = pair.publicKey
      privateKeyPem = pair.privateKey
    })

    it('wraps an AES key with RSA public key', () => {
      const aesKey = randomBytes(32)
      const wrapped = wrapKeyRsaOaep(aesKey, publicKeyPem)

      expect(wrapped).toBeInstanceOf(Buffer)
      expect(wrapped.length).toBe(256) // 2048-bit RSA = 256-byte output
    })

    it('can be unwrapped with the private key', () => {
      const { privateDecrypt, constants } = require('crypto')
      const aesKey = randomBytes(32)
      const wrapped = wrapKeyRsaOaep(aesKey, publicKeyPem)

      const unwrapped = privateDecrypt(
        { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        wrapped
      )

      expect(unwrapped.equals(aesKey)).toBe(true)
    })
  })

  describe('encryptTokenForKsef', () => {
    let publicKeyPem: string

    beforeAll(() => {
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      publicKeyPem = pair.publicKey
    })

    it('produces a base64-encoded encrypted payload', () => {
      const result = encryptTokenForKsef('my-ksef-token', '2026-03-22T12:00:00', publicKeyPem)

      expect(typeof result).toBe('string')
      const decoded = Buffer.from(result, 'base64')
      // Direct RSA-OAEP encryption: output is exactly 256 bytes for a 2048-bit key
      expect(decoded.length).toBe(256)
    })
  })

  describe('prepareInvoiceForSubmission', () => {
    const sampleXml = '<?xml version="1.0"?><Faktura><Naglowek>test</Naglowek></Faktura>'

    it('returns base64 plaintext when no encryption keys', () => {
      const result = prepareInvoiceForSubmission(sampleXml)

      expect(result.encrypted).toBe(false)
      expect(result.fileSize).toBe(Buffer.from(sampleXml, 'utf8').length)
      expect(result.hashValue).toBe(sha256HashBase64(Buffer.from(sampleXml, 'utf8')))

      const decoded = Buffer.from(result.invoiceBody, 'base64').toString('utf8')
      expect(decoded).toBe(sampleXml)
    })

    it('returns encrypted payload when encryption keys provided', () => {
      const { key, iv } = generateAesKeyPair()

      const result = prepareInvoiceForSubmission(sampleXml, key, iv)

      expect(result.encrypted).toBe(true)
      expect(result.fileSize).toBe(Buffer.from(sampleXml, 'utf8').length)

      const encryptedBody = Buffer.from(result.invoiceBody, 'base64')
      const decrypted = decryptAes256Cbc(encryptedBody, key, iv)
      expect(decrypted).toBe(sampleXml)
    })

    it('hash is the same regardless of encryption', () => {
      const { key, iv } = generateAesKeyPair()

      const plain = prepareInvoiceForSubmission(sampleXml)
      const encrypted = prepareInvoiceForSubmission(sampleXml, key, iv)

      expect(plain.hashValue).toBe(encrypted.hashValue)
      expect(plain.fileSize).toBe(encrypted.fileSize)
    })

    it('handles unicode XML content', () => {
      const unicodeXml = '<Faktura><Nazwa>Spółka z o.o. "Ćma & Żółw"</Nazwa></Faktura>'
      const result = prepareInvoiceForSubmission(unicodeXml)

      const decoded = Buffer.from(result.invoiceBody, 'base64').toString('utf8')
      expect(decoded).toBe(unicodeXml)
      expect(result.fileSize).toBe(Buffer.from(unicodeXml, 'utf8').length)
    })
  })
})
