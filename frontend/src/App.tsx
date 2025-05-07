import { useState } from 'react'
import './App.css'
import Camera, { type ImageMetadata } from './components/Camera'
import ImageVerifier from './components/ImageVerifier'

function App() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null)

  const handleCapture = (imageData: string, imageMetadata: ImageMetadata) => {
    setCapturedImage(imageData)
    setMetadata(imageMetadata)
  }

  return (
    <div className="app-container">
      <header>
        <h1>TruLens: Verified Photo Capture</h1>
        <p>Capture photos with cryptographic proof of authenticity</p>
      </header>

      <main>
        <div className="image-capture-section">
          <h2>Image Capture</h2>
          <Camera onCapture={handleCapture} />
        </div>

        {capturedImage && (
          <div className="captured-image-container">
            <h2>Captured Image</h2>
            <img
              src={capturedImage}
              alt="Captured"
              className="captured-image"
            />
          </div>
        )}

        <div className="verification-section">
          <ImageVerifier
            imageData={capturedImage}
            metadata={metadata}
          />
        </div>
      </main>

      <footer>
        <p>&copy; {new Date().getFullYear()} TruLens - Noir ZK hackathon project</p>
      </footer>
    </div>
  )
}

export default App
