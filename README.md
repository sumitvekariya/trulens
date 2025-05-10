# TruLens - Trusted Media Verification Platform

TruLens is a decentralized platform that enables trusted media verification using zero-knowledge proofs, IPFS, and Starknet. The platform allows users to capture images, attest them with metadata (timestamp, location), and verify their authenticity.

## Overview

TruLens enables:
- Capture and verification of photos with cryptographic attestations
- Optional privacy-preserving GPS data verification
- Decentralized storage using IPFS/Pinata
- On-chain verification through Starknet
- Zero-knowledge proofs for private verification of capture conditions

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│     IPFS    │
│ (React/TS)  │◀────│  (Node.js)  │◀────│   (Pinata)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   
       │                   │                   
       ▼                   ▼                   
┌─────────────┐     ┌─────────────┐     
│  Starknet   │     │    Noir     │     
│  Contracts  │     │   Circuits  │     
└─────────────┘     └─────────────┘     
```

## Key Components

### Frontend
- Mobile-first design for in-the-field capture
- Image capture with metadata (GPS, timestamp)
- Wallet connection for Starknet interaction
- On-chain image attestation
- IPFS integration for decentralized storage
- Image sharing and saving capabilities

### Backend
- IPFS storage via Pinata service
- Zero-knowledge proof generation and verification
- Persistent CID mapping for IPFS content
- RESTful API for frontend communication

### Circuits
- Zero-knowledge proofs using Noir language
- Flexible verification with or without GPS data
- Timestamp and location boundary verification
- Proof generation for privacy-preserving verification

### Starknet
- Smart contracts for on-chain attestation
- Decentralized verification and storage of attestation metadata
- Public verification of image authenticity

## Problem Solved

The platform addresses the challenge of verifying the authenticity of digital media, specifically:

1. **Proving an image was captured at a specific time**
2. **Optionally verifying the capture location** (GPS coordinates)
3. **Providing tamper-evident verification** through cryptographic proofs

Our unique solution allows:
- Optional GPS verification (disabled GPS won't break verification)
- Privacy-preserving verification using zero-knowledge proofs
- Decentralized and persistent attestation records

## Implementation

### Mobile-First Approach
The frontend is designed with a mobile-first approach, optimizing for:
- Field usage by journalists, field workers, and photographers
- Touch-friendly interface for quick capture
- Adaptive layout for various screen sizes
- Native device functionality (camera, GPS)

### Zero-Knowledge Verification
The Noir circuit allows verification without revealing sensitive data:
```noir
// Only verify GPS bounds if GPS is enabled
if gps_enabled_bool {
    assert(latitude >= min_latitude_bound);
    assert(latitude <= max_latitude_bound);
    assert(longitude >= min_longitude_bound);
    assert(longitude <= max_longitude_bound);
}
```

### Decentralized Storage
All media and metadata are stored on IPFS through Pinata, with:
- Persistent gateway access
- Multiple fallback gateways
- Mapping between on-chain hashes and IPFS CIDs

## Setup and Running

### Prerequisites
- Node.js 16+
- PNPM package manager
- Noir v0.31.0 (for ZK circuit compilation)
- Starknet CLI/Account (for contract deployment)

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/trulens.git
cd trulens

# Install dependencies
pnpm install

# Setup environment variables
cp backend/.env.example backend/.env
# Configure your Pinata API keys in .env
```

### Running the Application
```bash
# Start backend server
cd backend
pnpm start

# Start frontend development server
cd frontend
pnpm dev
```

## Roadmap & Improvements

### Short-term
- Complete off-chain verification implementation
- Enhanced UI/UX for verification process
- Support for additional file formats (video, audio)
- Improved error handling and recovery
- **Build native mobile app** for better camera integration and provable image attestation
- **World ID integration** for sybil-resistant attestations and human verification

### Mid-term
- Multi-chain support (Ethereum, Polygon)
- Integration with decentralized identity solutions
- Batch attestation support
- Enhanced metadata for specialized use cases

### Long-term
- Decentralized backend with P2P communication
- AI-resistant verification techniques
- Governance model for verification standards
- Industry-specific modules (journalism, insurance, legal)

## Technical Learnings

1. **Version Compatibility** is critical in zero-knowledge circuits - matching versions of Noir, noir_js, and bb.js are required.

2. **Witness Generation** differs between Noir versions:
   - v0.31.0 uses `nargo execute <witness_name>`
   - Newer versions use `nargo prove`

3. **Type Handling** - Integer values must be properly converted to BigInt and GPS coordinates should be stored as integers (e.g., multiplied by 1,000,000).

4. **Conditional Assertions** in Noir provide more flexibility than hard assertions.

5. **Mobile-First Development** requires careful consideration of device capabilities and limitations.

## Contributing

Contributions are welcome! Please check out our [contribution guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 