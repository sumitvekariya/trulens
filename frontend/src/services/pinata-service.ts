import { PinataSDK } from 'pinata';

// Initialize Pinata with the JWT from environment variables
const pinata = new PinataSDK({
  pinataJwt: import.meta.env.VITE_PINATA_JWT || '',
  pinataGateway: import.meta.env.VITE_GATEWAY_URL || ''
});

// Function to upload JSON metadata to IPFS
export async function uploadMetadata(metadata: Record<string, unknown>) {
  try {
    // Check if Pinata is configured
    if (!import.meta.env.VITE_PINATA_JWT) {
      console.warn('Pinata JWT not configured in environment variables');
      throw new Error('Pinata credentials not set');
    }

    console.log('Uploading metadata to IPFS:', metadata);
    
    // Upload JSON directly to Pinata
    const result = await pinata.upload.public.json(metadata);
    
    if (result.cid) {
      console.log('Metadata stored on IPFS with CID:', result.cid);
      return {
        success: true,
        cid: result.cid
      };
    } else {
      throw new Error('Failed to get CID from Pinata upload');
    }
  } catch (error) {
    console.error('Failed to upload to IPFS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Function to upload image file to IPFS
export async function uploadImage(imageBlob: Blob) {
  try {
    // Check if Pinata is configured
    if (!import.meta.env.VITE_PINATA_JWT) {
      console.warn('Pinata JWT not configured in environment variables');
      throw new Error('Pinata credentials not set');
    }

    console.log('Uploading image to IPFS');
    
    // Convert blob to File object for upload
    const imageFile = new File([imageBlob], `image-${Date.now()}.jpg`, { type: 'image/jpeg' });
    
    // Upload file to Pinata
    const result = await pinata.upload.public.file(imageFile);
    
    if (result.cid) {
      console.log('Image stored on IPFS with CID:', result.cid);
      return {
        success: true,
        cid: result.cid
      };
    } else {
      throw new Error('Failed to get CID from Pinata upload');
    }
  } catch (error) {
    console.error('Failed to upload image to IPFS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Function to retrieve data from IPFS
export async function retrieveFromIPFS(cid: string) {
  try {
    const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs';
    const url = `${gatewayUrl}/${cid}`;
    
    console.log('Retrieving data from IPFS at:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to retrieve from IPFS: ${response.statusText}`);
    }
    
    // Try to parse as JSON, or return as blob if it's not JSON
    try {
      const data = await response.json();
      return {
        success: true,
        data,
        type: 'json'
      };
    } catch (_) {
      const blob = await response.blob();
      return {
        success: true,
        data: blob,
        type: 'blob'
      };
    }
  } catch (error) {
    console.error('Error retrieving from IPFS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export default {
  uploadMetadata,
  uploadImage,
  retrieveFromIPFS
}; 