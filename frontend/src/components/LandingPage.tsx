import { useNavigate } from 'react-router-dom';
import '../styles/LandingPage.css';
import { useEffect, useState } from 'react';

const LandingPage = () => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  
  useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="landing-container">
      <div className="hero-section">
        <div className="hero-content">
          <div className={`logo-container ${loaded ? 'logo-loaded' : ''}`}>
            <img src="/images/logo.png" alt="TruLens Logo" className="logo-image" />
            <h1 className="logo-text">TruLens</h1>
          </div>
          <p className="tagline">Truth needs proof</p>
          <p className="tagline-extended">In journalism. In citizen reporting. In art. In evidence.</p>
          
          <div className="hero-cta">
            <div className="button-container">
              <button 
                className="cta-button capture-cta" 
                onClick={() => navigate('/capture')}
              >
                Capture
              </button>
            </div>
            <div className="button-container">
              <button 
                className="cta-button verify-cta" 
                onClick={() => navigate('/verify')}
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="content-container">
        <div className="feature-card">
          <div className="feature-icon">🔒</div>
          <h3>Cryptographic Proof</h3>
          <p>Every photo is signed at the moment of capture, creating an immutable link to the device, time, and location.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🌐</div>
          <h3>On-Chain Attestation</h3>
          <p>Store a hash of the photo on-chain, creating a permanent record that can be verified by anyone.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>Verified Media</h3>
          <p>Prove a photo wasn't AI-generated, who took it, and when and where it was taken.</p>
        </div>
      </div>

      <div className="problem-solution">
        <div className="problem">
          <h2>The Problem</h2>
          <p>In a world of deepfakes and AI-generated content, the internet has lost its source of truth. No one can tell what's real anymore.</p>
        </div>
        
        <div className="solution">
          <h2>Our Solution</h2>
          <p>A camera app that makes memories immutable. In journalism, citizen reporting, or sharing important moments—truth needs proof.</p>
        </div>
      </div>

      <div className="floating-cta">
        <div className="button-container-full">
          <button 
            className="cta-button capture-cta" 
            onClick={() => navigate('/capture')}
          >
            Start Capturing
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage; 