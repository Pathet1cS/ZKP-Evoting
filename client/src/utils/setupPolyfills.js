// Setup polyfills for circomlibjs and other libraries that need Node.js built-ins
import { Buffer } from 'buffer';

// Add Buffer to window and global objects
window.Buffer = Buffer;
global.Buffer = Buffer;

// Make sure process is available
window.process = window.process || { env: {} };
global.process = global.process || { env: {} };

// Add a utility function for safe BigInt conversions to the window object
window.safeBigIntConversion = (value) => {
  if (typeof value === 'bigint') return value;
  
  if (typeof value === 'string') {
    // Clean up the string first
    const cleanValue = value
      .replace(/,/g, '') // Remove commas
      .replace(/[\[\]]/g, '') // Remove brackets
      .trim(); // Remove whitespace
    
    try {
      return BigInt(cleanValue);
    } catch (err) {
      console.error(`Failed to convert string to BigInt: ${value}`, err);
      return BigInt(0);
    }
  }
  
  if (typeof value === 'number') {
    return BigInt(Math.floor(value));
  }
  
  if (Array.isArray(value)) {
    // Try to join the array without commas
    const joined = value.join('');
    try {
      return BigInt(joined);
    } catch (err) {
      // Try each value individually
      console.error(`Failed to convert array to BigInt: ${value}`, err);
      return BigInt(0);
    }
  }
  
  console.error(`Cannot convert value to BigInt: ${value}`);
  return BigInt(0);
};

export default function setupPolyfills() {
  // This function doesn't need to do anything else since the imports above will execute
  console.log('Polyfills for Buffer and process have been set up');
} 