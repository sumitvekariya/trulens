import type { ImageMetadata } from '../components/Camera';
import { 
  dataURLtoUint8Array, 
  generateAttestationHash, 
  getKeyPair, 
  sha256, 
  signMessage 
} from './crypto';

const API_URL = 'http://localhost:3000/api';

/**
 * Extended metadata with cryptographic attestation
 */
interface CryptoMetadata extends ImageMetadata {
  signature: number[];
  publicKeyX: number[];
  publicKeyY: number[];
  attestationHash: number[];
}

/**
 * Sends an image and metadata to the backend for verification
 */
export async function verifyImage(
  imageData: string, 
  metadata: ImageMetadata, 
  proofFile?: File | null
): Promise<{
  success: boolean;
  attestationHash?: string;
  message: string;
}> {
  try {
    console.log('Preparing image for verification...');
    
    // Convert base64 image to file
    const base64Response = await fetch(imageData);
    const blob = await base64Response.blob();
    const file = new File([blob], 'captured_image.jpg', { type: 'image/jpeg' });

    // Create form data
    const formData = new FormData();
    formData.append('image', file);

    // If proof file is provided, use it instead of generating new crypto metadata
    if (proofFile) {
      console.log('Using provided proof file');
      formData.append('proof', proofFile);
      formData.append('metadata', JSON.stringify(metadata));
    } else {
      // Create a crypto-enhanced version of the metadata
      console.log('Generating new crypto metadata');
      const cryptoMetadata: CryptoMetadata = await generateCryptoMetadata(imageData, metadata);
      formData.append('metadata', JSON.stringify(cryptoMetadata));
    }

    console.log('Sending verification request to server...');
    
    // Send to backend
    const response = await fetch(`${API_URL}/verify`, {
      method: 'POST',
      body: formData,
    });

    // Check for non-200 responses
    if (!response.ok) {
      console.error('Server returned error status:', response.status);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      try {
        // Try to parse as JSON if possible
        const errorJson = JSON.parse(errorText);
        return {
          success: false,
          message: errorJson.message || `Server error: ${response.status}`
        };
      } catch {
        // If not JSON, return the raw text
        return {
          success: false,
          message: `Server error: ${response.status} - ${errorText}`
        };
      }
    }

    const result = await response.json();
    console.log('Verification result:', result);
    return result;
  } catch (error) {
    console.error('API error:', error);
    return {
      success: false,
      message: `Error communicating with the server: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Generates cryptographic metadata for the image
 */
async function generateCryptoMetadata(imageData: string, metadata: ImageMetadata): Promise<CryptoMetadata> {
  // Step 1: Get device keypair
  const { publicKeyX, publicKeyY } = getKeyPair();
  
  // Step 2: Calculate image hash
  const imageBytes = dataURLtoUint8Array(imageData);
  const imageHash = await sha256(imageBytes);
  
  // Step 3: Format metadata values for attestation
  const deviceId = parseInt(metadata.deviceId);
  const timestamp = metadata.timestamp;
  const latitude = metadata.latitude ? Math.floor(metadata.latitude * 1000000) : 0;
  const longitude = metadata.longitude ? Math.floor(metadata.longitude * 1000000) : 0;
  const gpsEnabled = Boolean(metadata.gpsEnabled);
  
  // Step 4: Generate attestation hash
  const attestationHash = await generateAttestationHash(
    imageHash,
    timestamp,
    deviceId,
    latitude,
    longitude,
    gpsEnabled
  );
  
  // Step 5: Sign the attestation hash
  const signature = signMessage(attestationHash);
  
  // Return the extended metadata with cryptographic components
  return {
    ...metadata,
    // Convert Uint8Arrays to number arrays for JSON serialization
    signature: Array.from(signature),
    publicKeyX: Array.from(publicKeyX),
    publicKeyY: Array.from(publicKeyY),
    attestationHash: Array.from(attestationHash)
  };
}

/**
 * Retrieves attestation details by ID
 */
export async function getAttestation(id: string): Promise<{
  success: boolean;
  attestation?: {
    id: string;
    timestamp: number;
    deviceId: string;
    hasGPS: boolean;
    verified: boolean;
  };
  message?: string;
}> {
  try {
    const response = await fetch(`${API_URL}/attestation/${id}`);
    
    if (!response.ok) {
      console.error('Server returned error status:', response.status);
      return {
        success: false,
        message: `Failed to retrieve attestation: ${response.status}`
      };
    }
    
    return await response.json();
  } catch (error) {
    console.error('API error:', error);
    return {
      success: false,
      message: `Error retrieving attestation: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 