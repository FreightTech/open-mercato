/** @jest-environment node */
import { generateKeyPairSync, privateDecrypt, constants } from 'crypto'
import { KsefCryptoService } from '../crypto.service'

describe('KsefCryptoService', () => {
  let service: KsefCryptoService
  let publicKeyPem: string
  let privateKeyPem: string

  beforeAll(() => {
    service = new KsefCryptoService()
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    publicKeyPem = pair.publicKey
    privateKeyPem = pair.privateKey
  })

  describe('generateAesKeyPair', () => {
    it('returns correct key sizes', () => {
      const { key, iv } = service.generateAesKeyPair()
      expect(key.length).toBe(32)
      expect(iv.length).toBe(16)
    })
  })

  describe('encryptAes256Cbc', () => {
    it('encrypts data that can be decrypted', () => {
      const { key, iv } = service.generateAesKeyPair()
      const plaintext = '<Faktura>Spółka żółw</Faktura>'
      const encrypted = service.encryptAes256Cbc(plaintext, key, iv)

      expect(encrypted).toBeInstanceOf(Buffer)
      expect(encrypted.length).toBeGreaterThan(0)

      const { decryptAes256Cbc } = require('../../../lib/ksef/crypto')
      const decrypted = decryptAes256Cbc(encrypted, key, iv)
      expect(decrypted).toBe(plaintext)
    })
  })

  describe('wrapKeyRsaOaep', () => {
    it('wraps AES key with RSA public key, unwrappable with private key', () => {
      const aesKey = service.generateAesKeyPair().key
      const wrapped = service.wrapKeyRsaOaep(aesKey, publicKeyPem)

      expect(wrapped).toBeInstanceOf(Buffer)
      expect(wrapped.length).toBe(256) // 2048-bit RSA

      const unwrapped = privateDecrypt(
        { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        wrapped
      )
      expect(unwrapped.equals(aesKey)).toBe(true)
    })
  })

  describe('sha256Hash', () => {
    it('produces base64-encoded SHA-256', () => {
      const hash = service.sha256Hash('test')
      expect(typeof hash).toBe('string')
      expect(Buffer.from(hash, 'base64').length).toBe(32)
    })

    it('is deterministic', () => {
      expect(service.sha256Hash('abc')).toBe(service.sha256Hash('abc'))
    })
  })

  describe('sha256HashBytes', () => {
    it('returns 32-byte buffer', () => {
      const hashBytes = service.sha256HashBytes('test')
      expect(hashBytes).toBeInstanceOf(Buffer)
      expect(hashBytes.length).toBe(32)
    })
  })

  describe('encryptInvoiceXml', () => {
    it('encrypts XML with a new AES key wrapped by RSA public key', () => {
      const xml = '<?xml version="1.0"?><Faktura><Fa>content</Fa></Faktura>'
      const result = service.encryptInvoiceXml(xml, publicKeyPem)

      expect(result.encryptedPayload).toBeInstanceOf(Buffer)
      expect(result.encryptedKey).toBeInstanceOf(Buffer)
      expect(result.iv).toBeInstanceOf(Buffer)
      expect(result.encryptedKey.length).toBe(256)
      expect(result.iv.length).toBe(16)

      // Unwrap AES key with RSA private key
      const aesKey = privateDecrypt(
        { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        result.encryptedKey
      )
      expect(aesKey.length).toBe(32)

      // Decrypt invoice with unwrapped AES key
      const { decryptAes256Cbc } = require('../../../lib/ksef/crypto')
      const decrypted = decryptAes256Cbc(result.encryptedPayload, aesKey, result.iv)
      expect(decrypted).toBe(xml)
    })
  })

  describe('computeInvoiceHash', () => {
    it('returns SHA-256 hash and file size', () => {
      const xml = '<Faktura>test</Faktura>'
      const result = service.computeInvoiceHash(xml)

      expect(result.hashSHA.algorithm).toBe('SHA-256')
      expect(result.hashSHA.encoding).toBe('Base64')
      expect(typeof result.hashSHA.value).toBe('string')
      expect(result.fileSize).toBe(Buffer.from(xml, 'utf8').length)
    })
  })

  describe('signChallenge', () => {
    it('signs challenge data with RSA-SHA256', () => {
      const challenge = 'test-challenge-value'
      const timestamp = '2026-03-22T12:00:00'

      const signature = service.signChallenge(challenge, timestamp, privateKeyPem)

      expect(typeof signature).toBe('string')
      const sigBuffer = Buffer.from(signature, 'base64')
      expect(sigBuffer.length).toBeGreaterThan(0)

      // Verify the signature
      const { createVerify } = require('crypto')
      const verify = createVerify('SHA256')
      verify.update(`${timestamp}|${challenge}`)
      verify.end()
      const valid = verify.verify(publicKeyPem, sigBuffer)
      expect(valid).toBe(true)
    })

    it('fails verification with wrong data', () => {
      const signature = service.signChallenge('challenge', '2026-03-22T12:00:00', privateKeyPem)
      const sigBuffer = Buffer.from(signature, 'base64')

      const { createVerify } = require('crypto')
      const verify = createVerify('SHA256')
      verify.update('wrong-data')
      verify.end()
      const valid = verify.verify(publicKeyPem, sigBuffer)
      expect(valid).toBe(false)
    })
  })

  describe('encodeInvoicePayload', () => {
    it('base64-encodes XML', () => {
      const xml = '<Faktura>test</Faktura>'
      const encoded = service.encodeInvoicePayload(xml)

      expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(xml)
    })
  })
})
