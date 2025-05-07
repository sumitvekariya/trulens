const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Node.js crypto module
const { Noir } = require('@noir-lang/noir_js');
const { UltraHonkBackend } = require('@aztec/bb.js');
const elliptic = require('elliptic'); // Add this for ECDSA
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize ECDSA with secp256k1 curve (same as used by Noir)
const ec = new elliptic.ec('secp256k1');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Load the Noir circuit
const circuitPath = path.join(__dirname, '../shared/compiled_circuit/trulens.json');
let circuitData;
try {
  circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
  console.log('Circuit loaded successfully');
} catch (error) {
  console.error('Failed to load circuit:', error);
  process.exit(1);
}

// In-memory database for attestations (replace with a real DB in production)
const attestations = [];

// Helper function to convert a u64 to bytes array in little-endian format
function u64ToBytes(value) {
  const buffer = Buffer.alloc(8);
  // Handle BigInt or Number
  const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
  buffer.writeBigUInt64LE(bigIntValue, 0);
  return buffer;
}

// Helper function to convert an i64 to bytes array
function i64ToBytes(value) {
  const buffer = Buffer.alloc(8);
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  // Write as unsigned and set sign bit if negative
  buffer.writeBigUInt64LE(BigInt(absValue), 0);
  
  if (isNegative) {
    // Set the sign bit (most significant bit)
    buffer[7] = buffer[7] | 0x80;
  }
  
  return buffer;
}

// Generate the attestation hash in the same way as the Noir circuit
function generateAttestationHash(imageHash, timestamp, deviceId, latitude, longitude, gpsEnabled) {
  // Create a buffer to hold all the data (same size as in Noir)
  const dataBuffer = Buffer.alloc(128, 0);
  let index = 0;
  
  // Add image hash
  imageHash.copy(dataBuffer, index);
  index += 32;
  
  // Add timestamp
  u64ToBytes(timestamp).copy(dataBuffer, index);
  index += 8;
  
  // Add device ID
  u64ToBytes(deviceId).copy(dataBuffer, index);
  index += 8;
  
  // Add GPS data if enabled
  if (gpsEnabled) {
    // Add latitude and longitude
    i64ToBytes(latitude).copy(dataBuffer, index);
    index += 8;
    
    i64ToBytes(longitude).copy(dataBuffer, index);
    index += 8;
  }
  
  // Add GPS flag
  dataBuffer[index] = gpsEnabled ? 1 : 0;
  
  // Hash using SHA-256
  return crypto.createHash('sha256').update(dataBuffer).digest();
}

// A special endpoint to verify against the Noir circuit 
app.post('/api/verify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.body.metadata) {
      return res.status(400).json({ success: false, message: 'Missing image or metadata' });
    }

    const metadata = JSON.parse(req.body.metadata);
    
    // Hash the image
    const imageData = fs.readFileSync(req.file.path);
    const imageHash = crypto.createHash('sha256').update(imageData).digest();
    const imageHashArray = Array.from(imageHash).map(byte => Number(byte));
    
    // Format values for Noir
    const deviceId = BigInt(metadata.deviceId || 0);
    const timestamp = BigInt(metadata.timestamp || Math.floor(Date.now() / 1000));
    const latitude = Math.floor((metadata.latitude || 0) * 1000000);
    const longitude = Math.floor((metadata.longitude || 0) * 1000000);
    const gpsEnabled = Boolean(metadata.gpsEnabled);
    
    // Generate the attestation hash on the server for validation
    const attestationHash = generateAttestationHash(
      imageHash,
      timestamp,
      deviceId,
      latitude, 
      longitude,
      gpsEnabled
    );
    
    // Verify that client-generated attestation hash matches server-generated one
    const clientAttestationHashArray = metadata.attestationHash || [];
    const clientAttestationHash = Buffer.from(clientAttestationHashArray);
    
    if (!attestationHash.equals(clientAttestationHash)) {
      return res.status(400).json({
        success: false,
        message: 'Attestation hash mismatch between client and server',
        serverHash: attestationHash.toString('hex'),
        clientHash: clientAttestationHash.toString('hex')
      });
    }
    
    try {
      console.log("Executing Noir circuit for verification");
      
      // Use signature and public key from client
      const noir = new Noir(circuitData);
      const backend = new UltraHonkBackend(circuitData.bytecode);
      
      const testInput = {
        image_hash: imageHashArray,
        timestamp: timestamp.toString(),
        device_id: deviceId.toString(),
        latitude: latitude,
        longitude: longitude,
        gps_enabled: gpsEnabled,
        // Use client-generated signature and public key
        signature: metadata.signature || [],
        public_key_x: metadata.publicKeyX || [],
        public_key_y: metadata.publicKeyY || [],
        attestation_hash: Array.from(attestationHash)
      };
      
      // Debug: Log the test input summary (truncated)
      console.log("Test input:", JSON.stringify({
        timestamp: testInput.timestamp,
        device_id: testInput.device_id,
        latitude: testInput.latitude,
        longitude: testInput.longitude,
        gps_enabled: testInput.gps_enabled,
        // Truncate arrays for readability
        image_hash_length: testInput.image_hash.length,
        signature_length: testInput.signature.length,
        public_key_x_length: testInput.public_key_x.length,
        public_key_y_length: testInput.public_key_y.length,
        attestation_hash_length: testInput.attestation_hash.length
      }));
      
      try {
        const { witness } = await noir.execute(testInput);
        const proof = await backend.generateProof(witness);
        const isValid = await backend.verifyProof(proof);
        
        console.log("Noir circuit execution successful:", isValid);
        
        // Store the attestation
        const attestationId = crypto.randomBytes(16).toString('hex');
        attestations.push({
          id: attestationId,
          imageHash: imageHash.toString('hex'),
          attestationHash: attestationHash.toString('hex'),
          timestamp: Number(timestamp),
          deviceId: Number(deviceId),
          verified: isValid
        });
        
        return res.json({
          success: true,
          attestationId,
          attestationHash: attestationHash.toString('hex'),
          verified: isValid,
          message: 'Image verification successful'
        });
      } catch (noirError) {
        console.error("Noir circuit error:", noirError);
        return res.status(400).json({
          success: false,
          message: `Noir circuit error: ${noirError.message}`,
          error: noirError.toString()
        });
      }
    } catch (error) {
      console.error("Test error:", error);
      return res.status(500).json({
        success: false,
        message: `Test error: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      success: false,
      message: `Error during verification: ${error.message}`
    });
  }
});

// Endpoint to retrieve an attestation
app.get('/api/attestation/:id', (req, res) => {
  const attestation = attestations.find(a => a.id === req.params.id);
  
  if (!attestation) {
    return res.status(404).json({ success: false, message: 'Attestation not found' });
  }
  
  return res.json({ success: true, attestation });
});

// List all attestations (useful for debugging)
app.get('/api/attestations', (req, res) => {
  return res.json({
    success: true,
    count: attestations.length,
    attestations
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 