import { RpcProvider, Contract } from 'starknet';
// We need to add a type declaration for the contract ABI since it's imported from a JSON file
// @ts-ignore - this is a valid import, TypeScript just doesn't recognize it
import contractAbi from '../contract-abi.json';

// Get environment variables
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0551f50e60748768d77dc758b43708123ff9f8f88bc844846044929b1b1c5074';
const PROVIDER_URL = import.meta.env.VITE_PROVIDER_URL || 'http://127.0.0.1:5050/rpc';

// Initialize provider
const provider = new RpcProvider({ nodeUrl: PROVIDER_URL });

// Initialize contract instance
const contract = new Contract(contractAbi, CONTRACT_ADDRESS, provider);

/**
 * Verify an attestation on the blockchain
 */
export async function verifyAttestationOnchain(imageHash: string): Promise<{
  success: boolean;
  isValid: boolean;
  timestamp: number;
  metadataHash?: string;
  attester?: string;
  error?: string;
}> {
  try {
    console.log('Verifying attestation on StarkNet blockchain...');
    console.log('Contract address:', CONTRACT_ADDRESS);
    console.log('Image hash:', imageHash);
    
    // Call the view method
    const result = await contract.verify_attestation(imageHash);
    
    if (!result || result.length < 4) {
      return {
        success: false,
        isValid: false,
        timestamp: 0,
        error: 'Invalid response from contract'
      };
    }
    
    // Parse the response (isValid, timestamp, metadataHash, attester)
    const [isValid, timestamp, metadataHash, attester] = result;
    
    return {
      success: true,
      isValid: isValid === 1n, // Convert BigInt to boolean
      timestamp: Number(timestamp), // Convert BigInt to number
      metadataHash: metadataHash.toString(),
      attester: attester.toString()
    };
  } catch (error) {
    console.error('Failed to verify attestation on blockchain:', error);
    return {
      success: false,
      isValid: false,
      timestamp: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get the total number of attestations from the blockchain
 */
export async function getTotalAttestations(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    console.log('Getting total attestations from StarkNet blockchain...');
    
    // Call the view method
    const result = await contract.get_total_attestations();
    
    return {
      success: true,
      count: Number(result) // Convert BigInt to number
    };
  } catch (error) {
    console.error('Failed to get total attestations from blockchain:', error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if the StarkNet provider is available
 */
export async function checkStarknetConnection(): Promise<boolean> {
  try {
    // Try to get the chain ID as a simple connection test
    const chainId = await provider.getChainId();
    console.log('Connected to StarkNet chain:', chainId);
    return true;
  } catch (error) {
    console.error('Failed to connect to StarkNet provider:', error);
    return false;
  }
}

export default {
  verifyAttestationOnchain,
  getTotalAttestations,
  checkStarknetConnection
}; 