// Wrapper for snarkjs functions with proper polyfills
import './setupPolyfills';

// Manually provide a process object that snarkjs expects
if (typeof window.process === 'undefined' || !window.process.browser) {
  window.process = {
    env: {},
    browser: true,
    version: '',
    nextTick: function(cb) {
      setTimeout(cb, 0);
    }
  };
}

// Import snarkjs groth16 after setting up polyfills
let snarkjsModule = null;
let loadingPromise = null;

// Pre-load snarkjs on module initialization
async function loadSnarkjs() {
  if (loadingPromise) {
    return loadingPromise;
  }
  
  loadingPromise = new Promise(async (resolve, reject) => {
    try {
      console.log('Loading snarkjs module...');
      const module = await import('snarkjs');
      console.log('snarkjs loaded successfully:', module);
      snarkjsModule = module;
      resolve(module);
    } catch (error) {
      console.error('Error loading snarkjs:', error);
      loadingPromise = null; // Reset promise so we can try again
      reject(error);
    }
  });
  
  return loadingPromise;
}

// Initialize the module
loadSnarkjs().catch(error => {
  console.error('Initial snarkjs load failed:', error);
});

/**
 * Utility function to format hex values in the correct format for contract calls
 * @param {string|number|BigInt} value - The value to convert to proper hex format
 * @returns {string} - Properly formatted value for contract calls
 */
export function formatHexValue(value) {
  try {
    console.log('Formatting value:', value);
    
    // If value is already a string, use it directly
    if (typeof value === 'string') {
      // For values that already have 0x prefix and are long, return as is
      if (value.startsWith('0x') && value.length > 20) {
        return value;
      }
      
      // For decimal strings
      if (!value.startsWith('0x') && !isNaN(value)) {
        return value;
      }
    }
    
    // For other cases, convert to BigInt and then to string
    return String(BigInt(value));
  } catch (error) {
    console.error('Error formatting value:', error, 'Original value:', value);
    // Return the original value as a string
    return String(value);
  }
}

/**
 * Wrapper for snarkjs groth16.fullProve
 * @param {Object} input - The input for the proof
 * @param {string} wasmPath - Path to the wasm file
 * @param {string} zkeyPath - Path to the zkey file
 * @returns {Promise<Object>} - The proof and public signals
 */
export async function fullProve(input, wasmPath, zkeyPath) {
  // Make sure snarkjs is loaded
  if (!snarkjsModule) {
    try {
      console.log('Loading snarkjs before generating proof...');
      snarkjsModule = await loadSnarkjs();
    } catch (error) {
      console.error('Failed to load snarkjs:', error);
      throw new Error('Failed to load snarkjs: ' + error.message);
    }
  }

  try {
    // Ensure wasmPath and zkeyPath are valid
    if (!wasmPath || !zkeyPath) {
      throw new Error('Invalid paths for proof generation');
    }
    
    console.log('Generating proof with input:', input);
    console.log('Using wasm path:', wasmPath);
    console.log('Using zkey path:', zkeyPath);
    
    if (!snarkjsModule.groth16) {
      throw new Error('snarkjs.groth16 is not available, module not properly loaded');
    }
    
    // Pre-process input to ensure all values are compatible with BigInt
    const processedInput = { ...input };
    
    // Check if our safeBigIntConversion utility is available
    const safeBigInt = window.safeBigIntConversion || ((val) => {
      // Fallback if utility not available
      try {
        if (typeof val === 'string') val = val.replace(/,/g, '').trim();
        return String(val);
      } catch (e) {
        return "0";
      }
    });
    
    // Ensure nullifier and secret are clean strings
    if (processedInput.nullifier) {
      const safeNullifier = safeBigInt(processedInput.nullifier);
      processedInput.nullifier = typeof safeNullifier === 'bigint' ? 
        safeNullifier.toString() : String(safeNullifier);
    }
    
    if (processedInput.secret) {
      const safeSecret = safeBigInt(processedInput.secret);
      processedInput.secret = typeof safeSecret === 'bigint' ? 
        safeSecret.toString() : String(safeSecret);
    }
    
    // Process pathElements to ensure each element is a valid BigInt-compatible string
    if (Array.isArray(processedInput.pathElements)) {
      processedInput.pathElements = processedInput.pathElements.map(el => {
        const safePath = safeBigInt(el);
        return typeof safePath === 'bigint' ? 
          safePath.toString() : String(safePath);
      });
    }
    
    console.log('Processed input for proof generation:', processedInput);
    
    const result = await snarkjsModule.groth16.fullProve(processedInput, wasmPath, zkeyPath);
    console.log('Proof generated successfully');
    return result;
  } catch (error) {
    console.error('Error in fullProve:', error);
    throw error;
  }
} 