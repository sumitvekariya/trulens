import { useCallback, useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { IoFlash, IoFlashOutline, IoCameraReverse } from 'react-icons/io5';
import { MdOutlineGpsFixed } from 'react-icons/md';

interface CameraProps {
  onCapture: (imageData: string, metadata: ImageMetadata) => void;
}

export interface ImageMetadata {
  timestamp: number;
  deviceId: string;
  latitude?: number;
  longitude?: number;
  gpsEnabled: boolean;
}

const Camera = ({ onCapture }: CameraProps) => {
  const webcamRef = useRef<Webcam>(null);
  const [isGpsEnabled, setIsGpsEnabled] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<GeolocationPosition | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [flashMode, setFlashMode] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const gpsWatchIdRef = useRef<number | null>(null);

  // Set up GPS watching effect
  useEffect(() => {
    if (isGpsEnabled) {
      // Start watching position when GPS is enabled
      if (navigator.geolocation) {
        // Get initial position
        navigator.geolocation.getCurrentPosition(
          (position) => setGpsPosition(position),
          (error) => console.error('Error getting location:', error)
        );
        
        // Set up continuous watching
        const watchId = navigator.geolocation.watchPosition(
          (position) => setGpsPosition(position),
          (error) => console.error('Error watching location:', error),
          { enableHighAccuracy: true }
        );
        
        gpsWatchIdRef.current = watchId;
      } else {
        console.error('Geolocation is not supported by this browser.');
        setIsGpsEnabled(false);
      }
    } else {
      // Clear position watching when GPS is disabled
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      setGpsPosition(null);
    }
    
    // Cleanup on component unmount
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, [isGpsEnabled]);

  // Toggle GPS functionality
  const toggleGps = () => {
    setIsGpsEnabled(!isGpsEnabled);
  };

  // Switch between front and back cameras
  const toggleCamera = () => {
    setFacingMode(prevMode => prevMode === "user" ? "environment" : "user");
  };

  // Toggle flash mode (simulated)
  const toggleFlash = () => {
    const newState = !flashMode;
    setFlashMode(newState);
    
    if (newState) {
      console.log('Flash enabled');
      // Add any additional flash enabling logic here
    } else {
      console.log('Flash disabled');
      // Ensure flash is completely disabled
    }
  };

  // Generate a consistent device ID using browser fingerprinting
  const getDeviceId = useCallback(() => {
    // This is a simple implementation - in production you'd want a more robust fingerprinting solution
    const userAgent = navigator.userAgent;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const colorDepth = window.screen.colorDepth;
    
    // Create a simple hash of these values
    const deviceIdString = `${userAgent}|${screenWidth}|${screenHeight}|${colorDepth}`;
    let hash = 0;
    for (let i = 0; i < deviceIdString.length; i++) {
      const char = deviceIdString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  }, []);

  const captureImage = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;
      
      // Create metadata object
      const metadata: ImageMetadata = {
        timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        deviceId: getDeviceId(),
        gpsEnabled: isGpsEnabled,
      };
      
      // Add GPS coordinates if available
      if (isGpsEnabled && gpsPosition) {
        metadata.latitude = gpsPosition.coords.latitude;
        metadata.longitude = gpsPosition.coords.longitude;
      }
      
      onCapture(imageSrc, metadata);
    }
  }, [webcamRef, isGpsEnabled, gpsPosition, getDeviceId, onCapture]);

  // On camera ready
  const handleUserMedia = () => {
    setCameraReady(true);
  };

  return (
    <div className={`camera-container ${flashMode ? 'flash-active' : ''}`}>
      {/* Flash overlay */}
      {flashMode && <div className="flash-overlay"></div>}
      
      {/* Camera stream */}
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{
          facingMode: facingMode,
          aspectRatio: 4/3
        }}
        className="webcam"
        onUserMedia={handleUserMedia}
      />
      
      {/* Camera interface overlay */}
      <div className="camera-interface">
        {/* Top controls */}
        <div className="top-controls">
          <button 
            className={`camera-control-button ${flashMode ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFlash();
            }}
            aria-label={flashMode ? "Disable flash" : "Enable flash"}
          >
            {flashMode ? 
              <IoFlash size={26} color="#D4AF37" /> 
              : 
              <IoFlashOutline size={26} color="white" />
            }
          </button>
          
          <button 
            className={`camera-control-button ${isGpsEnabled ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleGps();
            }}
            aria-label={isGpsEnabled ? "Disable location" : "Enable location"}
          >
            <MdOutlineGpsFixed 
              size={26} 
              color={isGpsEnabled ? "#D4AF37" : "white"}
            />
            {isGpsEnabled && <span className="control-indicator"></span>}
          </button>
          
          <button 
            className="camera-control-button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCamera();
            }}
            aria-label="Switch camera"
          >
            <IoCameraReverse size={26} color="white" />
          </button>
        </div>
        
        {/* GPS indicator (when enabled) */}
        {isGpsEnabled && gpsPosition && (
          <div className="gps-indicator">
            <MdOutlineGpsFixed size={22} color="#D4AF37" />
            <span>{gpsPosition.coords.latitude.toFixed(4)}, {gpsPosition.coords.longitude.toFixed(4)}</span>
          </div>
        )}
        
        {/* Center shutter button */}
        <div className="center-controls">
          <button 
            onClick={captureImage} 
            className="capture-button"
            disabled={!cameraReady}
            aria-label="Capture photo"
          >
            <div className="capture-button-inner"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Camera; 