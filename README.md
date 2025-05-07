# Image Attestation Circuit

This Noir circuit implements cryptographic attestation for images captured by trusted devices.

## Purpose

The circuit verifies:
1. The authenticity of an image by validating the device's cryptographic signature
2. The integrity of metadata (timestamp, device ID, optional GPS coordinates)
3. The correctness of the attestation hash that will be stored on-chain

## How It Works

The attestation process follows these steps:

1. **Image Hashing**: The original image is hashed on the device when captured (SHA-256)
2. **Metadata Attachment**: Timestamp, device ID, and optional GPS coordinates are recorded
3. **Signing**: The device signs the combined data using its private key
4. **Verification**: The circuit verifies the signature using the device's public key
5. **Hash Generation**: A final attestation hash is computed and made available on-chain

## Circuit Inputs

- `image_hash`: SHA-256 hash of the original image [32 bytes]
- `timestamp`: Unix timestamp when the image was captured
- `device_id`: Unique identifier for the device
- `latitude` & `longitude`: Optional GPS coordinates (if enabled)
- `gps_enabled`: Flag indicating whether GPS data is included
- `signature_r` & `signature_s`: Components of the ECDSA signature
- `public_key_x` & `public_key_y`: Device's public key components
- `attestation_hash`: Public output - the hash to be stored on-chain

## Integration

This circuit is designed to work within a larger system:

1. **Mobile App**: Captures images, collects metadata, and signs the data
2. **Backend Service**: Generates zero-knowledge proofs using this circuit
3. **Blockchain**: Stores the attestation hash and links to device public keys
4. **Verification Portal**: Allows anyone to verify the authenticity of an image

## Future Improvements

- Full ECDSA signature verification implementation
- Support for additional metadata fields
- Integration with hardware secure elements (TPM, Secure Enclave)
- Support for multimedia formats beyond images

## Build and Test

To build the circuit:

```bash
cd image_attestation
nargo build
```

To run tests:

```bash
nargo test
```

## License

[MIT License](LICENSE) 