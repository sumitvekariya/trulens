import { useCallback, useRef, useState } from 'react';
import Webcam from 'react-webcam';

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

  // Set up geolocation tracking when GPS is enabled
  const toggleGps = () => {
    const newState = !isGpsEnabled;
    setIsGpsEnabled(newState);
    
    if (newState) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => setGpsPosition(position),
          (error) => console.error('Error getting location:', error)
        );
      } else {
        console.error('Geolocation is not supported by this browser.');
        setIsGpsEnabled(false);
      }
    } else {
      setGpsPosition(null);
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

  return (
    <div className="camera-container">
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{
          width: 720,
          height: 480,
          facingMode: "environment" // Use rear camera on mobile devices
        }}
        className="webcam"
      />
      
      <div className="camera-controls">
        <div className="gps-toggle">
          <label>
            <input
              type="checkbox"
              checked={isGpsEnabled}
              onChange={toggleGps}
            />
            Enable GPS Location
          </label>
          {isGpsEnabled && gpsPosition && (
            <div className="gps-coordinates">
              Lat: {gpsPosition.coords.latitude.toFixed(6)}, 
              Lng: {gpsPosition.coords.longitude.toFixed(6)}
            </div>
          )}
        </div>
        
        <button onClick={captureImage} className="capture-button">
          Capture Photo
        </button>
      </div>
    </div>
  );
};

export default Camera; 