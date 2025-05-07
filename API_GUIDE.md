# Image Attestation API Guide

This document outlines how the image attestation system integrates with a mobile application and blockchain.

## System Architecture

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│           │     │           │     │           │     │           │
│  Mobile   │ ──> │  Backend  │ ──> │   ZK      │ ──> │ Blockchain│
│   App     │     │  Service  │     │ Prover    │     │           │
│           │     │           │     │           │     │           │
└───────────┘     └───────────┘     └───────────┘     └───────────┘
```

## Data Flow

1. **Image Capture**: User takes a photo with the mobile app
2. **Local Processing**:
   - App generates SHA-256 hash of the image
   - Collects metadata (timestamp, device ID, GPS if enabled)
   - Signs the combined data using the device's private key
3. **Transmission**: Data sent to backend service
4. **Proof Generation**: Backend uses Noir circuit to generate zero-knowledge proof
5. **Blockchain Storage**: Hash and proof are stored on-chain

## Mobile App Integration

### Device Setup

When a user first sets up the app:

```javascript
// Generate a new keypair for the device
const deviceKeypair = await generateECDSAKeypair();

// Register the public key with the backend
await api.registerDevice({
  deviceId: getUniqueDeviceId(),
  publicKeyX: deviceKeypair.publicKey.x,
  publicKeyY: deviceKeypair.publicKey.y,
  // Additional device metadata
  model: getDeviceModel(),
  os: getDeviceOS(),
  appVersion: getAppVersion()
});

// Store private key securely in device keychain/secure enclave
await secureStorage.storePrivateKey(deviceKeypair.privateKey);
```

### Image Capture and Attestation

When the user takes a photo:

```javascript
// Capture image and metadata
const imageData = await camera.captureImage();
const timestamp = Date.now();
const deviceId = getUniqueDeviceId();
const gpsEnabled = await permissions.isLocationEnabled();
const location = gpsEnabled ? await geoLocation.getCurrentPosition() : null;

// Hash the image
const imageHash = await crypto.sha256(imageData);

// Prepare attestation data
const attestationData = {
  imageHash,
  timestamp,
  deviceId,
  latitude: location?.coords.latitude || 0,
  longitude: location?.coords.longitude || 0,
  gpsEnabled: !!location
};

// Sign the attestation data
const privateKey = await secureStorage.getPrivateKey();
const signature = await crypto.signECDSA(
  JSON.stringify(attestationData),
  privateKey
);

// Prepare data for transmission to backend
const attestationPackage = {
  ...attestationData,
  signature: {
    r: signature.r,
    s: signature.s
  },
  publicKey: {
    x: deviceKeypair.publicKey.x,
    y: deviceKeypair.publicKey.y
  }
};

// Send to backend
const receipt = await api.submitAttestation(attestationPackage);

// Store receipt (contains blockchain transaction ID)
await storage.saveReceipt(imageData, receipt);
```

## Backend API Endpoints

### Device Registration

```
POST /api/devices/register
```

Request body:
```json
{
  "deviceId": "string",
  "publicKeyX": "hex string",
  "publicKeyY": "hex string",
  "model": "string",
  "os": "string",
  "appVersion": "string"
}
```

Response:
```json
{
  "success": true,
  "deviceUuid": "string"
}
```

### Attestation Submission

```
POST /api/attestations/submit
```

Request body:
```json
{
  "imageHash": "hex string",
  "timestamp": "number",
  "deviceId": "string",
  "latitude": "number",
  "longitude": "number",
  "gpsEnabled": "boolean",
  "signature": {
    "r": "hex string",
    "s": "hex string"
  },
  "publicKey": {
    "x": "hex string",
    "y": "hex string"
  }
}
```

Response:
```json
{
  "success": true,
  "attestationId": "string",
  "blockchainTxId": "string",
  "attestationHash": "hex string"
}
```

### Verification

```
GET /api/attestations/verify/{attestationId}
```

Response:
```json
{
  "verified": true,
  "attestation": {
    "imageHash": "hex string",
    "timestamp": "number",
    "deviceId": "string",
    "deviceInfo": {
      "model": "string",
      "registered": "date string"
    },
    "location": {
      "latitude": "number",
      "longitude": "number"
    },
    "blockchainInfo": {
      "network": "string",
      "blockNumber": "number",
      "transactionId": "string",
      "timestamp": "date string"
    }
  }
}
```

## Verification Portal

A web-based verification portal allows anyone to:

1. Upload an image to verify its authenticity
2. Enter an attestation ID to check its details
3. Scan a QR code (from the mobile app) to verify an image

The portal will display:
- Verification status
- Original capture timestamp
- Device information
- Blockchain transaction details
- Map with location (if GPS was enabled)

## Security Considerations

- Private keys should never leave the user's device
- Communication between app and backend should use TLS
- API endpoints should implement rate limiting and authentication
- Consider implementing additional server-side validation

## Testing

Test vectors for the circuit are provided in the test directory. 