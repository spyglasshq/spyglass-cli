import {webcrypto} from 'node:crypto'

export async function sha256(obj: unknown): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(obj))
  const hash = await webcrypto.subtle.digest('SHA-256', data)
  const hashArray = [...new Uint8Array(hash)]
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function randomId(): Promise<string> {
  const uuid = webcrypto.randomUUID()
  return sha256({uuid})
}
