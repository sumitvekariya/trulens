import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ImageMetadata } from './Camera';
import ImageVerifier from './ImageVerifier';
import '../styles/VerifyView.css';

// Starknet imports
import { useAccount, useContract } from '@starknet-react/core';
import type { Abi } from 'starknet';
import StoredABI from '../contract-abi.json';

// Import Pinata service
import pinataService from '../services/pinata-service';
import { SiIpfs } from 'react-icons/si';
import { IoCheckmarkCircle, IoCloseCircle, IoCalendarOutline, IoCodeWorkingOutline } from 'react-icons/io5';
import { MdDeviceHub, MdOutlineGpsFixed } from 'react-icons/md';
import { FaFileImage } from 'react-icons/fa';

// Contract address - same as used in CaptureView
const CONTRACT_ADDRESS = '0x01350d41c135080af51cc7f79cedc10a85d94df2a1497b7cb635088dea11ef69';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface VerificationResult {
  verified: boolean;
  timestamp?: string;
  attesterAddress?: string;
  metadataHash?: string;
}

interface IPFSMetadata extends ImageMetadata {
  gateway?: string;
  captureDate?: string;
  imageHash?: string;
}

const VerifyView = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Starknet state
  const { account } = useAccount();
  const { contract } = useContract({ abi: StoredABI as Abi, address: CONTRACT_ADDRESS });
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  
  // IPFS metadata state
  const [ipfsMetadata, setIpfsMetadata] = useState<IPFSMetadata | null>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataCid, setMetadataCid] = useState<string | null>(null);
  
  // Add state for off-chain verification
  const [extractedMetadata, setExtractedMetadata] = useState<ImageMetadata | null>(null);
  const [verificationMode, setVerificationMode] = useState<'on-chain' | 'off-chain'>('on-chain');

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setUploadedImage(reader.result);
          // Reset verification state when a new image is uploaded
          setVerificationResult(null);
          setVerificationError(null);
          setIpfsMetadata(null);
          setMetadataError(null);
          
          // Try to extract metadata from EXIF data (if available)
          extractMetadataFromImage(file).then(extractedData => {
            if (extractedData) {
              setExtractedMetadata(extractedData);
            }
          }).catch(error => {
            console.error('Failed to extract metadata:', error);
          });
        }
      };
      
      reader.readAsDataURL(file);
    }
  };

  // Function to extract metadata from image if possible
  const extractMetadataFromImage = async (file: File): Promise<ImageMetadata | null> => {
    // For now, just return a basic metadata structure with the filename as deviceId
    // In a real app, you'd parse EXIF data from the image
    return {
      deviceId: `file-${file.name.replace(/\s+/g, '-')}`,
      timestamp: Math.floor(Date.now() / 1000),
      latitude: 0,
      longitude: 0,
      gpsEnabled: false
    };
  };

  const triggerImageUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Function to look up IPFS CID by metadata hash
  const lookupCidByHash = async (metadataHash: string) => {
    try {
      setIsFetchingMetadata(true);
      setMetadataError(null);
      
      // Use the new backend endpoint to get the original CID from the truncated hash
      // metadataHash here is the one from the smart contract (e.g., 0xtruncatedHash)
      const response = await fetch(`${API_URL}/get_cid/${metadataHash}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.originalCid) {
          return data.originalCid;
        }
      }
      
      // If the lookup fails
      throw new Error('Could not find IPFS CID for this metadata hash. Mapping may not exist or server error.');
    } catch (error) {
      console.error('Error looking up CID by truncated hash:', error);
      throw error; // Re-throw to be caught by the calling useEffect
    }
  };

  // Function to fetch metadata from IPFS using CID
  const fetchMetadataFromIPFS = async (cid: string) => {
    try {
      // Try to fetch using Pinata service
      const result = await pinataService.retrieveFromIPFS(cid);
      
      if (result.success && result.type === 'json') {
        return {
          ...result.data as IPFSMetadata,
          gateway: 'Pinata'
        };
      }
      
      // If Pinata fails, try backend fallback
      const backendResponse = await fetch(`${API_URL}/ipfs/${cid}`);
      
      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        if (backendData.success && backendData.data) {
          return {
            ...backendData.data,
            gateway: backendData.gateway || 'backend'
          };
        }
      }
      
      throw new Error('Failed to retrieve metadata from IPFS');
    } catch (error) {
      console.error('Error fetching from IPFS:', error);
      throw error;
    }
  };

  // Effect to fetch metadata when verification result changes
  useEffect(() => {
    const fetchMetadata = async () => {
      if (verificationResult?.verified && verificationResult.metadataHash) {
        try {
          setIsFetchingMetadata(true);
          setMetadataError(null);
          
          // This is a workaround since we can't directly convert the hash back to CID
          // In a production app, you'd store the mapping in a database
          try {
            // Try using the API lookup endpoint first
            const cid = await lookupCidByHash(verificationResult.metadataHash);
            setMetadataCid(cid);
            
            // Now fetch the actual metadata using the CID
            const metadata = await fetchMetadataFromIPFS(cid);
            setIpfsMetadata(metadata);
          } catch (lookupError) {
            console.error('Failed to lookup CID:', lookupError);
            setMetadataError('Could not find IPFS CID for this attestation. The mapping may not be stored.');
          }
        } catch (error) {
          console.error('Error fetching metadata:', error);
          setMetadataError(error instanceof Error ? error.message : String(error));
        } finally {
          setIsFetchingMetadata(false);
        }
      }
    };
    
    fetchMetadata();
  }, [verificationResult]);

  // Function to verify image on-chain
  const verifyOnChain = async () => {
    if (!uploadedImage || !account || !contract) {
      setVerificationError("Image, wallet connection, or contract not available");
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);
    setVerificationResult(null);
    setIpfsMetadata(null);
    setMetadataError(null);

    try {
      // 1. Generate image hash (same method as attestation but truncated)
      const imageBlob = await fetch(uploadedImage).then(res => res.blob());
      const imageBuffer = await imageBlob.arrayBuffer();
      const imageHashDigest = await crypto.subtle.digest('SHA-256', imageBuffer);
      const imageHashHex = Array.from(new Uint8Array(imageHashDigest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      // Truncate hash to 30 chars - MUST match attestation logic
      const truncatedImageHash = imageHashHex.substring(0, 30);
      const imageHashFelt = '0x' + truncatedImageHash;
      
      console.log("Verifying image hash:", imageHashFelt);
      
      // 2. Call the verify_attestation function
      const result = await contract.call("verify_attestation", [imageHashFelt]);
      console.log("Verification result:", result);
      
      // 3. Process results - accessing result as an object with numeric keys
      const exists = result[0];
      const timestamp = result[1];
      const metadataHash = result[2];
      const attester = result[3];
      
      if (exists) { // In StarkNet, true is non-zero
        // Convert timestamp to date (assuming it's in seconds)
        const attestationDate = new Date(Number(timestamp) * 1000);
        
        // Convert metadata hash from BigInt to hex string with 0x prefix
        const metadataHashHex = '0x' + BigInt(metadataHash).toString(16);
        console.log("Metadata hash converted to hex:", metadataHashHex);
        
        setVerificationResult({
          verified: true,
          timestamp: attestationDate.toLocaleString(),
          attesterAddress: attester.toString(),
          metadataHash: metadataHashHex
        });
      } else {
        setVerificationResult({
          verified: false
        });
      }
    } catch (error: unknown) {
      console.error("Verification error:", error);
      if (error instanceof Error) {
        setVerificationError(error.message);
      } else if (typeof error === 'string') {
        setVerificationError(error);
      } else {
        setVerificationError("Error verifying image on-chain");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="verify-view-container">
      <header className="verify-header">
        <button 
          className="back-button"
          onClick={() => navigate('/')}
        >
          &larr; Back
        </button>
        <h1>Verify Image</h1>
        <div className="spacer"></div>
      </header>

      <div className="verify-content">
        <div className="upload-section">
          <div className="upload-image-section">
            <h2>Upload Image</h2>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              ref={fileInputRef}
              className="file-input"
            />
            <button 
              onClick={triggerImageUpload}
              className="upload-button"
            >
              Select Image
            </button>
            
            {uploadedImage && (
              <div className="uploaded-image-container">
                <img
                  src={uploadedImage}
                  alt="Uploaded"
                  className="uploaded-image"
                />
                
                {/* Verification mode tabs */}
                <div className="verification-tabs">
                  <button 
                    className={`tab-button ${verificationMode === 'on-chain' ? 'active' : ''}`}
                    onClick={() => setVerificationMode('on-chain')}
                  >
                    On-Chain Verification
                  </button>
                  <button 
                    className={`tab-button ${verificationMode === 'off-chain' ? 'active' : ''}`}
                    onClick={() => setVerificationMode('off-chain')}
                  >
                    Off-Chain Verification
                  </button>
                </div>
                
                {/* On-chain verification panel */}
                {verificationMode === 'on-chain' && (
                  <div className="verify-on-chain-section">
                    <button 
                      onClick={verifyOnChain}
                      className="verify-button"
                      disabled={isVerifying || !account}
                    >
                      {isVerifying ? (
                        <>
                          <span className="spinner"></span>
                          Verifying...
                        </>
                      ) : 'Verify On-Chain'}
                    </button>
                    
                    {!account && (
                      <p className="verification-warning">Connect wallet for on-chain verification</p>
                    )}
                    
                    {verificationError && (
                      <div className="verification-error">
                        <IoCloseCircle size={20} />
                        <p>Error: {verificationError}</p>
                      </div>
                    )}
                    
                    {verificationResult && (
                      <div className={`verification-result ${verificationResult.verified ? 'verified' : 'not-verified'}`}>
                        {verificationResult.verified ? (
                          <>
                            <div className="verification-status success">
                              <IoCheckmarkCircle size={24} />
                              <h3>Verified on Starknet</h3>
                            </div>
                            
                            <div className="verification-details">
                              <div className="verification-item">
                                <IoCalendarOutline size={18} />
                                <div>
                                  <span className="label">Attested on:</span>
                                  <span className="value">{verificationResult.timestamp}</span>
                                </div>
                              </div>
                              
                              <div className="verification-item">
                                <IoCodeWorkingOutline size={18} />
                                <div>
                                  <span className="label">By:</span>
                                  <a 
                                    href={`https://sepolia.starkscan.co/contract/${verificationResult.attesterAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="value address-link"
                                  >
                                    {verificationResult.attesterAddress?.slice(0, 8)}...{verificationResult.attesterAddress?.slice(-6)}
                                  </a>
                                </div>
                              </div>
                            </div>
                            
                            {/* IPFS Metadata Section */}
                            {isFetchingMetadata && (
                              <div className="loading-container">
                                <div className="loading-spinner"></div>
                                <p>Fetching metadata from IPFS...</p>
                              </div>
                            )}
                            
                            {metadataError && (
                              <div className="metadata-error">
                                <IoCloseCircle size={20} />
                                <p>{metadataError}</p>
                              </div>
                            )}
                            
                            {ipfsMetadata && (
                              <div className="ipfs-metadata-card">
                                <div className="ipfs-header">
                                  <div className="title-row">
                                    <SiIpfs size={20} />
                                    <h4>IPFS Metadata</h4>
                                    {ipfsMetadata.gateway && (
                                      <span className="gateway-badge">via {ipfsMetadata.gateway}</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="metadata-details-grid">
                                  {ipfsMetadata.timestamp && (
                                    <div className="metadata-field">
                                      <div className="field-icon">
                                        <IoCalendarOutline size={16} />
                                      </div>
                                      <div className="field-content">
                                        <span className="field-label">Timestamp</span>
                                        <span className="field-value">{new Date(ipfsMetadata.timestamp * 1000).toLocaleString()}</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {ipfsMetadata.captureDate && (
                                    <div className="metadata-field">
                                      <div className="field-icon">
                                        <IoCalendarOutline size={16} />
                                      </div>
                                      <div className="field-content">
                                        <span className="field-label">Capture Date</span>
                                        <span className="field-value">{new Date(ipfsMetadata.captureDate).toLocaleString()}</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {ipfsMetadata.deviceId && (
                                    <div className="metadata-field">
                                      <div className="field-icon">
                                        <MdDeviceHub size={16} />
                                      </div>
                                      <div className="field-content">
                                        <span className="field-label">Device ID</span>
                                        <span className="field-value">{ipfsMetadata.deviceId}</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {Boolean(ipfsMetadata.latitude) && Boolean(ipfsMetadata.longitude) && (
                                    <div className="metadata-field">
                                      <div className="field-icon">
                                        <MdOutlineGpsFixed size={16} />
                                      </div>
                                      <div className="field-content">
                                        <span className="field-label">Location</span>
                                        <span className="field-value">{ipfsMetadata.latitude?.toFixed(6)}, {ipfsMetadata.longitude?.toFixed(6)}</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {ipfsMetadata.imageHash && (
                                    <div className="metadata-field">
                                      <div className="field-icon">
                                        <FaFileImage size={16} />
                                      </div>
                                      <div className="field-content">
                                        <span className="field-label">Image Hash</span>
                                        <span className="field-value hash">{ipfsMetadata.imageHash.slice(0, 8)}...{ipfsMetadata.imageHash.slice(-6)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                {metadataCid && (
                                  <div className="cid-info">
                                    <div className="cid-row">
                                      <span className="cid-label">IPFS CID:</span>
                                      <span className="cid-value">{metadataCid}</span>
                                    </div>
                                    <a 
                                      href={`https://gateway.pinata.cloud/ipfs/${metadataCid}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ipfs-link"
                                    >
                                      View on IPFS
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="verification-status error">
                            <IoCloseCircle size={24} />
                            <h3>Not found on-chain</h3>
                            <p>This image has not been attested on Starknet.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Off-chain verification panel */}
                {verificationMode === 'off-chain' && (
                  <div className="verify-off-chain-section">
                    <div className="wip-banner">
                      <div className="wip-badge">WORK IN PROGRESS</div>
                      <p>Zero-Knowledge Proof Verification</p>
                    </div>
                    
                    <div className="zk-info-card">
                      <h3>ZK-Proof Verification</h3>
                      <p>
                        This feature uses zero-knowledge proofs to verify image authenticity while preserving privacy.
                        The system verifies:
                      </p>
                      <ul className="zk-feature-list">
                        <li>
                          <span className="feature-icon">⏱️</span>
                          <span className="feature-text">Timestamp validity without revealing exact time</span>
                        </li>
                        <li>
                          <span className="feature-icon">📍</span>
                          <span className="feature-text">Location bounds without exposing precise coordinates</span>
                        </li>
                        <li>
                          <span className="feature-icon">🔐</span>
                          <span className="feature-text">Image integrity validation with cryptographic proof</span>
                        </li>
                      </ul>
                    </div>
                    
                    <div className="coming-soon-features">
                      <h4>Coming Soon:</h4>
                      <div className="feature-grid">
                        <div className="feature-card">
                          <div className="feature-icon-large">🌐</div>
                          <div className="feature-title">Decentralized Attestation</div>
                        </div>
                        <div className="feature-card">
                          <div className="feature-icon-large">🔍</div>
                          <div className="feature-title">Enhanced Metadata Verification</div>
                        </div>
                        <div className="feature-card">
                          <div className="feature-icon-large">⚡</div>
                          <div className="feature-title">Fast On-Chain Verification</div>
                        </div>
                        <div className="feature-card">
                          <div className="feature-icon-large">👥</div>
                          <div className="feature-title">Multi-Party Verification</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="zk-verification-placeholder">
                      <div className="placeholder-illustration">
                        <div className="placeholder-icon">🔍</div>
                        <div className="progress-bar">
                          <div className="progress-indicator"></div>
                        </div>
                      </div>
                      <p>Our engineers are currently finalizing this feature. Check back soon!</p>
                    </div>
                    
                    <div className="fallback-verification">
                      <h4>Using Local Verification (Beta)</h4>
                      <ImageVerifier 
                        imageData={uploadedImage} 
                        metadata={extractedMetadata}
                        simpleView={false}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyView; 