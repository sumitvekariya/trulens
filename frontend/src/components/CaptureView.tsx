import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Camera, { type ImageMetadata } from './Camera';
// import ImageVerifier from './ImageVerifier';
import '../styles/CaptureView.css';

// Import icons from react-icons
import { IoArrowBack, IoClose, IoShareSocial, IoSave, IoCalendarOutline } from 'react-icons/io5';
import { MdOutlineGpsFixed } from 'react-icons/md';

// Starknet imports
import { useAccount } from '@starknet-react/core';

// Import Pinata service
import pinataService from '../services/pinata-service';

const CONTRACT_ADDRESS = '0x01350d41c135080af51cc7f79cedc10a85d94df2a1497b7cb635088dea11ef69';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Simplified metadata type without signature fields
interface ExtendedMetadata extends Record<string, unknown> {
  latitude: number;
  longitude: number;
  deviceId: string;
  timestamp: number;
  imageHash: string;
  captureDate: string;
  gpsEnabled: boolean;
}

const CaptureView = () => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [processingView, setProcessingView] = useState(false);
  const navigate = useNavigate();

  // Starknet account setup
  const { account } = useAccount();
  
  // State for attestation process
  const [isAttesting, setIsAttesting] = useState(false);
  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationTxHash, setAttestationTxHash] = useState<string | null>(null);
  const [metadataCid, setMetadataCid] = useState<string | null>(null);
  const [fullImageHash, setFullImageHash] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCapture = (imageData: string, imageMetadata: ImageMetadata) => {
    setCapturedImage(imageData);
    setMetadata(imageMetadata);
    setShowControls(false);
    setProcessingView(true);
    setAttestationTxHash(null); // Reset attestation status on new capture
    setAttestationError(null);
    setMetadataCid(null);
    setFullImageHash(null); // Reset full image hash
    setTimeout(() => {
      setProcessingView(false);
    }, 1500);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setMetadata(null);
    setShowControls(true);
    setAttestationTxHash(null); // Reset attestation status
    setAttestationError(null);
    setMetadataCid(null);
    setFullImageHash(null); // Reset full image hash
  };

  const handleAttest = async () => {
    if (!account) {
      alert('Please connect your wallet first.');
      return;
    }
    if (!capturedImage || !metadata) {
      alert('No image captured or metadata missing.');
      return;
    }

    setIsAttesting(true);
    setAttestationError(null);
    setAttestationTxHash(null);

    try {
      // 1. Prepare image_hash
      const imageBlob = await fetch(capturedImage).then(res => res.blob());
      const imageBuffer = await imageBlob.arrayBuffer();
      const imageHashDigest = await crypto.subtle.digest('SHA-256', imageBuffer);
      const imageHashHex = Array.from(new Uint8Array(imageHashDigest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Store the full hash for later use
      setFullImageHash(imageHashHex);
      
      // Truncate the hash for Starknet felt compatibility
      const truncatedImageHash = imageHashHex.substring(0, 30);

      // Create metadata object with all required fields (without signature)
      const metadataObj: ExtendedMetadata = {
        latitude: metadata.latitude || 0,
        longitude: metadata.longitude || 0,
        deviceId: metadata.deviceId || 'unknown',
        timestamp: metadata.timestamp,
        imageHash: imageHashHex,
        captureDate: new Date().toISOString(),
        gpsEnabled: metadata.gpsEnabled,
      };
      
      // Upload metadata directly to IPFS using Pinata
      const uploadResult = await pinataService.uploadMetadata(metadataObj);
      
      if (!uploadResult.success || !uploadResult.cid) {
        throw new Error('Failed to upload metadata to IPFS via Pinata');
      }

      const metadataCid = uploadResult.cid;
      setMetadataCid(metadataCid);
      console.log('Metadata uploaded to IPFS with CID:', metadataCid);

      // Prepare felt values for contract call
      const imageHashFelt = '0x' + truncatedImageHash;
      const timestampFelt = metadata.timestamp.toString();
      
      // Hash the CID for use as a felt
      const metadataCidBuffer = new TextEncoder().encode(metadataCid);
      const metadataCidDigest = await crypto.subtle.digest('SHA-256', metadataCidBuffer);
      const metadataCidHex = Array.from(new Uint8Array(metadataCidDigest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Truncate the hash to 30 hex chars and use as felt
      const truncatedMetadataCidHash = metadataCidHex.substring(0, 30);
      const metadataHashFelt = '0x' + truncatedMetadataCidHash;
      
      console.log("Attestation Args:", { 
        imageHashFelt,
        originalImageHash: fullImageHash, 
        timestampFelt, 
        metadataHashFelt,
        originalMetadataCid: metadataCid
      });

      // Send transaction to Starknet
      const result = await account.execute({
        contractAddress: CONTRACT_ADDRESS,
        entrypoint: 'add_attestation',
        calldata: [imageHashFelt, timestampFelt, metadataHashFelt]
      });

      console.log('Attestation transaction submitted:', result);
      setAttestationTxHash(result.transaction_hash);

      // Store the mapping of truncated hash to original CID in the backend
      if (metadataHashFelt && metadataCid) {
        try {
          const mapResponse = await fetch(`${API_URL}/map_cid`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              truncatedMetadataCidHash: metadataHashFelt, // This is '0x' + truncated hex
              originalMetadataCid: metadataCid,
            }),
          });
          if (!mapResponse.ok) {
            const errorData = await mapResponse.json();
            console.error('Failed to map CID:', errorData.error || mapResponse.statusText);
          } else {
            const mapResult = await mapResponse.json();
            console.log('CID mapping stored successfully:', mapResult);
          }
        } catch (mapError) {
          console.error('Error mapping CID:', mapError);
        }
      }
      
    } catch (error: unknown) { 
      console.error('Attestation error:', error);
      if (error instanceof Error) {
        setAttestationError(error.message);
      } else if (typeof error === 'string') {
        setAttestationError(error);
      } else {
        setAttestationError('An unknown error occurred during attestation.');
      }
    } finally {
      setIsAttesting(false);
    }
  };

  const handleSave = async () => {
    if (!capturedImage) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Convert base64 to blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `trulens-capture-${timestamp}.jpg`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error saving image:', error);
      setSaveError('Failed to save image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (!capturedImage || !metadata) return;
    
    setIsSharing(true);

    try {
      // Convert base64 to blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // Create file object
      const file = new File([blob], 'trulens-capture.jpg', { type: 'image/jpeg' });
      
      // Prepare metadata text
      const metadataText = `Capture Details:
Date: ${new Date(metadata.timestamp * 1000).toLocaleString()}
${metadata.gpsEnabled && metadata.latitude !== undefined && metadata.longitude !== undefined 
  ? `Location: ${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}` 
  : ''}
${metadataCid ? `IPFS: https://silver-chemical-parrotfish-261.mypinata.cloud/ipfs/${metadataCid}` : ''}
${attestationTxHash ? `Starknet: https://sepolia.starkscan.co/tx/${attestationTxHash}` : ''}`;

      // Check if Web Share API is available
      if (navigator.share) {
        await navigator.share({
          files: [file],
          title: 'Trulens Capture',
          text: metadataText
        });
      } else {
        // Fallback for browsers that don't support Web Share API
        const shareUrl = `mailto:?subject=Trulens Capture&body=${encodeURIComponent(metadataText)}`;
        window.open(shareUrl);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Handle full screen mode
  useEffect(() => {
    const handleFullScreen = () => {
      if (document.fullscreenElement) return;
      
      const rootElement = document.documentElement;
      if (rootElement.requestFullscreen) {
        rootElement.requestFullscreen().catch(err => {
          console.log('Error attempting to enable full-screen mode:', err);
        });
      }
    };

    // Try to enter full screen mode on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      // Attempt to go full screen when user interacts
      const handleUserInteraction = () => {
        handleFullScreen();
        document.removeEventListener('click', handleUserInteraction);
      };
      
      document.addEventListener('click', handleUserInteraction);
    }

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.log('Error attempting to exit full-screen mode:', err);
        });
      }
    };
  }, []);

  return (
    <div className="camera-app">
      {!capturedImage ? (
        // Camera capture mode
        <div className="camera-view-container">
          <Camera onCapture={handleCapture} />
          
          {showControls && (
            <div className="camera-app-header">
              <button 
                className="icon-button back-button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/');
                }}
                aria-label="Back"
              >
                <IoArrowBack size={20} color="#D4AF37" />
              </button>
              <div className="spacer"></div>
            </div>
          )}
        </div>
      ) : (
        // Image review mode
        <div className="capture-review-container">
          {processingView ? (
            <div className="processing-overlay">
              <div className="processing-spinner"></div>
              <p>Processing image...</p>
            </div>
          ) : (
            <>
              <div className="review-header">
                <button 
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetake();
                  }}
                  aria-label="Retake"
                >
                  <IoArrowBack size={20} color="#D4AF37" />
                </button>
                <h2>Review Capture</h2>
                <button 
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/');
                  }}
                  aria-label="Home"
                >
                  <IoClose size={20} color="#D4AF37" />
                </button>
              </div>
              
              <div className="image-preview-container">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="captured-image"
                />
                
                {metadata && (
                  <div className="metadata-overlay">
                    <div className="metadata-pill">
                      <span className="metadata-icon">
                        <IoCalendarOutline size={16} />
                      </span>
                      <span>{new Date(metadata.timestamp * 1000).toLocaleString()}</span>
                    </div>
                    
                    {metadata.gpsEnabled && metadata.latitude && metadata.longitude && (
                      <div className="metadata-pill">
                        <span className="metadata-icon">
                          <MdOutlineGpsFixed size={16} />
                        </span>
                        <span>{metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="action-buttons">
                <button 
                  className="action-button share-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                  disabled={isSharing}
                >
                  <IoShareSocial size={20} />
                  {isSharing ? 'Sharing...' : 'Share'}
                </button>
                <button 
                  className="action-button save-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  disabled={isSaving}
                >
                  <IoSave size={20} />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button 
                  className="action-button attest-button"
                  onClick={handleAttest}
                  disabled={isAttesting || !account || !!attestationTxHash}
                >
                  {isAttesting ? 'Attesting...' : (attestationTxHash ? 'Attested!' : 'Attest on Starknet')}
                </button>
              </div>
              {attestationError && <p className="error-message">Error: {attestationError}</p>}
              {saveError && <p className="error-message">Error: {saveError}</p>}
              {attestationTxHash && <p className="success-message">Tx: <a href={`https://sepolia.starkscan.co/tx/${attestationTxHash}`} target="_blank" rel="noopener noreferrer">{attestationTxHash.slice(0,10)}...</a></p>}
              {metadataCid && <p className="success-message">IPFS: <a href={`https://silver-chemical-parrotfish-261.mypinata.cloud/ipfs/${metadataCid}`} target="_blank" rel="noopener noreferrer">{metadataCid.slice(0,10)}...</a></p>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CaptureView; 