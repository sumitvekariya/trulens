import { useState, useEffect } from 'react';
import type { ImageMetadata } from './Camera';
import { verifyImage as apiVerifyImage } from '../services/api';
import { RiShieldCheckLine } from 'react-icons/ri';
import { SiIpfs } from 'react-icons/si';
import { MdVerified } from 'react-icons/md';
// Remove unused imports since we'll use the backend service
// import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
// import { UltraHonkBackend } from '@aztec/bb.js';
// import circuitData from '../../../shared/compiled_circuit/trulens.json';

// Import Pinata service
import pinataService from '../services/pinata-service';

// Public IPFS gateways to try as fallbacks
const PUBLIC_IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://dweb.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs'
];

interface ImageVerifierProps {
  imageData: string | null;
  metadata: ImageMetadata | null;
  proofFile?: File | null;
  simpleView?: boolean;
}

interface VerificationStatus {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
  attestationHash?: string;
  metadataCid?: string;
  ipfsSuccess?: boolean;
  usedGateway?: string;
  source?: string;
  errorDetails?: string;
}

interface VerifiedMetadata extends ImageMetadata {
  ipfsSource?: boolean;
  gateway?: string;
}

const ImageVerifier = ({ imageData, metadata, proofFile, simpleView }: ImageVerifierProps) => {
  const [verification, setVerification] = useState<VerificationStatus>({ status: 'idle' });
  const [verifiedMetadata, setVerifiedMetadata] = useState<VerifiedMetadata | null>(null);
  const [fetchingIPFS, setFetchingIPFS] = useState(false);
  
  // State for automatic verification in simpleView mode
  const [autoVerified, setAutoVerified] = useState(false);

  // Helper function to log messages
  const addLog = (message: string) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
  };

  // Auto-verify when in simpleView mode
  useEffect(() => {
    if (simpleView && imageData && metadata && !autoVerified) {
      verifyImage();
      setAutoVerified(true);
    }
  }, [simpleView, imageData, metadata, autoVerified]);

  // Reset auto-verification flag when image data changes
  useEffect(() => {
    if (imageData) {
      setAutoVerified(false);
    }
  }, [imageData]);

  // Fetch metadata from IPFS when verification is successful and we have a CID
  useEffect(() => {
    if (verification.status === 'success' && verification.metadataCid) {
      // Only fetch from IPFS if the server verification didn't already provide metadata
      // or if the server didn't successfully fetch from IPFS
      if (!verification.ipfsSuccess) {
        fetchMetadataFromIPFS(verification.metadataCid);
      }
    }
  }, [verification.status, verification.metadataCid, verification.ipfsSuccess]);

  const fetchMetadataFromIPFS = async (cid: string) => {
    setFetchingIPFS(true);
    try {
      addLog(`Fetching metadata from IPFS with CID: ${cid}`);
      
      // Try Pinata service first
      try {
        const pinataResult = await pinataService.retrieveFromIPFS(cid);
        if (pinataResult.success && pinataResult.type === 'json') {
          addLog('Successfully retrieved metadata from Pinata');
          setVerifiedMetadata({ 
            ...pinataResult.data as ImageMetadata,
            ipfsSource: true,
            gateway: 'Pinata'
          });
          setFetchingIPFS(false);
          return;
        }
      } catch (pinataErr) {
        addLog(`Pinata retrieval failed: ${String(pinataErr)}`);
      }
      
      // Try backend next
      const backendResult = await fetchFromBackendAPI(cid);
      if (backendResult) {
        setVerifiedMetadata({ 
          ...backendResult,
          ipfsSource: true,
          gateway: 'backend'
        });
        setFetchingIPFS(false);
        return;
      }
      
      // If backend fails, try public gateways
      for (const gateway of PUBLIC_IPFS_GATEWAYS) {
        try {
          const gatewayResult = await fetchFromPublicGateway(cid, gateway);
          if (gatewayResult) {
            setVerifiedMetadata({ 
              ...gatewayResult,
              ipfsSource: true,
              gateway: gateway
            });
            setFetchingIPFS(false);
            return;
          }
        } catch (err) {
          addLog(`Failed to fetch from gateway ${gateway}: ${err}`);
          // Continue to next gateway
        }
      }
      
      // If we got here, all fetches failed
      addLog('All IPFS fetch attempts failed');
      setFetchingIPFS(false);
    } catch (error) {
      addLog(`Error in fetchMetadataFromIPFS: ${error instanceof Error ? error.message : String(error)}`);
      setFetchingIPFS(false);
    }
  };
  
  // Function to fetch from our backend API
  const fetchFromBackendAPI = async (cid: string): Promise<ImageMetadata | null> => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const response = await fetch(`${apiUrl}/ipfs/${cid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from backend API: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        addLog('Successfully retrieved metadata from backend API');
        return result.data;
      }
      throw new Error(result.error || 'Unknown error from backend API');
    } catch (error) {
      addLog(`Error fetching from backend API: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  
  // Function to fetch from public IPFS gateway
  const fetchFromPublicGateway = async (cid: string, gateway: string): Promise<ImageMetadata | null> => {
    try {
      const response = await fetch(`${gateway}/${cid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from gateway ${gateway}: ${response.statusText}`);
      }
      
      const data = await response.json();
      addLog(`Successfully retrieved metadata from gateway ${gateway}`);
      return data;
    } catch (error) {
      addLog(`Error fetching from gateway ${gateway}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const verifyImage = async () => {
    if (!imageData || !metadata) {
      setVerification({ 
        status: 'error', 
        message: 'No image or metadata available for verification' 
      });
      return;
    }

    try {
      // Set verification status
      setVerification({ status: 'processing' });
      
      addLog(`Starting verification process with metadata: ${JSON.stringify(metadata)}`);
      addLog(`Image data length: ${imageData.length} characters`);

      // Check if proof file is provided
      if (proofFile) {
        addLog(`Using provided proof file: ${proofFile.name}`);
      }

      // Use the API service for verification
      addLog('Sending verification request to server...');
      const result = await apiVerifyImage(imageData, metadata, proofFile);
      addLog(`Received server response: ${JSON.stringify(result)}`);
      
      if (result.success) {
        addLog(`Verification successful! Attestation hash: ${result.attestationHash}`);
        
        // If we received metadata directly from the server verification, use it
        if (result.metadata) {
          setVerifiedMetadata({
            ...result.metadata,
            ipfsSource: result.ipfsSuccess || false,
            gateway: result.usedGateway || 'local'
          });
        }
        
        setVerification({
          status: 'success',
          message: result.message,
          attestationHash: result.attestationHash,
          metadataCid: result.metadataCid,
          ipfsSuccess: result.ipfsSuccess,
          usedGateway: result.usedGateway,
          source: result.source
        });
      } else {
        addLog(`Verification failed: ${result.message}`);
        setVerification({
          status: 'error',
          message: 'Verification failed',
          errorDetails: result.message
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error during verification: ${errorMessage}`);
      setVerification({
        status: 'error',
        message: 'An unexpected error occurred',
        errorDetails: errorMessage
      });
    }
  };

  return (
    <div className="image-verifier">
      <h3>
        <RiShieldCheckLine size={20} style={{ marginRight: '8px' }} />
        Image Verification
      </h3>
      
      {imageData && metadata ? (
        <>
          <div className="metadata-display">
            <p><strong>Device ID:</strong> {metadata.deviceId}</p>
            <p><strong>Timestamp:</strong> {new Date(metadata.timestamp * 1000).toLocaleString()}</p>
            {metadata.gpsEnabled && metadata.latitude && metadata.longitude && (
              <p><strong>Location:</strong> {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}</p>
            )}
          </div>
          
          {!simpleView && (
            <button 
              onClick={verifyImage}
              disabled={verification.status === 'processing'}
              className="verify-button"
            >
              {verification.status === 'processing' ? 'Verifying...' : 'Verify Image'}
            </button>
          )}
          
          {verification.status === 'success' && (
            <div className="verification-result success">
              <div className="verification-header">
                <MdVerified size={20} style={{ marginRight: '8px', color: '#4CAF50' }} />
                <p>{verification.message || 'Image verified successfully!'}</p>
              </div>
              
              {verification.source && (
                <div className="verification-source">
                  <span className="source-badge">
                    {verification.source === 'local' 
                      ? 'Verified with local attestation' 
                      : `Verified via ${verification.source}`}
                  </span>
                </div>
              )}
              
              {fetchingIPFS && verification.metadataCid && (
                <div className="ipfs-loading">
                  <p>Retrieving metadata from IPFS...</p>
                </div>
              )}
              
              {/* Show metadata from IPFS if available */}
              {verifiedMetadata && (verification.ipfsSuccess || verifiedMetadata.ipfsSource) && (
                <div className="ipfs-metadata">
                  <p className="ipfs-badge">
                    <SiIpfs size={16} style={{ marginRight: '4px' }} />
                    Metadata retrieved from IPFS
                    {(verifiedMetadata.gateway || verification.usedGateway) && 
                      ` (${verifiedMetadata.gateway || verification.usedGateway})`}
                  </p>
                  
                  <div className="metadata-details">
                    <p><strong>Device ID:</strong> {verifiedMetadata.deviceId}</p>
                    <p><strong>Timestamp:</strong> {new Date(verifiedMetadata.timestamp * 1000).toLocaleString()}</p>
                    {verifiedMetadata.latitude && verifiedMetadata.longitude && (
                      <p><strong>Location:</strong> {verifiedMetadata.latitude.toFixed(6)}, {verifiedMetadata.longitude.toFixed(6)}</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Show IPFS CID if available */}
              {verification.metadataCid && (
                <div className="ipfs-cid">
                  <p><strong>IPFS CID:</strong></p>
                  <p className="cid-value">{verification.metadataCid}</p>
                  <p className="cid-link">
                    <a 
                      href={`https://gateway.pinata.cloud/ipfs/${verification.metadataCid}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View on IPFS
                    </a>
                  </p>
                </div>
              )}
              
              {/* Show attestation hash if available */}
              {verification.attestationHash && (
                <div className="attestation-hash">
                  <p><strong>Attestation Hash:</strong></p>
                  <p className="hash">{verification.attestationHash}</p>
                </div>
              )}
            </div>
          )}
          
          {verification.status === 'error' && !simpleView && (
            <div className="verification-result error">
              <p>{verification.message}</p>
              {verification.errorDetails && (
                <div className="error-details">
                  <p><strong>Error Details:</strong></p>
                  <p className="error-message">{verification.errorDetails}</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p>Capture an image to verify it.</p>
      )}
    </div>
  );
};

export default ImageVerifier; 