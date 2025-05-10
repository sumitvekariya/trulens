#[starknet::contract]
mod PhotoAttestation {
    use starknet::{ContractAddress, get_caller_address};
    use garaga::pairing::{G1Point, G2Point, verify_pairing};
    use garaga::hash::pedersen_hash;
    
    #[storage]
    struct Storage {
        admin: ContractAddress,
        attestations: LegacyMap<felt252, (felt252, felt252, ContractAddress)>,
        attestation_count: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin_address: ContractAddress) {
        self.admin.write(admin_address);
        self.attestation_count.write(0);
    }

    #[external(v0)]
    fn add_attestation(
        ref self: ContractState, 
        image_hash: felt252, 
        timestamp: felt252, 
        metadata_hash: felt252,
        signature: (G1Point, G2Point)
    ) {
        // Verify the signature using Garaga's pairing verification
        let caller = get_caller_address();
        let message_hash = pedersen_hash(image_hash, timestamp);
        
        // Verify the attestation signature using pairing-based cryptography
        let is_valid = verify_pairing(signature.0, signature.1, message_hash);
        assert(is_valid, "Invalid signature");
        
        // Store the attestation
        self.attestations.write(image_hash, (timestamp, metadata_hash, caller));
        
        // Increment the total count
        let current_count = self.attestation_count.read();
        self.attestation_count.write(current_count + 1);
    }

    #[external(v0)]
    fn verify_attestation(
        self: @ContractState, 
        image_hash: felt252
    ) -> (bool, felt252, felt252, ContractAddress) {
        // Check if the attestation exists
        let (timestamp, metadata_hash, attester) = self.attestations.read(image_hash);
        
        if (timestamp == 0) {
            return (false, 0, 0, ContractAddress { contract_address: 0 });
        }
        
        (true, timestamp, metadata_hash, attester)
    }

    #[external(v0)]
    fn get_total_attestations(self: @ContractState) -> u64 {
        self.attestation_count.read()
    }

    #[external(v0)]
    fn revoke_attestation(ref self: ContractState, image_hash: felt252) {
        let caller = get_caller_address();
        assert(caller == self.admin.read(), "Only admin can revoke attestations");
        
        // Check if attestation exists
        let (timestamp, _, _) = self.attestations.read(image_hash);
        assert(timestamp != 0, "Attestation does not exist");
        
        // Remove the attestation (by writing zeros)
        self.attestations.write(image_hash, (0, 0, ContractAddress { contract_address: 0 }));
        
        // Decrement the count
        let current_count = self.attestation_count.read();
        self.attestation_count.write(current_count - 1);
    }
} 