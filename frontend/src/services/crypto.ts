import * as elliptic from 'elliptic';

// Initialize ECDSA with secp256k1 curve (same as used by Noir)
const ec = new elliptic.ec('secp256k1');

// Internal key storage - in a real application, this should be securely stored
let keyPair: elliptic.ec.KeyPair | null = null;

/**
 * Convert a hex string to Uint8Array
 */
function hexToUint8Array(hexString: string): Uint8Array {
  // Ensure even length
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }
  
  const arrayBuffer = new Uint8Array(hexString.length / 2);
  
  for (let i = 0; i < hexString.length; i += 2) {
    const byteValue = parseInt(hexString.substring(i, i + 2), 16);
    arrayBuffer[i / 2] = byteValue;
  }
  
  return arrayBuffer;
}

/**
 * Generates a new key pair or retrieves the existing one
 */
export function getKeyPair(): { 
  privateKey: string;
  publicKeyX: Uint8Array;
  publicKeyY: Uint8Array;
} {
  if (!keyPair) {
    // First, try to load from localStorage if available
    const savedPrivateKey = localStorage.getItem('device_private_key');
    
    if (savedPrivateKey) {
      try {
        keyPair = ec.keyFromPrivate(savedPrivateKey, 'hex');
      } catch (error) {
        console.error('Error loading saved key, generating new one:', error);
        keyPair = null;
      }
    }
    
    // If still no key pair, generate a new one
    if (!keyPair) {
      keyPair = ec.genKeyPair();
      // Save in localStorage for persistence
      localStorage.setItem('device_private_key', keyPair.getPrivate('hex'));
    }
  }
  
  const privateKey = keyPair.getPrivate('hex');
  const publicKey = keyPair.getPublic();
  
  // Get X and Y coordinates of public key as 32-byte arrays
  const publicKeyX = hexToUint8Array(publicKey.getX().toString(16).padStart(64, '0'));
  const publicKeyY = hexToUint8Array(publicKey.getY().toString(16).padStart(64, '0'));
  
  return {
    privateKey,
    publicKeyX,
    publicKeyY
  };
}

/**
 * Creates a SHA-256 hash of the given data
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buffer);
}

/**
 * Converts a base64 data URL to a Uint8Array
 */
export function dataURLtoUint8Array(dataURL: string): Uint8Array {
  const base64 = dataURL.split(',')[1];
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Converts a u64 to bytes array in little-endian format
 */
export function u64ToBytes(value: number | bigint): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  
  // Convert to BigInt if it's a number
  const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
  
  // Write as little-endian
  let tempValue = bigIntValue;
  for (let i = 0; i < 8; i++) {
    view.setUint8(i, Number(tempValue & BigInt(0xFF)));
    tempValue >>= BigInt(8);
  }
  
  return new Uint8Array(buffer);
}

/**
 * Converts an i64 to bytes array
 */
export function i64ToBytes(value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  // Write the absolute value
  let tempValue = BigInt(absValue);
  for (let i = 0; i < 8; i++) {
    view.setUint8(i, Number(tempValue & BigInt(0xFF)));
    tempValue >>= BigInt(8);
  }
  
  // If negative, set the sign bit (most significant bit)
  if (isNegative) {
    view.setUint8(7, view.getUint8(7) | 0x80);
  }
  
  return new Uint8Array(buffer);
}

/**
 * Generates the attestation hash in the same way as the Noir circuit
 */
export async function generateAttestationHash(
  imageHash: Uint8Array,
  timestamp: number,
  deviceId: number,
  latitude: number,
  longitude: number,
  gpsEnabled: boolean
): Promise<Uint8Array> {
  // Create a buffer to hold all the data (same size as in Noir)
  const dataBuffer = new Uint8Array(128);
  let index = 0;
  
  // Add image hash
  dataBuffer.set(imageHash, index);
  index += 32;
  
  // Add timestamp
  dataBuffer.set(u64ToBytes(timestamp), index);
  index += 8;
  
  // Add device ID
  dataBuffer.set(u64ToBytes(deviceId), index);
  index += 8;
  
  // Add GPS data if enabled
  if (gpsEnabled) {
    // Add latitude and longitude
    dataBuffer.set(i64ToBytes(latitude), index);
    index += 8;
    
    dataBuffer.set(i64ToBytes(longitude), index);
    index += 8;
  }
  
  // Add GPS flag
  dataBuffer[index] = gpsEnabled ? 1 : 0;
  
  // Hash using SHA-256
  return await sha256(dataBuffer);
}

/**
 * Converts a Uint8Array to hex string
 */
function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Signs a message hash with the device's private key
 */
export function signMessage(messageHash: Uint8Array): Uint8Array {
  const { privateKey } = getKeyPair();
  
  // Convert messageHash to hex string
  const hashHex = uint8ArrayToHex(messageHash);
  
  // Sign the hash with the private key
  const keyPair = ec.keyFromPrivate(privateKey, 'hex');
  const signature = keyPair.sign(hashHex);
  
  // Get r and s components and combine them
  const r = signature.r.toString(16).padStart(64, '0');
  const s = signature.s.toString(16).padStart(64, '0');
  
  // Convert to Uint8Array (combined r+s = 64 bytes)
  return hexToUint8Array(r + s);
} 