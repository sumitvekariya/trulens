const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { sha256 } = require('crypto-hash');
const EC = require('elliptic').ec;

const app = express();
const port = 3000;

// CORS middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Setup file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Generate ECDSA key pair for image signing
const ec = new EC('secp256k1');
const keyPair = ec.genKeyPair();
const publicKey = keyPair.getPublic('hex');
console.log('Local verification system initialized');

// Upload and verify an image
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imageFilepath = req.file.path;
    const imageBuffer = fs.readFileSync(imageFilepath);
    
    // Generate image hash
    const imageHash = await sha256(imageBuffer);
    
    // Get metadata from request
    const { latitude, longitude, deviceId, timestamp } = req.body;
    
    // Create metadata object
    const metadata = {
      latitude: parseFloat(latitude) || 0,
      longitude: parseFloat(longitude) || 0,
      deviceId: deviceId || 'unknown',
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      imageFilename: req.file.filename
    };
    
    // Hash the metadata
    const metadataHash = await sha256(JSON.stringify(metadata));
    
    // Create local signature
    const message = imageHash + metadataHash;
    const signature = keyPair.sign(message).toDER('hex');
    
    const attestationResult = {
      success: true,
      txHash: 'local-' + crypto.randomBytes(32).toString('hex'),
      timestamp: metadata.timestamp,
      signature
    };
    
    // Store proof locally
    const proofData = {
      imageHash,
      metadataHash,
      metadata,
      ...attestationResult,
      publicKey
    };
    
    const proofFilename = `${req.file.filename}.proof.json`;
    fs.writeFileSync(
      path.join(__dirname, 'uploads', proofFilename),
      JSON.stringify(proofData, null, 2)
    );
    
    res.json({
      success: true,
      imageUrl: `/uploads/${req.file.filename}`,
      proofUrl: `/uploads/${proofFilename}`,
      ...proofData
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify an image attestation
app.post('/api/verify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file && !req.body.imageHash) {
      return res.status(400).json({ error: 'No image or image hash provided' });
    }

    let imageHash = req.body.imageHash;
    
    // If image was uploaded, calculate its hash
    if (req.file) {
      const imageBuffer = fs.readFileSync(req.file.path);
      imageHash = await sha256(imageBuffer);
    }
    
    // Try to find local proof file
    const proofFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
      .filter(f => f.endsWith('.proof.json'));
    
    for (const proofFile of proofFiles) {
      const proofData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'uploads', proofFile), 'utf-8')
      );
      
      if (proofData.imageHash === imageHash) {
        // Verify signature
        const message = proofData.imageHash + proofData.metadataHash;
        const key = ec.keyFromPublic(proofData.publicKey, 'hex');
        const isValid = key.verify(message, proofData.signature);
        
        return res.json({
          verified: isValid,
          metadata: proofData.metadata,
          source: 'local'
        });
      }
    }
    
    // No matching attestation found
    return res.json({
      verified: false,
      message: 'No attestation found for this image'
    });
  } catch (error) {
    console.error('Error verifying attestation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get total attestation count
app.get('/api/stats', async (req, res) => {
  try {
    // Count local proofs
    const proofFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
      .filter(f => f.endsWith('.proof.json'));
    
    return res.json({ 
      totalAttestations: proofFiles.length,
      source: 'local'
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 