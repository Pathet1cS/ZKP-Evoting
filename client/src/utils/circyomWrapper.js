// Wrapper for circomlibjs to ensure Buffer is available
import './setupPolyfills'; // Make sure polyfills are loaded
import { buildMimcSponge } from 'circomlibjs';

// Cache for the MiMC hasher
let mimcSpongeCache = null;

/**
 * Get the MiMC hasher with proper Buffer handling
 * @returns {Promise<object>} The MiMC hasher
 */
export const getMimc = async () => {
  if (mimcSpongeCache === null) {
    // Ensure Buffer is available
    if (typeof window.Buffer === 'undefined') {
      console.error('Buffer is not defined! Using polyfill...');
      const { Buffer } = await import('buffer');
      window.Buffer = Buffer;
      global.Buffer = Buffer;
    }
    
    try {
      mimcSpongeCache = await buildMimcSponge();
      console.log('MiMC hasher built successfully');
      
      // The object already has the hash functionality we need
      // No need to add custom hash methods
      
    } catch (error) {
      console.error('Error building MiMC hasher:', error);
      throw error;
    }
  }
  return mimcSpongeCache;
};

/**
 * Calculate hash using MiMC hash method (two-step approach)
 * This matches how the contract and backend calculate hashes
 */
export const calculateHash = async (mimc, left, right) => {
  try {
    // Make sure we're using BigInts
    const leftBigInt = BigInt(left.toString());
    const rightBigInt = BigInt(right.toString());
    
    // Convert inputs to field elements
    let R = mimc.F.e(leftBigInt);
    let C = mimc.F.e(0);
    
    // First MiMCSponge - exact same pattern as in the backend
    const result1 = mimc.hash(R, C, 0);
    R = result1.xL;
    C = result1.xR;
    
    // Add right input to the result
    R = mimc.F.add(R, mimc.F.e(rightBigInt));
    
    // Second MiMCSponge hash
    const result2 = mimc.hash(R, C, 0);
    
    // Return the result as a BigInt
    return mimc.F.toObject(result2.xL);
  } catch (error) {
    console.error("Error in calculateHash:", error);
    throw error;
  }
};

/**
 * Try to safely use circomlibjs functions with error handling for Buffer
 * @param {Function} fn - The function to execute
 * @param {Array} args - Arguments for the function
 * @returns {Promise<any>} The result of the function
 */
export const safeCircomlib = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.toString().includes('Buffer is not defined')) {
      console.error('Buffer error in circomlibjs, trying with polyfill...');
      const { Buffer } = await import('buffer');
      window.Buffer = Buffer;
      global.Buffer = Buffer;
      // Try again
      return await fn(...args);
    }
    throw error;
  }
}; 