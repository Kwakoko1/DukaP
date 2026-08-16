/**
 * KwakoPos SaaS — Client-Side WebCrypto Data Vault
 * 
 * Provides hardware-backed AES-GCM-256 field encryption for local data at rest.
 * Uses Web Crypto API (SubtleCrypto) with PBKDF2 key derivation.
 */

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string;         // Base64
  salt: string;       // Base64
  version: number;
}

export class CryptoVaultService {
  private static instance: CryptoVaultService;
  private memoryKey: CryptoKey | null = null;
  private sessionSalt: Uint8Array | null = null;

  private constructor() {}

  public static getInstance(): CryptoVaultService {
    if (!CryptoVaultService.instance) {
      CryptoVaultService.instance = new CryptoVaultService();
    }
    return CryptoVaultService.instance;
  }

  /**
   * Derives an AES-GCM 256-bit key from a user PIN/Secret and Session Context
   */
  public async deriveSessionVaultKey(secret: string, customSalt?: Uint8Array): Promise<CryptoKey> {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      throw new Error('WebCrypto API is not supported in this environment.');
    }

    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const salt = customSalt || window.crypto.getRandomValues(new Uint8Array(16));
    this.sessionSalt = salt;

    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as any,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this.memoryKey = derivedKey;
    return derivedKey;
  }

  /**
   * Encrypts plaintext string using AES-GCM
   */
  public async encrypt(plaintext: string, keyOverride?: CryptoKey): Promise<EncryptedPayload> {
    const key = keyOverride || this.memoryKey;
    if (!key) {
      throw new Error('Vault is locked. Initialize or provide a valid CryptoKey.');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return {
      ciphertext: this.bufferToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bufferToBase64(iv),
      salt: this.sessionSalt ? this.bufferToBase64(this.sessionSalt) : '',
      version: 1
    };
  }

  /**
   * Decrypts an EncryptedPayload back to plaintext string
   */
  public async decrypt(payload: EncryptedPayload, keyOverride?: CryptoKey): Promise<string> {
    const key = keyOverride || this.memoryKey;
    if (!key) {
      throw new Error('Vault is locked. Initialize or provide a valid CryptoKey.');
    }

    const ciphertext = this.base64ToBuffer(payload.ciphertext);
    const iv = this.base64ToBuffer(payload.iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  public isVaultReady(): boolean {
    return this.memoryKey !== null;
  }

  public clearVault(): void {
    this.memoryKey = null;
    this.sessionSalt = null;
  }

  private bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const cryptoVaultService = CryptoVaultService.getInstance();
