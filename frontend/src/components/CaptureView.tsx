import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Camera, { type ImageMetadata } from './Camera';
import ImageVerifier from './ImageVerifier';
import '../styles/CaptureView.css';

// Import icons from react-icons
import { IoArrowBack, IoClose, IoShareSocial, IoSave, IoCalendarOutline } from 'react-icons/io5';
import { MdOutlineGpsFixed } from 'react-icons/md';

const CaptureView = () => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [processingView, setProcessingView] = useState(false);
  const navigate = useNavigate();

  const handleCapture = (imageData: string, imageMetadata: ImageMetadata) => {
    setCapturedImage(imageData);
    setMetadata(imageMetadata);
    setShowControls(false);
    
    // Show processing animation briefly
    setProcessingView(true);
    setTimeout(() => {
      setProcessingView(false);
    }, 1500);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setMetadata(null);
    setShowControls(true);
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
              
              <div className="verification-container">
                <ImageVerifier
                  imageData={capturedImage}
                  metadata={metadata}
                />
              </div>
              
              <div className="action-buttons">
                <button 
                  className="action-button share-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Share functionality
                  }}
                >
                  <IoShareSocial size={20} color="#D4AF37" />
                  Share
                </button>
                <button 
                  className="action-button save-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Save functionality
                  }}
                >
                  <IoSave size={20} color="#D4AF37" />
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CaptureView; 