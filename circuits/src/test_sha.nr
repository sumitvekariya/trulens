use dep::sha256;

fn main() {
    let input = [0; 32];
    // Try to use the sha256 module in different ways to identify the correct method
    let hash1 = sha256::sha256(input);
} 