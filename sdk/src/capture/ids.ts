function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  const webCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createId(): string {
  const webCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (typeof webCrypto?.randomUUID === 'function') {
    try {
      return webCrypto.randomUUID();
    } catch {
      return randomHex(16);
    }
  }
  return randomHex(16);
}

export function resolveAppId(configured: string | undefined): string {
  if (configured && configured.length > 0) return configured;
  if (typeof location !== 'undefined' && location.hostname) return location.hostname;
  return 'unknown';
}
