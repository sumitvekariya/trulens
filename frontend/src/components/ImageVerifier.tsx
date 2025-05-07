import { useState } from 'react';
import type { ImageMetadata } from './Camera';
import { verifyImage as apiVerifyImage } from '../services/api';

// Remove unused imports since we'll use the backend service
// import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
// import { UltraHonkBackend } from '@aztec/bb.js';
// import circuitData from '../../../shared/compiled_circuit/trulens.json';

interface ImageVerifierProps {
  imageData: string | null;
  metadata: ImageMetadata | null;
}

interface VerificationStatus {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
  attestationHash?: string;
  proof?: string;
  errorDetails?: string;
}

const ImageVerifier = ({ imageData, metadata }: ImageVerifierProps) => {
  const [verification, setVerification] = useState<VerificationStatus>({ status: 'idle' });
  const [logs, setLogs] = useState<string[]>([]);

  // Helper function to add logs
  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs, `[${new Date().toISOString()}] ${message}`]);
    console.log(message);
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
      // Reset logs and set verification status
      setLogs([]);
      setVerification({ status: 'processing' });
      
      addLog(`Starting verification process with metadata: ${JSON.stringify(metadata)}`);
      addLog(`Image data length: ${imageData.length} characters`);

      // Use the API service instead of local verification
      addLog('Sending verification request to server...');
      const result = await apiVerifyImage(imageData, metadata);
      addLog(`Received server response: ${JSON.stringify(result)}`);
      
      if (result.success) {
        addLog(`Verification successful! Attestation hash: ${result.attestationHash}`);
        setVerification({
          status: 'success',
          message: result.message,
          attestationHash: result.attestationHash
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
      <h3>Image Verification</h3>
      
      {imageData && metadata ? (
        <>
          <div className="metadata-display">
            <p>Device ID: {metadata.deviceId}</p>
            <p>Timestamp: {new Date(metadata.timestamp * 1000).toLocaleString()}</p>
            {metadata.gpsEnabled && metadata.latitude && metadata.longitude && (
              <p>Location: {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}</p>
            )}
          </div>
          
          <button 
            onClick={verifyImage}
            disabled={verification.status === 'processing'}
            className="verify-button"
          >
            {verification.status === 'processing' ? 'Verifying...' : 'Verify Image'}
          </button>
          
          {verification.status !== 'idle' && (
            <div className={`verification-result ${verification.status}`}>
              <p>{verification.message}</p>
              {verification.attestationHash && (
                <div className="attestation-hash">
                  <p><strong>Attestation Hash:</strong></p>
                  <p className="hash">{verification.attestationHash}</p>
                </div>
              )}
              {verification.errorDetails && (
                <div className="error-details">
                  <p><strong>Error Details:</strong></p>
                  <p className="error-message">{verification.errorDetails}</p>
                </div>
              )}
            </div>
          )}
          
          {logs.length > 0 && (
            <div className="verification-logs">
              <h4>Verification Logs:</h4>
              <pre className="logs-container">
                {logs.map((log, index) => (
                  <div key={index} className="log-entry">{log}</div>
                ))}
              </pre>
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