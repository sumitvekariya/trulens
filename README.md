# TruLens: Verified Photo Capture

TruLens is a zero-knowledge proof application that enables cryptographic verification of photos to combat deepfakes and misinformation.

## Features

- **Photo Capture**: Take photos with metadata (timestamp, device ID, GPS location)
- **Zero-Knowledge Verification**: Generate and verify cryptographic proofs using Noir
- **Blockchain Ready**: Generate attestation hashes ready for on-chain storage
- **Privacy Preserving**: Only hashes are shared, not the original images

## Architecture

The project consists of three main components:

1. **Noir Circuit**: Zero-knowledge circuit for image attestation verification
2. **React Frontend**: Camera capture, image processing, and proof generation
3. **Express Backend**: API endpoints for verification and attestation storage

## Tech Stack

- **Noir**: Zero-knowledge proof circuit language
- **React**: Frontend framework with TypeScript
- **Express**: Backend API 
- **noir_js/bb.js**: JavaScript libraries for Noir circuit execution and proof generation

## Prerequisites

- Node.js (v16+)
- Noir (v1.0.0-beta.2 or compatible)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/trulens.git
cd trulens
```

### 2. Compile the Noir Circuit

```bash
cd trulens
nargo compile
```

### 3. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```

### 4. Start the Frontend App

```bash
cd frontend
npm install
npm run dev
```

## How It Works

1. When a photo is captured, the app records metadata including timestamp and device ID
2. The image is hashed and combined with the metadata
3. The device "signs" this data (simulated in the demo)
4. The Noir circuit verifies the signature using the device's public key
5. The circuit produces an attestation hash that can be stored on-chain
6. This attestation hash can be used to verify the authenticity of the image later

## Project Structure

```
trulens/
├── src/                # Noir circuit code
├── frontend/           # React app
├── backend/            # Express server
├── shared/             # Shared resources between frontend and backend
└── target/             # Compiled Noir circuit files
```

## Contribution

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 