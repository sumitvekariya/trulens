import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
// Pinata API configuration
// You'll need to set these environment variables or replace with your API keys
const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || '';
const PINATA_JWT = process.env.PINATA_JWT; // JWT is preferred over API key/secret

class PinataService {
  constructor() {
    this.initialized = false;
    this.baseUrl = 'https://api.pinata.cloud';
    this.gateway = 'https://silver-chemical-parrotfish-261.mypinata.cloud/ipfs';
    this.altGateways = [
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs',
      'https://dweb.link/ipfs'
    ];
  }

  // Check if credentials are configured
  async initialize() {
    if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_SECRET_KEY)) {
      console.warn('⚠️ Pinata credentials not found! Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables.');
      console.warn('IPFS storage will not work until credentials are configured.');
      this.initialized = false;
      return false;
    }
    
    this.initialized = true;
    console.log('Pinata service initialized successfully');
    return true;
  }

  // Store JSON data on IPFS via Pinata
  async storeJSON(data) {
    try {
      if (!this.initialized) {
        await this.initialize();
        if (!this.initialized) {
          throw new Error('Pinata service not initialized. Please configure API credentials.');
        }
      }
      
      const jsonString = JSON.stringify(data);
      
      // Headers setup
      const headers = this._getAuthHeaders();
      headers['Content-Type'] = 'application/json';
      
      // Make API request to pin JSON
      const response = await axios.post(
        `${this.baseUrl}/pinning/pinJSONToIPFS`,
        { 
          pinataContent: data,
          pinataMetadata: {
            name: `trulens-metadata-${Date.now()}`,
          }
        },
        { headers }
      );
      
      if (response.status === 200) {
        return {
          success: true,
          cid: response.data.IpfsHash,
          data
        };
      } else {
        throw new Error(`Pinata API returned status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to store JSON on Pinata:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Retrieve JSON from IPFS using Pinata gateway with fallbacks
  async retrieveJSON(cidString) {
    try {
      // Try main gateway first
      try {
        const response = await axios.get(`${this.gateway}/${cidString}`);
        return {
          success: true,
          data: response.data,
          gateway: this.gateway
        };
      } catch (mainError) {
        console.warn(`Failed to retrieve from main gateway: ${mainError.message}`);
        
        // Try alternative gateways
        for (const gateway of this.altGateways) {
          try {
            console.log(`Trying alternative gateway: ${gateway}`);
            const response = await axios.get(`${gateway}/${cidString}`);
            return {
              success: true,
              data: response.data,
              gateway
            };
          } catch (altError) {
            console.warn(`Failed to retrieve from ${gateway}: ${altError.message}`);
          }
        }
        
        throw new Error('All IPFS gateways failed to retrieve content');
      }
    } catch (error) {
      console.error('Failed to retrieve JSON from IPFS gateways:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Store file on IPFS via Pinata
  async storeFile(fileBuffer, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
        if (!this.initialized) {
          throw new Error('Pinata service not initialized. Please configure API credentials.');
        }
      }
      
      // Create form data with file
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: options.filename || `file-${Date.now()}`
      });
      
      // Add metadata
      formData.append('pinataMetadata', JSON.stringify({
        name: options.name || `trulens-file-${Date.now()}`
      }));
      
      // Add options
      if (options.pinataOptions) {
        formData.append('pinataOptions', JSON.stringify(options.pinataOptions));
      }
      
      // Headers setup
      const headers = this._getAuthHeaders();
      Object.assign(headers, formData.getHeaders());
      
      // Make API request to pin file
      const response = await axios.post(
        `${this.baseUrl}/pinning/pinFileToIPFS`,
        formData,
        { headers }
      );
      
      if (response.status === 200) {
        return {
          success: true,
          cid: response.data.IpfsHash
        };
      } else {
        throw new Error(`Pinata API returned status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to store file on Pinata:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  // Retrieve file from IPFS using Pinata gateway with fallbacks
  async retrieveFile(cidString) {
    try {
      // Try main gateway first
      try {
        const response = await axios.get(`${this.gateway}/${cidString}`, {
          responseType: 'arraybuffer'
        });
        
        return {
          success: true,
          data: Buffer.from(response.data),
          gateway: this.gateway
        };
      } catch (mainError) {
        console.warn(`Failed to retrieve file from main gateway: ${mainError.message}`);
        
        // Try alternative gateways
        for (const gateway of this.altGateways) {
          try {
            console.log(`Trying alternative gateway for file: ${gateway}`);
            const response = await axios.get(`${gateway}/${cidString}`, {
              responseType: 'arraybuffer'
            });
            
            return {
              success: true,
              data: Buffer.from(response.data),
              gateway
            };
          } catch (altError) {
            console.warn(`Failed to retrieve file from ${gateway}: ${altError.message}`);
          }
        }
        
        throw new Error('All IPFS gateways failed to retrieve file');
      }
    } catch (error) {
      console.error('Failed to retrieve file from IPFS gateways:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper method to get appropriate headers for Pinata API
  _getAuthHeaders() {
    if (PINATA_JWT) {
      return {
        'Authorization': `Bearer ${PINATA_JWT}`
      };
    } else if (PINATA_API_KEY && PINATA_SECRET_KEY) {
      return {
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY
      };
    } else {
      throw new Error('No Pinata credentials available. Set PINATA_API_KEY and PINATA_SECRET_KEY environment variables.');
    }
  }

  // No shutdown needed
  async shutdown() {
    console.log('Pinata service shutdown (no-op)');
    return true;
  }

  // Helper to ensure initialized
  async ensureInitialized() {
    if (!this.initialized) {
      return await this.initialize();
    }
    return this.initialized;
  }
}

// Create a singleton instance
const pinataService = new PinataService();

export default pinataService; 