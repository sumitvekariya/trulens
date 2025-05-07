mod lib;
use dep::std::ecdsa_secp256k1;

// Input struct for our image attestation
struct ImageAttestation {
    // Hash of the original image
    image_hash: [u8; 32],
    // Timestamp of when the image was taken (unix timestamp in seconds)
    timestamp: u64,
    // Unique identifier for the device that took the image
    device_id: u64,
    // Optional GPS coordinates (if enabled)
    latitude: i64,
    longitude: i64,
    // Flag indicating if GPS data is included
    gps_enabled: bool,
    // Signature (combined r and s components - 64 bytes)
    signature: [u8; 64],
    // Device's public key (for verification)
    public_key_x: [u8; 32],
    public_key_y: [u8; 32]
}

// Our main circuit function
fn main(
    image_hash: [u8; 32],
    timestamp: u64,
    device_id: u64,
    latitude: i64,
    longitude: i64,
    gps_enabled: bool,
    signature: [u8; 64],
    public_key_x: [u8; 32],
    public_key_y: [u8; 32],
    // The hash that will be stored on-chain
    attestation_hash: [u8; 32]
) {
    // Create our attestation struct
    let attestation = ImageAttestation {
        image_hash,
        timestamp,
        device_id,
        latitude,
        longitude,
        gps_enabled,
        signature,
        public_key_x,
        public_key_y
    };
    
    // Generate the message hash for signature verification using the library function
    let message_hash = lib::generate_image_attestation_hash(
        attestation.image_hash,
        attestation.timestamp,
        attestation.device_id,
        attestation.latitude,
        attestation.longitude,
        attestation.gps_enabled
    );
    
    // Verify the device's signature using Noir's built-in ECDSA verification
    let is_signature_valid = ecdsa_secp256k1::verify_signature(
        attestation.public_key_x,
        attestation.public_key_y,
        attestation.signature,
        message_hash
    );
    
    // Ensure the signature is valid
    assert(is_signature_valid);
    
    // Ensure the provided attestation hash matches our computed hash
    assert(attestation_hash == message_hash);
}

#[test]
fn test_attestation() {
    // Test data
    let test_image_hash = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    let test_timestamp = 1697380000;
    let test_device_id = 12345;
    let test_latitude = 340522;
    let test_longitude = -1182437;
    let test_gps_enabled = true;
    
    // Generate message hash
    let message_hash = lib::generate_image_attestation_hash(
        test_image_hash,
        test_timestamp,
        test_device_id,
        test_latitude,
        test_longitude,
        test_gps_enabled
    );
    
    // Verify hash generation is consistent
    let hash2 = lib::generate_image_attestation_hash(
        test_image_hash,
        test_timestamp,
        test_device_id,
        test_latitude,
        test_longitude,
        test_gps_enabled
    );
    
    assert(message_hash == hash2);
}
