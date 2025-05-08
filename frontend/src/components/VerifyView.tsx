import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ImageMetadata } from './Camera';
import ImageVerifier from './ImageVerifier';
import '../styles/VerifyView.css';

const VerifyView = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setUploadedImage(reader.result);
        }
      };
      
      reader.readAsDataURL(file);
    }
  };

  const handleProofUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setProofFile(file);
      
      // Read the file to extract metadata
      const reader = new FileReader();
      
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          try {
            const proofData = JSON.parse(reader.result);
            if (proofData.metadata) {
              setMetadata(proofData.metadata);
            }
          } catch (error) {
            console.error('Failed to parse proof file:', error);
          }
        }
      };
      
      reader.readAsText(file);
    }
  };

  const triggerImageUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const triggerProofUpload = () => {
    if (proofInputRef.current) {
      proofInputRef.current.click();
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
              </div>
            )}
          </div>

          <div className="upload-proof-section">
            <h2>Upload Proof</h2>
            <input
              type="file"
              accept=".json"
              onChange={handleProofUpload}
              ref={proofInputRef}
              className="file-input"
            />
            <button 
              onClick={triggerProofUpload}
              className="upload-button proof-button"
            >
              Select Proof File
            </button>
            
            {proofFile && (
              <div className="proof-info">
                <p>Proof file loaded: {proofFile.name}</p>
              </div>
            )}
          </div>
        </div>

        {uploadedImage && proofFile && (
          <div className="verification-section">
            <ImageVerifier
              imageData={uploadedImage}
              metadata={metadata}
              proofFile={proofFile}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyView; 