use dep::sha256;

/// Serializes a u64 value to a byte array
pub fn u64_to_bytes(value: u64) -> [u8; 8] {
    let mut bytes = [0; 8];
    
    bytes[0] = (value & 0xFF) as u8;
    bytes[1] = ((value >> 8) & 0xFF) as u8;
    bytes[2] = ((value >> 16) & 0xFF) as u8;
    bytes[3] = ((value >> 24) & 0xFF) as u8;
    bytes[4] = ((value >> 32) & 0xFF) as u8;
    bytes[5] = ((value >> 40) & 0xFF) as u8;
    bytes[6] = ((value >> 48) & 0xFF) as u8;
    bytes[7] = ((value >> 56) & 0xFF) as u8;
    
    bytes
}

/// Serializes an i64 value to a byte array
pub fn i64_to_bytes(value: i64) -> [u8; 8] {
    // Convert to unsigned and handle negative values
    let unsigned_value = if value < 0 {
        ((-value) as u64) | (1 << 63) // Set the sign bit
    } else {
        value as u64
    };
    
    u64_to_bytes(unsigned_value)
}

/// Generates the message hash that should be signed for image attestation
pub fn generate_image_attestation_hash(
    image_hash: [u8; 32],
    timestamp: u64,
    device_id: u64,
    latitude: i64,
    longitude: i64,
    gps_enabled: bool
) -> [u8; 32] {
    // Pack data for hashing
    let mut data = [0; 128];
    let mut index = 0;
    
    // Copy image hash to data
    for i in 0..32 {
        data[index] = image_hash[i];
        index += 1;
    }
    
    // Add timestamp bytes
    let timestamp_bytes = u64_to_bytes(timestamp);
    for i in 0..8 {
        data[index] = timestamp_bytes[i];
        index += 1;
    }
    
    // Add device ID bytes
    let device_id_bytes = u64_to_bytes(device_id);
    for i in 0..8 {
        data[index] = device_id_bytes[i];
        index += 1;
    }
    
    // Add GPS data if enabled
    if gps_enabled {
        // Add latitude and longitude
        let lat_bytes = i64_to_bytes(latitude);
        let long_bytes = i64_to_bytes(longitude);
        
        for i in 0..8 {
            data[index] = lat_bytes[i];
            index += 1;
        }
        
        for i in 0..8 {
            data[index] = long_bytes[i];
            index += 1;
        }
    }
    
    // Add GPS flag
    data[index] = if gps_enabled { 1 } else { 0 };
    
    // Hash the combined data using the external sha256 implementation
    // Using digest function for fixed length data
    sha256::digest(data)
}

#[test]
fn test_generate_hash() {
    // Test data
    let test_image_hash = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    let test_timestamp = 1697380000;
    let test_device_id = 12345;
    let test_latitude = 340522;
    let test_longitude = -1182437;
    let test_gps_enabled = true;
    
    // Generate hash
    let hash1 = generate_image_attestation_hash(
        test_image_hash,
        test_timestamp,
        test_device_id,
        test_latitude,
        test_longitude,
        test_gps_enabled
    );
    
    // Generate again to verify determinism
    let hash2 = generate_image_attestation_hash(
        test_image_hash,
        test_timestamp,
        test_device_id,
        test_latitude,
        test_longitude,
        test_gps_enabled
    );
    
    // Hashes should match
    assert(hash1 == hash2);
    
    // Test with different GPS flag
    let hash3 = generate_image_attestation_hash(
        test_image_hash,
        test_timestamp,
        test_device_id,
        test_latitude,
        test_longitude,
        false // GPS disabled
    );
    
    // Hashes should be different
    assert(hash1 != hash3);
} 