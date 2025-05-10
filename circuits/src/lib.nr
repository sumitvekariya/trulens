// TruLens Circuit Library
// Contains helper functions for image attestation circuits

// Validate if coordinates are within specified bounds
fn validate_coordinates(
    latitude: i64,
    longitude: i64,
    min_latitude: i64,
    max_latitude: i64,
    min_longitude: i64,
    max_longitude: i64
) -> bool {
    let lat_valid = (latitude >= min_latitude) & (latitude <= max_latitude);
    let long_valid = (longitude >= min_longitude) & (longitude <= max_longitude);
    lat_valid & long_valid
}

// Validate if timestamp is within specified bounds
fn validate_timestamp(
    timestamp: u64,
    min_timestamp: u64,
    max_timestamp: u64
) -> bool {
    (timestamp >= min_timestamp) & (timestamp <= max_timestamp)
}

// Check if two byte arrays are equal
fn bytes_equal<N>(a: [u8; N], b: [u8; N]) -> bool {
    let mut equal = true;
    for i in 0..N {
        if a[i] != b[i] {
            equal = false;
        }
    }
    equal
}

// Convert decimal latitude/longitude to scaled integer representation
// Scales by 1,000,000 to preserve precision (e.g., 37.7749 becomes 37774900)
fn scale_coordinate(coordinate: Field) -> i64 {
    (coordinate * 1_000_000) as i64
}

// Simple signature length check (placeholder for future cryptographic verification)
fn validate_signature(signature: [u8; 64]) -> bool {
    // In a real implementation, we would verify the signature here
    // For now, just check that it's not all zeros
    let mut all_zeros = true;
    for i in 0..64 {
        if signature[i] != 0 {
            all_zeros = false;
        }
    }
    !all_zeros
}

// Parse and validate time-related constraints
fn time_constraints_satisfied(
    timestamp: u64, 
    min_bound: u64, 
    max_bound: u64, 
    current_time: u64
) -> bool {
    // If bounds are zero, we check against current time with reasonable buffer
    let min_time = if min_bound == 0 { 0 } else { min_bound };
    let max_time = if max_bound == 0 { current_time + 86400 } else { max_bound };
    
    validate_timestamp(timestamp, min_time, max_time)
} 