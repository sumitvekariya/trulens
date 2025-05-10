import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import LandingPage from './components/LandingPage'
import CaptureView from './components/CaptureView'
import VerifyView from './components/VerifyView'
import WalletConnect from './components/WalletConnect'

function App() {
  return (
    <Router>
      <div className="app-container">
        <WalletConnect />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/capture" element={<CaptureView />} />
          <Route path="/verify" element={<VerifyView />} />
        </Routes>
        
        <footer>
          <p>&copy; {new Date().getFullYear()} TruLens - Noir ZK hackathon project</p>
        </footer>
      </div>
    </Router>
  )
}

export default App
