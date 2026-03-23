import { generateKeyPairSync, createSign, createVerify } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

const FIXTURES_DIR = dirname(new URL(import.meta.url).pathname)
const CERT_PATH = resolve(FIXTURES_DIR, 'ksef-test-cert.pem')
const KEY_PATH = resolve(FIXTURES_DIR, 'ksef-test-key.pem')

export function getTestKeyPair(): { publicKey: string; privateKey: string } {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return {
      publicKey: readFileSync(CERT_PATH, 'utf-8'),
      privateKey: readFileSync(KEY_PATH, 'utf-8'),
    }
  }

  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  writeFileSync(CERT_PATH, pair.publicKey)
  writeFileSync(KEY_PATH, pair.privateKey)

  return { publicKey: pair.publicKey, privateKey: pair.privateKey }
}

export function generateEphemeralKeyPair(): { publicKey: string; privateKey: string } {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey: pair.publicKey, privateKey: pair.privateKey }
}

export function signAndVerify(privateKey: string, publicKey: string, data: string): boolean {
  const sign = createSign('SHA256')
  sign.update(data)
  sign.end()
  const signature = sign.sign(privateKey)

  const verify = createVerify('SHA256')
  verify.update(data)
  verify.end()
  return verify.verify(publicKey, signature)
}
