// Use our custom snarkjs wrapper instead of direct import
import { fullProve } from './snarkjsHelper';
import { getMimc as getWrappedMimc, safeCircomlib } from './circyomWrapper';

// Get the MiMC hasher using our wrapper
const getMimc = async () => {
  try {
    return await getWrappedMimc();
  } catch (error) {
    console.error('Error getting MiMC hasher:', error);
    throw error;
  }
};

/**
 * Helper function to convert hex to BigInt
 */
const hexToBigInt = (hexStr) => {
  if (hexStr.startsWith('0x')) {
    return BigInt(hexStr);
  }
  return BigInt('0x' + hexStr);
};

/**
 * Helper to ensure consistent format for comparison
 */
const formatForComparison = (value) => {
  if (typeof value === 'string' && value.startsWith('0x')) {
    return hexToBigInt(value).toString();
  }
  return BigInt(value).toString();
};

/**
 * Generate a random field element
 * @returns {BigInt} Random field element
 */
export const generateRandomFieldElement = () => {
  const max = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = (randomBigInt << BigInt(8)) | BigInt(randomBytes[i]);
  }
  return randomBigInt % max;
};

/**
 * Calculate hash using MiMC hash method (two-step approach)
 * This matches how the contract calculates hashes
 */
const calculateHash = async (mimc, left, right) => {
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
 * Generate a commitment and nullifier hash for registration
 * @returns {Object} Object with commitment and related values
 */
export const generateCommitment = async () => {
  try {
    const mimc = await getMimc();
    
    // Generate random values for nullifier and secret
    const nullifier = generateRandomFieldElement();
    const secret = generateRandomFieldElement();
    
    // Use the two-step hash approach
    const commitment = await safeCircomlib(async () => calculateHash(mimc, nullifier, secret));
    const nullifierHash = await safeCircomlib(async () => calculateHash(mimc, nullifier, BigInt(0)));
    
    // Ensure all values are properly converted to strings
    const commitmentStr = commitment.toString();
    const nullifierHashStr = nullifierHash.toString();
    
    console.log('Generated commitment:', commitmentStr);
    console.log('Generated nullifier hash:', nullifierHashStr);
  
    return {
      nullifier: nullifier.toString(),
      secret: secret.toString(),
      commitment: commitmentStr,
      nullifierHash: nullifierHashStr
    };
  } catch (error) {
    console.error('Error generating commitment:', error);
    throw error;
  }
};

/**
 * Calculate the Merkle root and generate ZK proof
 * @param {string} nullifier - The nullifier value
 * @param {string} secret - The secret value
 * @param {Object} merkleProof - The Merkle proof
 * @returns {Object} The proof and public signals
 */
export const calculateMerkleRootAndZKProof = async (nullifier, secret, merkleProof) => {
  try {
    // Ensure merkleProof.root is available
    if (!merkleProof || !merkleProof.root) {
      throw new Error("Merkle proof is invalid or missing root");
    }
    
    console.log("Using root for proof:", merkleProof.root);
    
    // Create the input for the proof
    const input = {
      nullifier: nullifier,
      secret: secret,
      pathElements: merkleProof.pathElements || [],
      pathIndices: merkleProof.pathIndices || []
    };
    
    console.log("Proof input:", input);

    // Generate the proof using our snarkjs wrapper
    const { proof, publicSignals } = await fullProve(
      input,
      'circuits/Verifier.wasm',
      'circuits/Verifier_0001.zkey'
    );
    
    console.log("Public signals from proof:", publicSignals);
    
    // The circuit outputs the nullifierHash first, then the calculated root
    // Check if we have the expected public signals
    if (publicSignals.length !== 2) {
      console.error("Unexpected number of public signals:", publicSignals.length);
      throw new Error("Proof generated invalid number of public signals");
    }

    // Format the proof for the smart contract
    const proofForContract = {
      a: [proof.pi_a[0].toString(), proof.pi_a[1].toString()],
      b: [
        [proof.pi_b[0][1].toString(), proof.pi_b[0][0].toString()], 
        [proof.pi_b[1][1].toString(), proof.pi_b[1][0].toString()]
      ],
      c: [proof.pi_c[0].toString(), proof.pi_c[1].toString()],
      // First public signal is the nullifier hash
      nullifierHash: publicSignals[0].toString(),
      // Second public signal is the calculated root
      root: publicSignals[1].toString()
    };

    // Compare the calculated root with the merkleProof root
    const calculatedRootFormatted = formatForComparison(publicSignals[1].toString());
    const contractRootFormatted = formatForComparison(merkleProof.root);
    
    console.log("Root from contract:", contractRootFormatted);
    console.log("Root calculated in circuit:", calculatedRootFormatted);
    
    // We'll continue regardless of whether the roots match
    // The verification will happen in the contract
    if (calculatedRootFormatted !== contractRootFormatted) {
      console.warn("⚠️ WARNING: Calculated root doesn't match contract root.");
      console.warn("Will continue with the circuit-calculated root, but transaction may fail.");
    } else {
      console.log("✅ Calculated root matches contract root!");
    }
    
    console.log("FULL PROOF OBJECT:", proofForContract);

    return proofForContract;
  } catch (error) {
    console.error("Error generating proof:", error);
    throw error;
  }
};

/**
 * Generate a Merkle proof for a commitment
 * @param {string} commitment - The commitment value
 * @param {Array<string>} tree - The current Merkle tree
 * @param {number} leafIndex - The index of the commitment in the tree
 * @returns {Object} The Merkle proof
 */
export const generateMerkleProof = async (commitment, tree, leafIndex) => {
  const mimc = await getMimc();
  const pathElements = [];
  const pathIndices = [];
  let index = leafIndex;
  
  // Generate the proof
  for (let i = 0; i < tree.levels; i++) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const siblingValue = siblingIndex < tree.leaves.length ? tree.leaves[siblingIndex] : tree.zeros[i];
    
    pathElements.push(siblingValue);
    pathIndices.push(index % 2);
    
    index = Math.floor(index / 2);
  }
  
  return {
    pathElements,
    pathIndices
  };
};

/**
 * Store the voter's secrets in local storage
 * @param {Object} voterData - The voter's data
 */
export const storeVoterSecrets = (voterData) => {
  localStorage.setItem('voterSecrets', JSON.stringify(voterData));
};

/**
 * Retrieve the voter's secrets from local storage
 * @returns {Object|null} The voter's data or null if not found
 */
export const getVoterSecrets = () => {
  const data = localStorage.getItem('voterSecrets');
  return data ? JSON.parse(data) : null;
}; 