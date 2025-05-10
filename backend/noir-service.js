import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Noir circuit directory
const CIRCUITS_DIR = path.join(__dirname, '../circuits');

class NoirService {
  constructor() {
    this.initialized = false;
    this.noir = null;
    this.backend = null;
    this.circuitName = null;
    this.circuitAbi = null;
    this.circuitPath = CIRCUITS_DIR; // Default circuit path

    console.log('NoirService instance created.');
  }

  /**
   * Ensures the circuits directory exists.
   */
  _ensureCircuitsDir() {
      if (!fs.existsSync(this.circuitPath)) {
        console.log('Creating circuits directory:', this.circuitPath);
        fs.mkdirSync(this.circuitPath, { recursive: true });
    }
  }

  /**
   * Checks if Nargo is installed and accessible.
   */
  async _checkNargo() {
    try {
      const { stdout } = await execPromise('nargo --version');
      console.log(`Nargo detected: ${stdout.trim()}`);
      return true;
    } catch (error) {
      console.error('Nargo not found or nargo --version failed:', error.message);
      throw new Error('Nargo is not installed or not in PATH. Please install Nargo.');
    }
  }

  /**
   * Sets the circuit path based on provided path or default.
   * @param {string} circuitPath - Optional path to the circuit directory
   */
  setCircuitPath(circuitPath) {
    if (circuitPath) {
      // Support for @circuits or other prefixed paths
      if (circuitPath.startsWith('@')) {
        const pathWithoutPrefix = circuitPath.substring(1); // Remove the @ symbol
        this.circuitPath = path.join(__dirname, '..', pathWithoutPrefix);
      } else {
        this.circuitPath = circuitPath;
      }
      console.log(`Circuit path set to: ${this.circuitPath}`);
    } else {
      this.circuitPath = CIRCUITS_DIR;
      console.log(`Using default circuit path: ${this.circuitPath}`);
    }
  }

  /**
   * Reads the circuit name from Nargo.toml.
   */
  _getCircuitNameFromNargoToml() {
    const nargoTomlPath = path.join(this.circuitPath, 'Nargo.toml');
    if (!fs.existsSync(nargoTomlPath)) {
      throw new Error(`Nargo.toml not found in ${this.circuitPath}. Cannot determine circuit name.`);
    }
    const nargoContent = fs.readFileSync(nargoTomlPath, 'utf8');
        const nameMatch = nargoContent.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1]) {
          this.circuitName = nameMatch[1];
      console.log(`Circuit name from Nargo.toml: ${this.circuitName}`);
    } else {
      throw new Error('Could not parse circuit name from Nargo.toml.');
    }
  }

  /**
   * Initializes the Noir service: checks Nargo, circuits dir, and loads the circuit.
   * @param {string} circuitPath - Optional path to the circuit directory
   * @returns {Promise<boolean>} True if initialization was successful, false otherwise.
   */
  async initialize(circuitPath) {
    if (this.initialized) {
      console.log('NoirService already initialized.');
      return true;
    }
    console.log('Initializing NoirService...');
    try {
      // Set the circuit path if provided
      this.setCircuitPath(circuitPath);
      
      this._ensureCircuitsDir();
      await this._checkNargo();
      this._getCircuitNameFromNargoToml();

      // Force recompile for development
      console.log('For development: Force-recompiling circuit to ensure latest version...');
      await this.compileCircuit();
      
      await this.loadCircuit(); // This will also compile if necessary

      this.initialized = true;
      console.log('✅ NoirService initialized successfully.');
      return true;
    } catch (error) {
      console.error('Failed to initialize NoirService:', error.message);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Compiles the Noir circuit using Nargo.
   * @returns {Promise<boolean>} True if compilation was successful.
   */
  async compileCircuit() {
    if (!this.circuitName) {
      this._getCircuitNameFromNargoToml(); // Ensure we have a circuit name
    }
    console.log(`Compiling circuit "${this.circuitName}" in: ${this.circuitPath}...`);
    try {
      // The `nargo compile` command creates the target/${this.circuitName}.json file
      // Note: Using just 'nargo compile' without flags as per Nargo 1.0.0-beta.3 syntax
      await execPromise(`nargo compile`, { cwd: this.circuitPath });
      console.log(`Circuit "${this.circuitName}" compiled successfully.`);
      return true;
    } catch (error) {
      console.error(`Error compiling circuit "${this.circuitName}":`, error.message);
      throw new Error(`Failed to compile circuit: ${error.message}`);
    }
  }

  /**
   * Loads the compiled circuit JSON, its ABI, and initializes Noir and Backend.
   * Will attempt to compile the circuit if the compiled JSON is not found.
   * @returns {Promise<boolean>} True if the circuit was loaded successfully.
   */
  async loadCircuit() {
      if (!this.circuitName) {
      this._getCircuitNameFromNargoToml();
      }
      
      const circuitJsonPath = path.join(this.circuitPath, 'target', `${this.circuitName}.json`);
    console.log(`Attempting to load compiled circuit from: ${circuitJsonPath}`);
      
    if (!fs.existsSync(circuitJsonPath)) {
      console.warn(`Compiled circuit not found at ${circuitJsonPath}. Attempting to compile...`);
      await this.compileCircuit(); // This might throw if compilation fails
      if (!fs.existsSync(circuitJsonPath)) {
        throw new Error(`Circuit JSON still not found at ${circuitJsonPath} after compilation attempt.`);
      }
    }

    try {
      const circuitJsonContent = fs.readFileSync(circuitJsonPath, 'utf8');
      const compiledCircuit = JSON.parse(circuitJsonContent);

      if (!compiledCircuit.bytecode) {
        throw new Error('Compiled circuit JSON is missing bytecode.');
      }
      if (!compiledCircuit.abi) {
        throw new Error('Compiled circuit JSON is missing ABI.');
      }

      this.circuitAbi = compiledCircuit.abi;
      console.log('Circuit ABI loaded. Input parameters:');
      this.circuitAbi.parameters.forEach(param => {
        console.log(`- ${param.name}: ${JSON.stringify(param.type)}`);
      });

      this.noir = new Noir(compiledCircuit);
      this.backend = new UltraHonkBackend(compiledCircuit.bytecode); // Use compiledCircuit.bytecode

      console.log(`Circuit "${this.circuitName}" loaded successfully.`);
      return true;
    } catch (error) {
      console.error(`Error loading circuit "${this.circuitName}":`, error.message);
      throw new Error(`Failed to load circuit: ${error.message}`);
    }
  }

  /**
   * Formats a raw value based on its Noir type definition from the ABI.
   * @param {*} value - The raw value to format.
   * @param {object} typeDefinition - The Noir type definition object from the ABI.
   * @returns {*} The formatted value.
   */
  _formatValueBasedOnType(value, typeDefinition) {
    const { kind } = typeDefinition;

    if (kind === 'integer' || kind === 'field') {
      return BigInt(value);
    }

    if (kind === 'boolean') {
      return Boolean(value);
    }
    
    if (kind === 'array') {
      const { length, type: elementType } = typeDefinition;
      let result = [];

      if (typeof value === 'string') {
        // Specific handling for u8 arrays (bytes)
        if (elementType.kind === 'integer' && elementType.sign === 'unsigned' && elementType.width === 8) {
          if (value.includes(',')) {
            console.log(`_formatValueBasedOnType (u8[] from CSV): Parsing "${value.substring(0, 40)}..."`);
            result = value.split(',').map(partStr => {
              const num = parseInt(partStr.trim(), 10);
              if (isNaN(num) || !isFinite(num)) {
                console.warn(`_formatValueBasedOnType (u8[] from CSV): Non-numeric/infinite part "${partStr}". Using 0.`);
                return 0;
              }
              if (num < 0 || num > 255) {
                const clamped = num & 0xFF;
                console.warn(`_formatValueBasedOnType (u8[] from CSV): Value ${num} out of 0-255 range. Using ${clamped} (original & 0xFF).`);
                return clamped;
              }
              return num;
            });
          } else { // Assume hex string for u8[] if not CSV
            const cleanValue = value.startsWith('0x') ? value.slice(2) : value;
            if (/^[0-9a-fA-F]*$/.test(cleanValue)) { // Allows empty string
              console.log(`_formatValueBasedOnType (u8[] from HEX): Parsing "${cleanValue.substring(0, 40)}..."`);
              for (let i = 0; i < cleanValue.length; i += 2) {
                const byteStr = cleanValue.substring(i, i + 2);
                if (byteStr.length === 2){ // Ensure two characters for a byte
                  result.push(parseInt(byteStr, 16));
                } else if (byteStr.length === 1){ // Handle potential last odd char by padding (less ideal)
                  console.warn(`_formatValueBasedOnType (u8[] from HEX): Odd length hex string, parsing last char "${byteStr}" as "${byteStr}0".`);
                  result.push(parseInt(byteStr + '0', 16));
                }
              }
            } else if (cleanValue !== '') {
              console.warn(`_formatValueBasedOnType (u8[]): String value "${value.substring(0, 40)}..." is not CSV or valid hex. Treating as empty for padding.`);
            }
          }
        } else if (value.includes(',')) { // Generic comma-separated for other array types
          console.log(`_formatValueBasedOnType (non-u8 CSV): Parsing "${value.substring(0,40)}...", elementType: ${JSON.stringify(elementType)}`);
          result = value.split(',').map(partStr => {
            const trimmedPart = partStr.trim();
            if (elementType.kind === 'field' || elementType.kind === 'integer') {
              // Handle large integers more safely - use try/catch for BigInt conversion
              try {
                // Try to parse as BigInt - if the value is too large for Number but valid for BigInt
                // or if it's a hex string like "0x123", this should still work
                return BigInt(trimmedPart);
              } catch (e) {
                // If the value contains scientific notation or other non-BigInt compatible format
                try {
                  // For values with scientific notation (e.g., 1.23e+25), convert via Number first
                  if (/e[+-]/i.test(trimmedPart)) {
                    console.log(`_formatValueBasedOnType: Converting scientific notation ${trimmedPart}`);
                    return BigInt(Math.round(Number(trimmedPart)));
                  }
                  // If it's an empty string or just whitespace
                  if (!trimmedPart || /^\s*$/.test(trimmedPart)) {
                    return BigInt(0);
                  }
                } catch (_) {
                  // Ignore error from this attempt
                }
                
                console.warn(`_formatValueBasedOnType (non-u8 CSV): Failed to parse "${trimmedPart}" as BigInt, using 0n instead. Error: ${e.message}`);
                return BigInt(0);
              }
            }
            // Fallback for other types if any, though less common for CSV
            console.warn(`_formatValueBasedOnType (non-u8 CSV): Unknown element type ${elementType.kind} for direct CSV part conversion. Returning as string part.`);
            return trimmedPart;
          });
        } else {
           // Single string for a generic array type (not u8, not CSV).
           // This might be for an array of length 1.
           console.warn(`_formatValueBasedOnType: Single string value "${value.substring(0,40)}..." for generic array of ${elementType.kind}. This is unusual unless array length is 1.`);
           if (length === 1) {
             if(elementType.kind === 'field') result.push(BigInt(value));
             else if(elementType.kind === 'integer') result.push(BigInt(value));
             else {
                console.warn(`_formatValueBasedOnType: Unhandled single string for array element of kind ${elementType.kind}. Pushing raw value.`);
                result.push(value);
             }
           } else if (length > 1 && value.trim() !== '') {
             console.error(`_formatValueBasedOnType: A non-empty single string "${value.substring(0,40)}..." was provided for an array of length ${length} and type ${elementType.kind}. This will likely lead to incorrect padding or errors.`);
           }
        }
      } else if (Array.isArray(value)) {
        result = value.map(item => this._formatValueBasedOnType(item, elementType));
      } else if (value !== undefined && value !== null) {
        console.warn(`_formatValueBasedOnType: Value for array is not a string or array (type: ${typeof value}, value: "${String(value).substring(0,40)}..."). Using empty for padding.`);
      }
      
      // Pad or truncate to the required length
      const defaultPaddingValue = () => {
        if (elementType.kind === 'integer') return BigInt(0); // Noir.js generally wants BigInt for integers
        if (elementType.kind === 'field') return BigInt(0);
        if (elementType.kind === 'boolean') return false;
        console.warn(`_formatValueBasedOnType: No default padding for array element type ${elementType.kind}. Using 0.`);
        return 0; // Generic fallback
      };

      while (result.length < length) {
        result.push(defaultPaddingValue());
      }
      return result.slice(0, length);
    }
    
    if (kind === 'string'){ // Noir 'string' type is not standard, often represented as bytes
        console.warn('_formatValueBasedOnType: Noir "string" type encountered. Consider representing as byte array in ABI.');
        // Assuming it might be an array of u8, convert string to char codes
        if (typeof value === 'string') {
            let bytes = Array.from(value).map(c => c.charCodeAt(0));
            const { length } = typeDefinition; // if string has a fixed length in ABI
             if (length) {
                while (bytes.length < length) bytes.push(0);
                return bytes.slice(0, length);
            }
            return bytes;
        }
    }

    console.warn(`_formatValueBasedOnType: Unhandled ABI type kind: "${kind}" for value:`, value);
    return value; // Return as-is if type is not recognized, may cause issues.
  }

  /**
   * Formats a raw input object according to the circuit's ABI.
   * @param {object} rawInputs - An object containing raw input values.
   * @returns {object} An object with input values formatted for Noir execution.
   */
  _formatInputsBasedOnAbi(rawInputs) {
    if (!this.circuitAbi || !this.circuitAbi.parameters) {
      console.warn('Circuit ABI not available. Cannot format inputs based on ABI.');
      return rawInputs; // Return raw inputs if ABI is not loaded
    }

    const formattedInputs = {};
    console.log('Formatting inputs based on ABI:');

    for (const param of this.circuitAbi.parameters) {
      const paramName = param.name;
      const rawValue = rawInputs[paramName];

      if (rawValue === undefined) {
        console.warn(`ABI parameter "${paramName}" not found in raw inputs. It might be optional or an issue.`);
        // Depending on circuit, might need to provide a default or throw error
        // For now, we skip, Noir.js might handle missing optional params or error out
        continue; 
      }
      
      console.log(`Formatting "${paramName}": raw type=${typeof rawValue}, raw value (sample)="${String(rawValue).substring(0,50)}${String(rawValue).length > 50 ? '...' : ''}", ABI type=${JSON.stringify(param.type)}`);
      try {
        formattedInputs[paramName] = this._formatValueBasedOnType(rawValue, param.type);
        console.log(`Formatted "${paramName}": new type=${typeof formattedInputs[paramName]}, new value (sample)="${String(formattedInputs[paramName]).substring(0,50)}${String(formattedInputs[paramName]).length > 50 ? '...' : ''}"`);
      } catch (error) {
         console.error(`Error formatting parameter "${paramName}" with value "${rawValue}":`, error.message);
         throw new Error(`Failed to format ABI parameter "${paramName}": ${error.message}`);
      }
    }
    return formattedInputs;
  }

  /**
   * Generate proof for time & location attestation
   * @param {object} params - Inputs for proof generation
   * @returns {Promise<object>} Result of proof generation
   */
  async generateTimeLocationProof(params) {
    try {
      if (!this.initialized) {
        const initState = await this.initialize();
        if (!initState) {
          throw new Error('NoirService is not initialized and initialization failed. Cannot generate proof.');
        }
      }
      
      if (!this.noir || !this.backend) {
        await this.loadCircuit(); // Attempt to load again if somehow not available
        if (!this.noir || !this.backend) {
          throw new Error('Noir execution environment (noir/backend) not available. Cannot generate proof.');
        }
      }
      
      // Format and validate inputs
      console.log(`Raw inputs received for proof generation:`, JSON.stringify(params, (_, v) => typeof v === 'bigint' ? v.toString() : v));
      
      // Extract the gpsEnabled flag
      const gpsEnabled = params.gpsEnabled_bool !== undefined ? params.gpsEnabled_bool : !!params.gpsEnabled;
      console.log(`GPS enabled: ${gpsEnabled}`);
      
      // Process GPS coordinates - only required if GPS is enabled
      let latitude = 0;
      let longitude = 0;
      
      if (gpsEnabled) {
        // GPS is enabled, require coordinates
        if (!params.latitude || !params.longitude) {
          throw new Error('Latitude and longitude are required when GPS is enabled');
        }
        latitude = Math.round(parseFloat(params.latitude) * 1000000);
        longitude = Math.round(parseFloat(params.longitude) * 1000000);
        console.log(`Using GPS coordinates: ${latitude}, ${longitude}`);
      } else {
        console.log('GPS disabled. Coordinates will not be validated.');
      }

      // Format image signature - handle different formats
      let imageSignature;
      if (params.imageSignature) {
        // Use existing imageSignature if provided
        imageSignature = params.imageSignature;
      } else if (params.signature) {
        // Use signature from payload if imageSignature not provided
        imageSignature = params.signature;
      } else {
        throw new Error('No signature provided. Either imageSignature or signature is required.');
      }
      
      // Common inputs for both GPS-enabled and GPS-disabled scenarios
      const formattedInputs = {
        verifier_image_hash: this._hexToByteArray(params.verifierImageHash || params.imageHash),
        min_timestamp_bound: params.minTimestampBound || 0,
        max_timestamp_bound: params.maxTimestampBound || Math.floor(Date.now() / 1000) + 86400,
        min_latitude_bound: params.minLatitudeBound || 0,
        max_latitude_bound: params.maxLatitudeBound || 0,
        min_longitude_bound: params.minLongitudeBound || 0,
        max_longitude_bound: params.maxLongitudeBound || 0,
        signed_image_hash: this._hexToByteArray(params.signedImageHash || params.imageHash),
        image_signature: imageSignature,
        timestamp: params.timestamp || Math.floor(Date.now() / 1000),
        latitude: latitude,
        longitude: longitude,
        gps_enabled_bool: gpsEnabled
      };
      
      // Format based on ABI
      const inputs = this._formatInputsBasedOnAbi(formattedInputs);
      console.log(`Formatted inputs for Noir circuit:`, JSON.stringify(inputs, (_, v) => typeof v === 'bigint' ? v.toString() : v));
      
      // Debug: Write the inputs to a file
      try {
        fs.writeFileSync('debug_inputs.json', JSON.stringify(formattedInputs, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
        console.log('Debug inputs written to debug_inputs.json');
      } catch (err) {
        console.warn('Could not write debug inputs:', err.message);
      }
      
      // Execute the circuit using noir_js
      console.log(`Executing Noir circuit with noir_js...`);
      const startTime = Date.now();
      
      // Generate the witness and proof
      const { witness } = await this.noir.execute(inputs);
      
      console.log(`Witness generation took ${Date.now() - startTime}ms`);
      
      // Generate proof
      console.log('Generating proof...');
      const proofStartTime = Date.now();
      const proof = await this.backend.generateProof(witness);
      console.log(`Proof generation took ${Date.now() - proofStartTime}ms`);
      
      // Verify proof
      console.log('Verifying proof...');
      const verifyStartTime = Date.now();
      const verified = await this.backend.verifyProof(proof);
      console.log(`Proof verification took ${Date.now() - verifyStartTime}ms`);
      console.log(`Proof verification result: ${verified ? 'VALID' : 'INVALID'}`);

      return {
        success: true,
        verified,
        proof: Buffer.from(proof).toString('hex'),
        inputs: formattedInputs,
        gpsEnabled
      };
    } catch (error) {
      console.error('Error in generateTimeLocationProof:', error);
      // Write the full error to the debug log for postmortem analysis
      try {
        fs.appendFileSync('debug.log', `\n\nERROR in generateTimeLocationProof [${new Date().toISOString()}]:\n${error.stack || error.message || error}`);
      } catch (_) { /* ignore */ }
      
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
      };
    }
  }

  /**
   * Verifies a given proof artifact.
   * @param {object} proofArtifact - The proof object, typically { proof: Uint8Array, publicInputs: Map<number, string> }.
   * @returns {Promise<boolean>} True if the proof is valid, false otherwise.
   */
  async verifyProof(proofArtifact) {
    if (!this.initialized) {
      const initState = await this.initialize();
       if (!initState) {
         console.error('NoirService is not initialized and initialization failed. Cannot verify proof.');
         return false;
      }
    }
     if (!this.backend) {
        await this.loadCircuit();
        if(!this.backend){
            console.error('Backend not available for proof verification.');
            return false;
        }
    }

    if (!proofArtifact || !proofArtifact.proof || !proofArtifact.publicInputs) {
      console.error('Invalid proof artifact provided for verification. Missing proof or publicInputs.');
      return false;
    }

    try {
      console.log('Verifying provided proof artifact...');
      const isValid = await this.backend.verifyProof(proofArtifact);
      console.log(`Verification result from verifyProof method: ${isValid}`);
      return isValid;
    } catch (error) {
      console.error('Error during proof verification:', error);
      return false;
    }
  }

  /**
   * Minimal test to identify Noir circuit compatibility issues
   * @param {object} params - Simple parameters for minimal test.
   * @returns {Promise<object>} Result of the test.
   */
  async testMinimalCircuit(params) {
    if (!this.initialized) {
      const initState = await this.initialize();
      if (!initState) {
         throw new Error('NoirService is not initialized and initialization failed. Cannot run test.');
      }
    }
    
    if (!this.noir || !this.backend) {
        await this.loadCircuit(); // Attempt to load again if somehow not available
        if (!this.noir || !this.backend) {
           throw new Error('Noir execution environment (noir/backend) not available. Cannot run test.');
        }
    }
    
    console.log('testMinimalCircuit called with params:', params);
    
    try {
      // Format inputs based on the ABI
      // First convert input parameter names to match the ABI expectations
      const formattedInputs = {
        verifier_image_hash: params.verifier_image_hash || [],
        min_timestamp_bound: params.min_timestamp_bound || BigInt(0),
        max_timestamp_bound: params.max_timestamp_bound || BigInt(Math.floor(Date.now() / 1000) + 86400),
        min_latitude_bound: params.min_latitude_bound || BigInt(0),
        max_latitude_bound: params.max_latitude_bound || BigInt(0),
        min_longitude_bound: params.min_longitude_bound || BigInt(0),
        max_longitude_bound: params.max_longitude_bound || BigInt(0),
        signed_image_hash: params.signed_image_hash || [],
        image_signature: params.image_signature || [],
        timestamp: params.timestamp || BigInt(Math.floor(Date.now() / 1000)),
        latitude: params.latitude || BigInt(0),
        longitude: params.longitude || BigInt(0),
        gps_enabled_bool: params.gps_enabled_bool !== undefined ? params.gps_enabled_bool : false
      };
      
      // Format the inputs using ABI
      const inputs = this._formatInputsBasedOnAbi(formattedInputs);
      
      // For debugging
      console.log('Formatted test inputs:', JSON.stringify(inputs, (_, v) => 
        typeof v === 'bigint' ? v.toString() : Array.isArray(v) ? `Array(${v.length})` : v
      ));
      
      // Execute the circuit
      console.log('Executing test circuit...');
      const startTime = Date.now();
      
      const { witness } = await this.noir.execute(inputs);
      console.log(`Test witness generation took ${Date.now() - startTime}ms`);
      
      // Generate proof
      const proof = await this.backend.generateProof(witness);
      console.log(`Test proof generation completed`);
      
      // Verify proof
      const verified = await this.backend.verifyProof(proof);
      console.log(`Test proof verification result: ${verified ? 'VALID' : 'INVALID'}`);
      
      return {
        success: true,
        verified,
        proof: Buffer.from(proof).toString('hex')
      };
    } catch (error) {
      console.error('Error in testMinimalCircuit:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Convert a hex string to a byte array
   * @param {string} hex - The hex string to convert (with or without '0x' prefix)
   * @returns {Array<number>} The byte array
   */
  _hexToByteArray(hex) {
    if (!hex) {
      console.warn('_hexToByteArray: Empty or undefined hex string provided');
      return Array(32).fill(0); // Return 32 bytes of zeros as default
    }
    
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    
    // Ensure even length
    const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
    
    // Convert to byte array with BigInt values for Noir
    const byteArray = [];
    for (let i = 0; i < paddedHex.length; i += 2) {
      const byte = parseInt(paddedHex.substr(i, 2), 16);
      byteArray.push(byte);
    }
    
    // Ensure array is exactly 32 bytes for hash values
    while (byteArray.length < 32) {
      byteArray.push(0);
    }
    
    return byteArray.slice(0, 32); // Ensure we don't exceed 32 bytes
  }
}

const noirService = new NoirService();
// noirService.initialize(); // Optional: auto-initialize on module load, or lazy-init on first call.

export default noirService; 