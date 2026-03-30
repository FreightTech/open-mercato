import { createCipheriv, createHash, createSign, publicEncrypt, randomBytes, constants } from 'node:crypto'

export class KsefCryptoService {
  generateAesKeyPair(): { key: Buffer; iv: Buffer } {
    return {
      key: randomBytes(32),
      iv: randomBytes(16),
    }
  }

  encryptAes256Cbc(plaintext: string, key: Buffer, iv: Buffer): Buffer {
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    return encrypted
  }

  wrapKeyRsaOaep(aesKey: Buffer, publicKeyPem: string): Buffer {
    return publicEncrypt(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    )
  }

  sha256Hash(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('base64')
  }

  sha256HashBytes(data: string): Buffer {
    return createHash('sha256').update(data, 'utf8').digest()
  }

  encryptInvoiceXml(
    xml: string,
    ksefPublicKeyPem: string
  ): {
    encryptedPayload: Buffer
    encryptedKey: Buffer
    iv: Buffer
  } {
    const { key, iv } = this.generateAesKeyPair()
    const encryptedPayload = this.encryptAes256Cbc(xml, key, iv)
    const encryptedKey = this.wrapKeyRsaOaep(key, ksefPublicKeyPem)
    return { encryptedPayload, encryptedKey, iv }
  }

  hashInvoiceXml(xml: string): string {
    return this.sha256Hash(xml)
  }

  computeInvoiceHash(xml: string): {
    hashSHA: {
      algorithm: string
      encoding: string
      value: string
    }
    fileSize: number
  } {
    const xmlBytes = Buffer.from(xml, 'utf8')
    return {
      hashSHA: {
        algorithm: 'SHA-256',
        encoding: 'Base64',
        value: this.sha256Hash(xml),
      },
      fileSize: xmlBytes.length,
    }
  }

  signChallenge(
    challenge: string,
    timestamp: string,
    privateKeyPem: string
  ): string {
    const dataToSign = `${timestamp}|${challenge}`
    const sign = createSign('SHA256')
    sign.update(dataToSign)
    sign.end()
    const signature = sign.sign(privateKeyPem)
    return signature.toString('base64')
  }

  encodeInvoicePayload(xml: string): string {
    return Buffer.from(xml, 'utf8').toString('base64')
  }
}
