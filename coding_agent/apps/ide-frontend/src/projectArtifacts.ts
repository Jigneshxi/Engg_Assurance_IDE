export interface ExportFile { path: string; content: string }

export function normalizeExportFiles(files: ExportFile[]): ExportFile[] {
  const seen = new Set<string>()
  return files.flatMap(file => {
    const path = file.path.trim().replace(/\\/g, '/')
    if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.split('/').some(part => part === '..' || !part) || seen.has(path)) throw new Error(`Unsafe or duplicate export path: ${path}`)
    if (path.split('/').some(part => part === '.env' || part.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(part))) return []
    seen.add(path)
    return [{ path, content: file.content }]
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

function sha256BytesFallback(bytes: Uint8Array): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount))
  }
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  let i: number, j: number
  let result = ''
  const words: number[] = []
  const bitLength = bytes.length * 8
  let hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isComposite: Record<number, number> = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  hash = hash.slice(0, 8)

  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  for (i = 0; i < padded.length; i++) {
    words[i >> 2] |= padded[i] << ((3 - (i % 4)) * 8)
  }
  words[words.length - 2] = ((bitLength / maxWord) | 0)
  words[words.length - 1] = (bitLength | 0)

  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16)
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2]
      const a = hash[0], e = hash[4]
      const temp1 = (hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        )) | 0
      const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0

      hash = [(temp1 + temp2) | 0].concat(hash)
      hash[4] = (hash[4] + temp1) | 0
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += b.toString(16).padStart(2, '0')
    }
  }
  return result
}

export async function exportArtifactHash(files: ExportFile[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeExportFiles(files)))
  // `crypto.subtle` is unavailable on some non-secure LAN origins. Capture the
  // object once so a partial browser crypto implementation cannot throw while
  // evaluating `crypto.subtle.digest`; use the deterministic fallback instead.
  const subtle = globalThis.crypto?.subtle
  if (subtle && typeof subtle.digest === 'function') {
    const digest = await subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return sha256BytesFallback(bytes)
}
 
