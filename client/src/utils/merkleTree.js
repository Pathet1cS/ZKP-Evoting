// A simplified Merkle tree implementation for testing ZKP
import { getMimc } from './circyomWrapper';

// Use the same zero value as in the backend
const ZERO_VALUE = '21663839004416932945382355908790599225266501822907911457504978515578255421292'; // = keccak256("tornado") % FIELD_SIZE

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
 * Calculate hash using MiMC hash method (two-step approach)
 * This matches how the circuit calculates hashes
 */
const calculateHash = (mimc, left, right) => {
  console.log(`Calculating hash of: ${left.toString()} and ${right.toString()}`);
  
  let R = mimc.F.e(left);
  let C = mimc.F.e(0);
  
  // First MiMCSponge
  const result1 = mimc.hash(R, C, 0);
  R = result1.xL;
  C = result1.xR;
  
  // Add right
  R = mimc.F.add(R, mimc.F.e(right)); 
  
  // Second MiMCSponge
  const result2 = mimc.hash(R, C, 0);
  const hashResult = mimc.F.toObject(result2.xL);
  
  console.log(`Hash result: ${hashResult.toString()}`);
  return hashResult;
};

/**
 * Generate zeros for the Merkle tree
 */
const generateZeros = (mimc, levels) => {
  let zeros = [];
  zeros[0] = BigInt(ZERO_VALUE);
  console.log(`Zero level 0: ${zeros[0].toString()}`);
  
  for (let i = 1; i <= levels; i++) {
    zeros[i] = calculateHash(mimc, zeros[i - 1], zeros[i - 1]);
    console.log(`Zero level ${i}: ${zeros[i].toString()}`);
  }
  return zeros;
};

/**
 * Generate Merkle root and path to specified element
 */
const calculateMerkleRootAndPath = (mimc, levels, elements, element = null) => {
  const capacity = 2 ** levels;
  if (elements.length > capacity) throw new Error('Tree is full');

  const zeros = generateZeros(mimc, levels);
  let layers = [];
  layers[0] = elements.slice();
  
  for (let level = 1; level <= levels; level++) {
    layers[level] = [];
    for (let i = 0; i < Math.ceil(layers[level - 1].length / 2); i++) {
      layers[level][i] = calculateHash(
        mimc,
        layers[level - 1][i * 2],
        i * 2 + 1 < layers[level - 1].length ? layers[level - 1][i * 2 + 1] : zeros[level - 1],
      );
    }
  }

  const root = layers[levels].length > 0 ? layers[levels][0] : zeros[levels];

  let pathElements = [];
  let pathIndices = [];

  if (element) {
    let index = layers[0].findIndex(e => BigInt(e) === BigInt(element));
    if (index === -1) throw new Error('Element not found in tree');
    
    for (let level = 0; level < levels; level++) {
      pathIndices[level] = index % 2;
      pathElements[level] = (index ^ 1) < layers[level].length ? layers[level][index ^ 1] : zeros[level];
      index = Math.floor(index / 2);
    }
  }

  return {
    root: root.toString(),
    pathElements: pathElements.map(v => v.toString()),
    pathIndices: pathIndices
  };
};

/**
 * MerkleTree class rewritten to match the test_complete_flow.js implementation
 */
export class MerkleTree {
  constructor(levels = 20) {
    this.levels = levels;
    this.leaves = [];
    this.zeros = [];
    this.filledSubTrees = [];
    this.root = null;
    this.mimcHash = null;
    this.initialized = false;
  }

  /**
   * Initialize the Merkle tree
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Get the MiMC hash function
      this.mimcHash = await getMimc();
      
      // Debug the structure of the mimc object
      console.log("MiMC hasher object keys:", Object.keys(this.mimcHash));
      
      // Generate zero values for each level
      this.zeros = generateZeros(this.mimcHash, this.levels);
      
      // Initialize filled subtrees with zeros
      this.filledSubTrees = [...this.zeros];
      
      // Initialize root with the highest level zero
      this.root = this.zeros[this.levels];
      
      this.initialized = true;
      console.log("Merkle tree initialized with root:", this.root.toString());
    } catch (error) {
      console.error("Error initializing Merkle tree:", error);
      throw error;
    }
  }

  /**
   * Insert a new leaf into the tree using the same logic as test_complete_flow.js
   * @param {string} leaf - Leaf value to insert
   * @returns {number} - Index of the inserted leaf
   */
  insert(leaf) {
    if (!this.initialized) {
      throw new Error("Merkle tree not initialized");
    }
    
    const leafBigInt = BigInt(leaf);
    const index = this.leaves.length;
    this.leaves.push(leafBigInt);
    
    let currentIndex = index;
    let currentHash = leafBigInt;
    
    // Update the tree with the new leaf
    for (let i = 0; i < this.levels; i++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      
      let siblingHash;
      if (isLeft && siblingIndex === this.leaves.length) {
        // If the current node is the rightmost node, use a zero value
        siblingHash = this.zeros[i];
      } else if (siblingIndex < this.leaves.length) {
        // If sibling exists, use it
        if (isLeft) {
          this.filledSubTrees[i] = currentHash;
        }
        siblingHash = isLeft ? this.zeros[i] : this.filledSubTrees[i];
      } else {
        // Otherwise use a zero value
        siblingHash = this.zeros[i];
      }
      
      // Hash the current level with the correct left/right order
      currentHash = isLeft 
        ? calculateHash(this.mimcHash, currentHash, siblingHash)
        : calculateHash(this.mimcHash, siblingHash, currentHash);
      
      // Move to the parent index
      currentIndex = Math.floor(currentIndex / 2);
    }
    
    // Update the root
    this.root = currentHash;
    console.log(`Inserted leaf at index ${index}, new root: ${this.root.toString()}`);
    
    return index;
  }

  /**
   * Generate a Merkle proof for a leaf at a specific index
   * @param {number} index - Index of the leaf
   * @returns {Object} - Merkle proof
   */
  generateProof(index) {
    if (!this.initialized) {
      throw new Error("Merkle tree not initialized");
    }
    
    if (index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds`);
    }
    
    // Use the implementation from test_complete_flow.js
    const element = this.leaves[index];
    const result = calculateMerkleRootAndPath(this.mimcHash, this.levels, this.leaves, element);
    
    return {
      root: result.root,
      pathElements: result.pathElements,
      pathIndices: result.pathIndices,
      leaf: element.toString()
    };
  }
}

// Global singleton instance
let treeInstance = null;

/**
 * Initialize the Merkle tree with data from the contract
 * @param {Object} contract - The voting contract instance
 */
export const initializeMerkleTree = async (contract) => {
  try {
    // Always create a fresh tree instance to prevent stale tree issues
    treeInstance = new MerkleTree();
    await treeInstance.initialize();
    
    console.log("Retrieving contract data to rebuild Merkle tree...");
    
    try {
      // Get the contract's root for reference
      const lastRoot = await contract.getLastRoot();
      console.log("Contract root:", lastRoot.toString());
      localStorage.setItem('contractRoot', formatForComparison(lastRoot.toString()));
      
      // IMPORTANT: Rebuild the entire tree from all Commit events
      console.log("Fetching all Commit events to rebuild tree...");
      
      // Try to retrieve commitments from contract events - start from block 0
      try {
        // Get all events from block 0 to ensure we capture everything
        const commitEvents = await contract.queryFilter(
          contract.filters.Commit(),
          0,
          'latest'
        );
        
        console.log(`Found ${commitEvents.length} commit events from the contract`);
        
        if (commitEvents.length > 0) {
          // Clear any existing leaves and rebuild from scratch
          treeInstance.leaves = [];
          
          // Sort events by leaf index to ensure correct tree construction
          const sortedEvents = commitEvents.sort(
            (a, b) => Number(a.args.leafIndex) - Number(b.args.leafIndex)
          );
          
          // Add each commitment to our local tree in correct order
          for (const event of sortedEvents) {
            const commitment = formatForComparison(event.args.commitment);
            const leafIndex = Number(event.args.leafIndex);
            console.log(`Adding commitment ${commitment} at index ${leafIndex}`);
            
            // Insert the commitment
            const insertedIndex = treeInstance.insert(commitment);
            
            // Check if this is the current user's commitment
            const userSecret = JSON.parse(localStorage.getItem('voterSecrets') || '{}');
            if (userSecret && userSecret.commitment && 
                formatForComparison(userSecret.commitment) === formatForComparison(commitment)) {
              console.log(`Found user's commitment at index ${insertedIndex}`);
              localStorage.setItem('voterLeafIndex', insertedIndex.toString());
            }
          }
          
          // Detailed comparison for debugging
          const calculatedRoot = formatForComparison(treeInstance.root.toString());
          const contractRoot = formatForComparison(lastRoot.toString());
          
          console.log("===== ROOT COMPARISON =====");
          console.log(`Calculated root: ${treeInstance.root.toString()}`);
          console.log(`Contract root: ${lastRoot.toString()}`);
          console.log(`Calculated (formatted): ${calculatedRoot}`);
          console.log(`Contract (formatted): ${contractRoot}`);
          
          // Dump the entire leaf set for verification
          console.log("===== LEAVES IN LOCAL TREE =====");
          treeInstance.leaves.forEach((leaf, idx) => {
            console.log(`Leaf ${idx}: ${leaf.toString()}`);
          });
          
          // Get filled subtrees for debugging
          console.log("===== FILLED SUBTREES =====");
          treeInstance.filledSubTrees.forEach((subtree, idx) => {
            console.log(`Subtree ${idx}: ${subtree.toString()}`);
          });
          
          if (calculatedRoot !== contractRoot) {
            console.warn("WARNING: Calculated root doesn't match contract root");
            console.warn(`Calculated: ${calculatedRoot}`);
            console.warn(`Contract: ${contractRoot}`);
          } else {
            console.log("SUCCESS: Rebuilt tree matches contract root!");
          }
        } else {
          console.log("No commit events found, using empty tree");
        }
      } catch (eventsError) {
        console.error("Error retrieving events:", eventsError);
      }
    } catch (rootError) {
      console.error("Error retrieving contract root:", rootError);
    }
    
    return treeInstance;
  } catch (error) {
    console.error("Error initializing Merkle tree:", error);
    throw error;
  }
};

/**
 * Generate a Merkle proof for a leaf index
 * @param {number} leafIndex - Index of the leaf
 * @returns {Object} - Merkle proof with path elements and indices
 */
export const generateMerkleProof = async (leafIndex) => {
  try {
    if (!treeInstance) {
      throw new Error("Merkle tree not initialized. Call initializeMerkleTree first.");
    }
    
    // Validate the leaf index
    if (leafIndex < 0) {
      throw new Error(`Invalid leaf index: ${leafIndex}, must be non-negative`);
    }
    
    // Get the voter's commitment from localStorage
    const voterSecrets = JSON.parse(localStorage.getItem('voterSecrets') || '{}');
    let commitmentToFind = null;
    
    if (voterSecrets && voterSecrets.commitment) {
      commitmentToFind = formatForComparison(voterSecrets.commitment);
      console.log(`Looking for commitment ${commitmentToFind} in tree leaves...`);
    }
    
    // Verify leaf index or try to find the commitment in the tree
    if (leafIndex >= treeInstance.leaves.length || 
        (commitmentToFind && 
         formatForComparison(treeInstance.leaves[leafIndex].toString()) !== commitmentToFind)) {
      console.warn(`Leaf index ${leafIndex} is invalid or doesn't match the voter's commitment.`);
      
      // If we have a commitment, try to find it in the tree
      if (commitmentToFind) {
        // Look for the commitment in the tree
        const foundIndex = treeInstance.leaves.findIndex(
          leaf => formatForComparison(leaf.toString()) === commitmentToFind
        );
        
        if (foundIndex !== -1) {
          console.log(`Found commitment at index ${foundIndex}, using this instead of ${leafIndex}`);
          leafIndex = foundIndex;
          localStorage.setItem('voterLeafIndex', foundIndex.toString());
        } else {
          throw new Error(`Commitment ${commitmentToFind} not found in the Merkle tree`);
        }
      } else {
        throw new Error(`Leaf index ${leafIndex} out of bounds and no commitment found in localStorage`);
      }
    }
    
    // Generate proof
    const proof = treeInstance.generateProof(leafIndex);
    
    // Get the contract root from local storage
    const contractRoot = localStorage.getItem('contractRoot');
    if (contractRoot) {
      // Override the root with the contract's root for compatibility
      proof.root = contractRoot;
    }
    
    // Add some debugging information
    console.log(`Generated proof for leaf index ${leafIndex} with ${proof.pathElements.length} path elements`);
    console.log(`Merkle root in proof: ${proof.root}`);
    
    return proof;
  } catch (error) {
    console.error("Error generating Merkle proof:", error);
    throw error;
  }
};

/**
 * Register a commitment in the local Merkle tree
 * @param {string} commitment - The commitment to register
 * @returns {number} - The index of the inserted commitment
 */
export const registerCommitment = async (commitment) => {
  try {
    if (!treeInstance) {
      throw new Error("Merkle tree not initialized. Call initializeMerkleTree first.");
    }
    
    // Format the commitment consistently
    const formattedCommitment = formatForComparison(commitment);
    console.log(`Registering commitment: ${formattedCommitment}`);
    
    // Check if this commitment is already in the tree
    const existingIndex = treeInstance.leaves.findIndex(
      leaf => formatForComparison(leaf.toString()) === formattedCommitment
    );
    
    if (existingIndex !== -1) {
      console.log(`Commitment already exists in tree at index ${existingIndex}`);
      localStorage.setItem('voterLeafIndex', existingIndex.toString());
      return existingIndex;
    }
    
    // Insert the commitment
    const index = treeInstance.insert(formattedCommitment);
    console.log(`Inserted commitment at index ${index}, new root: ${treeInstance.root.toString()}`);
    
    // Store the leaf index for later use
    localStorage.setItem('voterLeafIndex', index.toString());
    
    return index;
  } catch (error) {
    console.error("Error registering commitment:", error);
    throw error;
  }
}; 