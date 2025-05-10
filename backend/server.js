import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { sha256 } from 'crypto-hash';
import EC from 'elliptic';
import pinataService from './pinata-service.js'; // Use Pinata instead of Helia
import noirService from './noir-service.js'; // Import our Noir service
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import util from 'util';

// Load environment variables
dotenv.config();

// Get current file directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const ec = new EC.ec('secp256k1');

// In-memory store for truncated hash to original CID mapping
const cidMap = new Map();
const CID_MAP_FILE = path.join(__dirname, 'cid_mapping.json');

// Load existing CID mappings from file if it exists
try {
  if (fs.existsSync(CID_MAP_FILE)) {
    const savedMappings = JSON.parse(fs.readFileSync(CID_MAP_FILE, 'utf-8'));
    Object.entries(savedMappings).forEach(([key, value]) => {
      cidMap.set(key, value);
    });
    console.log(`Loaded ${cidMap.size} CID mappings from file`);
  }
} catch (error) {
  console.warn('Failed to load CID mappings from file:', error);
}

// Add logging to file for debugging
const logFile = fs.createWriteStream('./debug.log', { flags: 'a' });

// Redirect console output to log file
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function() {
  const args = Array.from(arguments);
  originalConsoleLog.apply(console, args); // Original stdout output
  logFile.write(util.format.apply(null, args) + '\n'); // File output
};

console.warn = function() {
  const args = Array.from(arguments);
  originalConsoleWarn.apply(console, args); // Original stderr output
  logFile.write('WARN: ' + util.format.apply(null, args) + '\n'); // File output
};

console.error = function() {
  const args = Array.from(arguments);
  originalConsoleError.apply(console, args); // Original stderr output
  logFile.write('ERROR: ' + util.format.apply(null, args) + '\n'); // File output
};

// Add timestamp to log file
console.log(`\n\n===== DEBUG LOG STARTED AT ${new Date().toISOString()} =====\n`);

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
const keyPair = ec.genKeyPair();
const publicKey = keyPair.getPublic('hex');
console.log('Local verification system initialized');

// Initialize Pinata service on startup
pinataService.initialize().then(initialized => {
  if (initialized) {
    console.log('✅ Pinata service initialized successfully');
  } else {
    console.warn('⚠️ Pinata service not initialized. IPFS storage will be unavailable.');
    console.warn('Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables.');
  }
}).catch(err => {
  console.error('❌ Failed to initialize Pinata service:', err);
});

// Initialize Noir service on startup
noirService.initialize('@circuits').then(initialized => {
  if (initialized) {
    console.log('✅ Noir service initialized successfully');
  } else {
    console.warn('⚠️ Noir service not initialized. ZK proof generation will be unavailable.');
  }
}).catch(err => {
  console.error('❌ Failed to initialize Noir service:', err);
});

// Utility function to create metadata object
function createMetadata(req) {
  const { latitude, longitude, deviceId, timestamp } = req.body;
  
  return {
    latitude: parseFloat(latitude) || 0,
    longitude: parseFloat(longitude) || 0,
    deviceId: deviceId || 'unknown',
    timestamp: timestamp || Math.floor(Date.now() / 1000),
    imageFilename: req.file ? req.file.filename : 'unknown'
  };
}

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
    
    // Create metadata object
    const metadata = createMetadata(req);
    
    // Try to store metadata on IPFS via Pinata
    let metadataCid = null;
    let metadataHash = null;
    let ipfsEnabled = await pinataService.ensureInitialized();
    
    if (ipfsEnabled) {
      console.log('Storing metadata on Pinata IPFS:', metadata);
      const ipfsResult = await pinataService.storeJSON(metadata);
      
      if (ipfsResult.success) {
        metadataCid = ipfsResult.cid;
        console.log('Metadata stored on IPFS with CID:', metadataCid);
        
        // For verification, we hash the CID to get a hex value compatible with Starknet felts
        metadataHash = await sha256(metadataCid);
      } else {
        console.warn('Failed to store on IPFS, proceeding with local storage only:', ipfsResult.error);
      }
    } else {
      console.warn('IPFS storage disabled due to missing Pinata credentials');
    }
      
    // Create local signature
    const message = imageHash + (metadataHash || '');
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
      metadataCid,
      metadata,
      ...attestationResult,
      publicKey,
      ipfsEnabled
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
      metadataCid,
      metadataHash,
      ipfsEnabled,
      ...proofData
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
        // If we have the metadataCid, retrieve the metadata from IPFS via Pinata
        let verifiedMetadata = proofData.metadata;
        let ipfsSuccess = false;
        let usedGateway = null;
        
        if (proofData.metadataCid) {
          console.log('Retrieving metadata from IPFS using CID:', proofData.metadataCid);
          const ipfsResult = await pinataService.retrieveJSON(proofData.metadataCid);
          
          if (ipfsResult.success) {
            verifiedMetadata = ipfsResult.data;
            ipfsSuccess = true;
            usedGateway = ipfsResult.gateway;
            console.log('Retrieved metadata from IPFS:', verifiedMetadata);
          } else {
            console.warn('Failed to retrieve metadata from IPFS, using stored metadata:', ipfsResult.error);
          }
        }
        
        // Verify signature
        const message = proofData.imageHash + (proofData.metadataHash || '');
            const key = ec.keyFromPublic(proofData.publicKey, 'hex');
            const isValid = key.verify(message, proofData.signature);
            
            return res.json({
              verified: isValid,
          metadata: verifiedMetadata,
          metadataCid: proofData.metadataCid || null,
          ipfsSuccess,
          usedGateway,
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
      
    // Check IPFS service status
    const ipfsEnabled = await pinataService.ensureInitialized();
      
    return res.json({ 
      totalAttestations: proofFiles.length,
      ipfsEnabled,
      source: 'local'
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get metadata from IPFS by CID via Pinata
app.get('/api/ipfs/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    
    if (!cid) {
      return res.status(400).json({ error: 'No CID provided' });
    }
    
    // Check if IPFS service is initialized
    const ipfsEnabled = await pinataService.ensureInitialized();
    if (!ipfsEnabled) {
      return res.status(503).json({
        success: false,
        error: 'IPFS service not available. Please configure Pinata API credentials.'
      });
    }
    
    console.log('Retrieving data from IPFS with CID:', cid);
    const result = await pinataService.retrieveJSON(cid);
    
    if (result.success) {
      return res.json({ 
        success: true,
        data: result.data,
        gateway: result.gateway
      });
    } else {
      return res.status(404).json({
        success: false,
        error: result.error || 'Failed to retrieve data from IPFS'
      });
    }
  } catch (error) {
    console.error('Error retrieving from IPFS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint to check if Pinata is configured
app.get('/api/status', async (req, res) => {
  try {
    const ipfsEnabled = await pinataService.ensureInitialized();
    
    res.json({
      status: 'ok',
      ipfsEnabled,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new endpoint to look up CID by metadata hash
app.get('/api/lookup-hash/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    if (!hash) {
      return res.status(400).json({ error: 'No hash provided' });
    }
    
    // Find proofs with this metadata hash
      const proofFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
        .filter(f => f.endsWith('.proof.json'));
      
    for (const proofFile of proofFiles) {
      const proofData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'uploads', proofFile), 'utf-8')
      );
      
      if (proofData.metadataHash === hash) {
        console.log(`Found matching proof for metadata hash ${hash}:`, proofFile);
      return res.json({ 
          success: true,
          metadataCid: proofData.metadataCid,
        source: 'local'
      });
    }
    }
    
    // No matching record found
    return res.status(404).json({
      success: false,
      error: 'No record found for this metadata hash'
    });
  } catch (error) {
    console.error('Error looking up hash:', error);
    res.status(500).json({ error: error.message });
  }
});
    
// Add endpoint to scan all proofs for a specific hash pattern
app.get('/api/scan-proofs/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    if (!hash) {
      return res.status(400).json({ error: 'No hash provided' });
    }
    
    // This endpoint allows for more flexible matching (e.g., partial matches or different formats)
      const proofFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
        .filter(f => f.endsWith('.proof.json'));
      
    // Return all proofs that might match
    const matches = [];
    
    for (const proofFile of proofFiles) {
      const proofData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'uploads', proofFile), 'utf-8')
      );
      
      // Check for exact match first
      if (proofData.metadataHash === hash) {
        return res.json({
          success: true,
          metadataCid: proofData.metadataCid,
          source: 'exact_match'
        });
      }
      
      // Check for numeric value match (e.g., if the hash is a big integer)
      if (proofData.metadataHash && hash.includes('n')) {
        const numericHash = hash.replace('n', '');
        if (proofData.metadataHash.includes(numericHash)) {
          matches.push({
            file: proofFile,
            cid: proofData.metadataCid,
            hash: proofData.metadataHash
          });
        }
      }
    }
    
    if (matches.length > 0) {
      // Use the first match
      console.log(`Found ${matches.length} approximate matches for hash ${hash}`);
      return res.json({ 
        success: true,
        metadataCid: matches[0].cid,
        matches: matches,
        source: 'partial_match'
      });
    }
    
    // No matches found
    return res.status(404).json({
      success: false,
      error: 'No matching proofs found for this hash pattern'
      });
  } catch (error) {
    console.error('Error scanning proofs:', error);
      res.status(500).json({ error: error.message });
    }
});

// New endpoint to store truncated hash to original CID mapping
app.post('/api/map_cid', (req, res) => {
  const { truncatedMetadataCidHash, originalMetadataCid } = req.body;
  if (!truncatedMetadataCidHash || !originalMetadataCid) {
    return res.status(400).json({ error: 'Missing truncatedMetadataCidHash or originalMetadataCid' });
  }
  cidMap.set(truncatedMetadataCidHash, originalMetadataCid);
  
  // Save to file
  try {
    const mappings = Object.fromEntries(cidMap);
    fs.writeFileSync(CID_MAP_FILE, JSON.stringify(mappings, null, 2));
    console.log(`Stored mapping: ${truncatedMetadataCidHash} -> ${originalMetadataCid}`);
    res.status(200).json({ success: true, message: 'CID mapping stored' });
  } catch (error) {
    console.error('Failed to save CID mapping to file:', error);
    res.status(500).json({ error: 'Failed to persist CID mapping' });
  }
});

// New endpoint to retrieve original CID by truncated hash
app.get('/api/get_cid/:truncatedHash', (req, res) => {
  const { truncatedHash } = req.params;
  if (!truncatedHash) {
    return res.status(400).json({ error: 'Missing truncatedHash parameter' });
  }
  const originalCid = cidMap.get(truncatedHash);
  if (originalCid) {
    res.status(200).json({ success: true, originalCid });
  } else {
    res.status(404).json({ success: false, message: 'No mapping found for this hash' });
  }
});

// Generate ZK proof for time and location verification
app.post('/api/generate-proof', async (req, res) => {
  try {
    let { 
      imageHash, 
      timestamp, 
      deviceId, 
      latitude, 
      longitude, 
      gpsEnabled, 
      signature, 
      publicKey,
      bounds // Expect bounds as an object: { minTimestampBound, ... }
    } = req.body;

    if (!imageHash) {
      return res.status(400).json({ error: 'Image hash is required' });
    }

    if (!timestamp) {
      return res.status(400).json({ error: 'Timestamp is required' });
    }

    // Make location coordinates optional - only check if gpsEnabled is true
    if (gpsEnabled === true && (latitude === undefined || longitude === undefined)) {
      return res.status(400).json({ error: 'Location coordinates are required when GPS is enabled' });
    }

    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    // publicKey might still be needed by the circuit ABI, pass it along
    // if (!publicKey || (!publicKey.x && !publicKey.y)) {
    //   return res.status(400).json({ error: 'Public key is required (x and y coordinates)' });
    // }
    
    // Ensure numeric values are properly handled
    timestamp = Number(timestamp);
    deviceId = deviceId ? Number(deviceId) : 0; // deviceId is passed, noir-service might use it if in ABI
    latitude = latitude !== undefined ? parseFloat(latitude) : 0; // Pass as float, noir-service scales
    longitude = longitude !== undefined ? parseFloat(longitude) : 0; // Pass as float, noir-service scales
    
    // Ensure imageHash is in the right format (without 0x prefix)
    if (typeof imageHash === 'string' && imageHash.startsWith('0x')) {
      imageHash = imageHash.substring(2);
    }
    
    // Prepare parameters for noirService, mapping names and flattening bounds
    const noirParams = {
      verifierImageHash: imageHash, // Map imageHash
      signedImageHash: imageHash,   // Map imageHash
      timestamp: Number(timestamp),
      deviceId, // Pass along, _formatInputsBasedOnAbi will use if in ABI
      latitude,  // Pass raw, noir-service will scale
      longitude, // Pass raw, noir-service will scale
      gpsEnabled: !!gpsEnabled,
      imageSignature: signature, // Map signature
      publicKey, // Pass along, _formatInputsBasedOnAbi will use if in ABI
      ...(bounds && { // Spread bound properties if bounds object exists
        minTimestampBound: bounds.minTimestampBound,
        maxTimestampBound: bounds.maxTimestampBound,
        minLatitudeBound: bounds.minLatitudeBound,
        maxLatitudeBound: bounds.maxLatitudeBound,
        minLongitudeBound: bounds.minLongitudeBound,
        maxLongitudeBound: bounds.maxLongitudeBound,
      })
    };
    
    // Log the inputs for debugging
    console.log('Generating proof with inputs for noirService:', JSON.stringify(noirParams, (_, v) =>
      typeof v === 'bigint' ? v.toString() :
      typeof v === 'string' && v.length > 20 ? v.substring(0, 20) + '...' : v
    ));

    // Generate the time and location proof
    const proofResult = await noirService.generateTimeLocationProof(noirParams);

    res.json(proofResult);
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Verify an image's time and location using ZK proofs
app.post('/api/verify-time-location', upload.single('image'), async (req, res) => {
  try {
    // Either get the image hash from the request or calculate it from the uploaded image
    let imageHash = req.body.imageHash;
    
    if (!imageHash && !req.file) {
      return res.status(400).json({ error: 'Either image or image hash is required' });
    }
    
    // If image was uploaded, calculate its hash
    if (req.file) {
      const imageBuffer = fs.readFileSync(req.file.path);
      imageHash = await sha256(imageBuffer);
    }
    
    // Get bounds from request or use defaults - these are passed to noirService
    const requestBounds = {
      minTimestampBound: req.body.minTimestamp ? parseInt(req.body.minTimestamp) : undefined,
      maxTimestampBound: req.body.maxTimestamp ? parseInt(req.body.maxTimestamp) : undefined,
      minLatitudeBound: req.body.minLatitude ? parseFloat(req.body.minLatitude) : undefined, // Expecting float for bounds too
      maxLatitudeBound: req.body.maxLatitude ? parseFloat(req.body.maxLatitude) : undefined,
      minLongitudeBound: req.body.minLongitude ? parseFloat(req.body.minLongitude) : undefined,
      maxLongitudeBound: req.body.maxLongitude ? parseFloat(req.body.maxLongitude) : undefined
    };
    
    // Look for attestation with matching image hash
    const proofFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
      .filter(f => f.endsWith('.proof.json'));
    
    for (const proofFile of proofFiles) {
      const proofData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'uploads', proofFile), 'utf-8')
      );
      
      if (proofData.imageHash === imageHash) {
        // We found a matching attestation, now generate a ZK proof to verify time and location
        // noir-service expects raw lat/lon, it will scale them.
        const rawLatitude = proofData.metadata?.latitude || 0;
        const rawLongitude = proofData.metadata?.longitude || 0;
        
        const noirParams = {
          verifierImageHash: imageHash, // Map imageHash
          signedImageHash: imageHash,   // Map imageHash
          timestamp: proofData.metadata?.timestamp || Math.floor(Date.now() / 1000),
          deviceId: proofData.metadata?.deviceId || 0, // Pass along
          latitude: rawLatitude, // Pass raw float, noir-service will scale
          longitude: rawLongitude, // Pass raw float, noir-service will scale
          gpsEnabled: true, // As per original logic for this endpoint
          imageSignature: proofData.signature, // Map signature
          publicKey: { // Pass along as object, noir-service might handle if ABI expects complex type
            x: proofData.publicKey.slice(0, 64),
            y: proofData.publicKey.slice(64)
          },
          // Spread requestBounds properties
          ...(requestBounds.minTimestampBound !== undefined && {minTimestampBound: requestBounds.minTimestampBound}),
          ...(requestBounds.maxTimestampBound !== undefined && {maxTimestampBound: requestBounds.maxTimestampBound}),
          ...(requestBounds.minLatitudeBound !== undefined && {minLatitudeBound: requestBounds.minLatitudeBound}),
          ...(requestBounds.maxLatitudeBound !== undefined && {maxLatitudeBound: requestBounds.maxLatitudeBound}),
          ...(requestBounds.minLongitudeBound !== undefined && {minLongitudeBound: requestBounds.minLongitudeBound}),
          ...(requestBounds.maxLongitudeBound !== undefined && {maxLongitudeBound: requestBounds.maxLongitudeBound}),
        };
        
        console.log('Verifying time/location with inputs for noirService:', JSON.stringify(noirParams, (_, v) =>
            typeof v === 'bigint' ? v.toString() :
            typeof v === 'string' && v.length > 20 ? v.substring(0, 20) + '...' : v
        ));

        const proofResult = await noirService.generateTimeLocationProof(noirParams);
        
        return res.json({
          verified: proofResult.success && proofResult.verified,
          attestation: proofData,
          proofResult,
          message: proofResult.verified 
            ? 'The image was captured within the specified time and location constraints'
            : 'The image was not captured within the specified constraints'
        });
      }
    }
    
    // No matching attestation found
    return res.status(404).json({
      verified: false,
      message: 'No attestation found for this image'
    });
  } catch (error) {
    console.error('Error verifying time and location:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Clean up resources when shutting down
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  try {
    // Save CID mappings before shutdown
    const mappings = Object.fromEntries(cidMap);
    fs.writeFileSync(CID_MAP_FILE, JSON.stringify(mappings, null, 2));
    console.log(`Saved ${cidMap.size} CID mappings to file`);
    
    await pinataService.shutdown();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 