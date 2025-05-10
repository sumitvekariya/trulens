# TruLens Architecture

This document outlines the architecture of the TruLens trusted media verification platform, detailing the technical components, data flow, and key design decisions.

## System Overview

TruLens is designed as a modular system with four major components:

1. **Frontend**: React/TypeScript mobile-first web application
2. **Backend**: Node.js RESTful API server
3. **Circuits**: Noir zero-knowledge circuits for verification
4. **Starknet**: Smart contracts for on-chain attestation

```
┌───────────────────────┐          ┌────────────────────────┐
│       Frontend        │          │        Backend         │
│  ┌─────────────────┐  │          │   ┌────────────────┐   │
│  │  Image Capture  │  │          │   │  REST API      │   │
│  └─────────────────┘  │  HTTP/   │   └────────────────┘   │
│  ┌─────────────────┐  │   JSON   │   ┌────────────────┐   │
│  │ Wallet Connect  ├──┼──────────┼──▶│ Pinata Service │───┼───┐
│  └─────────────────┘  │          │   └────────────────┘   │   │
│  ┌─────────────────┐  │          │   ┌────────────────┐   │   │
│  │   Attestation   │◀─┼──────────┼───┤ Noir Service   │───┼───┼────┐
│  └─────────────────┘  │          │   └────────────────┘   │   │    │
└───────────────────────┘          └────────────────────────┘   │    │
                                                                │    │
┌───────────────────────┐          ┌────────────────────────┐  │    │
│      Starknet         │          │     IPFS/Pinata        │  │    │
│  ┌─────────────────┐  │          │   ┌────────────────┐   │  │    │
│  │ PhotoAttestation│◀─┼──────────┤   │ Gateway        │◀──┘    │
│  │     Contract    │  │          │   └────────────────┘   │    │
│  └─────────────────┘  │          │   ┌────────────────┐   │    │
│                       │          │   │ Storage        │   │    │
└───────────────────────┘          └────────────────────────┘    │
                                                                 │
┌───────────────────────────────────────────────────────┐        │
│                      Circuits                         │        │
│  ┌─────────────────┐            ┌─────────────────┐   │        │
│  │ Noir ZK Circuit │◀───────────┤ Barretenberg    │◀──┘
│  └─────────────────┘            │     Backend     │   │
│                                 └─────────────────┘   │
│  ┌──────────────────────────────────────────────┐    │
│  │           Off-Chain Verification              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────┐  │    │
│  │  │ Time Bounds │  │  GPS Bounds │  │Image  │  │    │
│  │  │ Verification│  │ Verification│  │Signing│  │    │
│  │  └─────────────┘  └─────────────┘  └───────┘  │    │
│  └──────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

### Off-Chain Verification Flow

Off-chain verification provides privacy-preserving validation using zero-knowledge proofs:

1. **Input Collection**: When a user (verifier) wants to verify an image:
   - The backend collects verification parameters (image hash, timestamp bounds, GPS boundaries)
   - The original image metadata and signature from attestation are retrieved

2. **Proof Generation**:
   - The Noir Service interacts with the Barretenberg backend to generate a ZK proof
   - The circuit validates that the image was captured within the specified time bounds
   - If GPS was enabled, the circuit verifies location is within specified boundaries
   - The circuit verifies the image signature against the public key

3. **Verification**:
   - The proof can be verified without revealing the exact time or location
   - A successful verification confirms the image was taken within the specified parameters
   - The verifier only learns that the conditions were met, not the exact metadata values

4. **Advantages**:
   - Privacy is preserved (exact location/time not revealed)
   - Verification works with or without GPS data
   - No on-chain transaction required for verification
   - Flexible boundary conditions can be set by the verifier

## Component Details

### 1. Frontend

#### Tech Stack
- React 18+
- TypeScript
- Vite build system
- React Router for navigation
- Starknet.js for wallet integration

#### Key Features
- **Camera Component**: Uses browser WebRTC API to access device camera
- **Geolocation**: Captures precise location data using browser Geolocation API
- **Wallet Connection**: Integrates with Starknet wallets (Argent X, Braavos)
- **Share/Save**: Implements native sharing and image saving functionality
- **Mobile-First Design**: Responsive UI optimized for mobile devices

#### Data Flow
1. User captures image with optional GPS data
2. Image is hashed client-side (SHA-256)
3. Metadata is created and uploaded to IPFS via backend API
4. Hash is used to create attestation transaction on Starknet
5. User can verify, share, or save the attested image

### 2. Backend

#### Tech Stack
- Node.js
- Express.js
- Pinata SDK for IPFS integration
- Multer for file handling
- Barretenberg.js for ZK proof verification

#### Key Components
- **Pinata Service**: Manages IPFS storage and retrieval
  - Multiple fallback gateways
  - JWT authentication
  - CID mapping for hash truncation
- **Noir Service**: Handles zero-knowledge proof generation/verification
  - Direct interaction with Barretenberg backend
  - Input validation and formatting
  - Circuit artifact management
- **REST API**: Endpoints for frontend communication
  - Image upload and attestation
  - Verification routes
  - IPFS content retrieval

#### Security Features
- Environment variable based configuration
- Error logging with sensitive data redaction
- CORS protection
- Input validation

### 3. Circuits

#### Tech Stack
- Noir v0.31.0
- Barretenberg backend
- SHA-256 hash verification

#### Circuit Components
- **Time Verification**: Ensures image was captured within specified time bounds
- **Location Verification**: Optional verification of GPS coordinates within bounds
- **Signature Verification**: Validates image signature against public key

#### Key Implementation Details
- **Conditional Logic**: GPS verification only when explicitly enabled
- **Integer Scaling**: GPS coordinates scaled by 10^6 for integer representation
- **Hash Handling**: SHA-256 image hash represented as integer array
- **Type Safety**: Proper validation to avoid unwrap errors

### 4. Starknet

#### Tech Stack
- Cairo 1.0
- Starknet Contracts
- Scarb package manager

#### Contract Features
- **PhotoAttestation Contract**: Stores attestation data on-chain
  - Image hash (truncated for felt compatibility)
  - Timestamp
  - Metadata hash (pointer to IPFS)
- **Verification**: Public verification of attestation existence
- **Query Methods**: Lookup attestations by hash or timestamp

## Data Models

### Image Metadata
```json
{
  "latitude": 37.7749,
  "longitude": -122.4194,
  "deviceId": "user-device-123",
  "timestamp": 1683025200,
  "imageHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "captureDate": "2023-05-02T12:00:00Z",
  "gpsEnabled": true
}
```

### Attestation Record
```json
{
  "imageHash": "e3b0c44298fc1c...",
  "metadataHash": "b94d27b9934d3e...",
  "metadataCid": "QmT78zSuBmuS4z...",
  "timestamp": 1683025200,
  "signature": "304502...",
  "publicKey": "04a9d5...",
  "ipfsEnabled": true
}
```

## Authentication and Authorization

- **Pinata API**: JWT-based authentication for IPFS services
- **Starknet**: Account abstraction for contract interaction
- **Backend**: API key for future service-to-service communication

## Edge Cases and Error Handling

1. **Network Connectivity Issues**
   - Multiple IPFS gateway fallbacks
   - Offline-first design for image capture

2. **GPS Data Unavailability**
   - Conditional circuit logic for GPS-disabled devices
   - UI feedback for GPS status

3. **Version Compatibility**
   - Specific version requirements documented
   - Direct Barretenberg integration to avoid version conflicts

## Development and Deployment

### Local Development
```bash
# Run backend with auto-reload
cd backend
pnpm dev

# Run frontend with hot module replacement
cd frontend
pnpm dev
```

### Production Deployment
```bash
# Build frontend
cd frontend
pnpm build

# Deploy backend (example using PM2)
cd backend
pm2 start server.js --name trulens-backend
```

## Future Technical Considerations

1. **Scaling**
   - Consider serverless functions for proof generation
   - Load balancing for high-traffic scenarios
   - Distributed IPFS pinning service

2. **Security Enhancements**
   - Implement rate limiting
   - Add JWT authentication for API
   - Multi-factor authentication for critical operations

3. **Performance Optimization**
   - WebWorkers for client-side operations
   - Image compression before upload
   - Batch proof generation

4. **Interoperability**
   - GraphQL API for flexible querying
   - WebHook support for integration with other systems
   - Cross-chain attestation bridging 