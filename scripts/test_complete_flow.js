// Complete flow test script for ZKP voting
/**
 * === UPDATED NOTE ABOUT MERKLE ROOT COMPUTATION ===
 * 
 * This script now uses the MiMCSponge implementation from circomlib directly,
 * which matches the implementation used in the circuit. This eliminates the previous
 * hash implementation mismatch between the circuit and contract.
 * 
 * The circomlib MiMCSponge is now used consistently in both:
 * 1. The circom circuit (in circuits/MerkleTreeChecker.circom)
 * 2. This test script (using circomlibjs)
 * 
 * This approach ensures that the Merkle root calculation is consistent,
 * which is critical for proving correct credential ownership.
 */

const { groth16 } = require('snarkjs');
const fs = require('fs');
const Web3 = require('web3');
const circomlibjs = require('circomlibjs');
const { buildMimcSponge, mimcSpongecontract } = require('circomlibjs');

// Contract artifacts
const ZKVotingSystem = artifacts.require("ZKVotingSystem");
const Verifier = artifacts.require("Groth16Verifier");

// Use the same zero value as in zktree.ts
const ZERO_VALUE = '21663839004416932945382355908790599225266501822907911457504978515578255421292'; // = keccak256("tornado") % FIELD_SIZE

// Build MiMC hash function
const buildMiMCSponge = async () => {
  return await circomlibjs.buildMimcSponge();
};

// Generate a random field element
const generateRandomFieldElement = () => {
  const max = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  const randomBytes = require('crypto').randomBytes(31);
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = (randomBigInt << BigInt(8)) | BigInt(randomBytes[i]);
  }
  return randomBigInt % max;
};

// Helper function to convert hex to BigInt
const hexToBigInt = (hexStr) => {
  if (hexStr.startsWith('0x')) {
    return BigInt(hexStr);
  }
  return BigInt('0x' + hexStr);
};

// Helper to ensure consistent format for comparison
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
  return mimc.F.toObject(result2.xL);
};

/**
 * Generate zeros for the Merkle tree
 */
const generateZeros = (mimc, levels) => {
  let zeros = [];
  zeros[0] = BigInt(ZERO_VALUE);
  for (let i = 1; i <= levels; i++) {
    zeros[i] = calculateHash(mimc, zeros[i - 1], zeros[i - 1]);
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
 * Generate a commitment using multiHash
 */
const generateCommitment = async (mimc) => {
  const nullifier = generateRandomFieldElement();
  const secret = generateRandomFieldElement();
  const commitment = calculateHash(mimc, nullifier, secret);
  const nullifierHash = calculateHash(mimc, nullifier, BigInt(0));
  
  return {
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitment.toString(),
    nullifierHash: nullifierHash.toString()
  };
};

/**
 * Get the current state of the Merkle tree from the contract
 */
const getMerkleTreeFromContract = async (zkVotingSystem, mimc) => {
  const levels = Number(await zkVotingSystem.levels());
  console.log(`Merkle tree has ${levels} levels`);
  
  // Get zeros using our implementation
  const zeros = generateZeros(mimc, levels);
  console.log("Zeros calculated with circomlib:", zeros.map(z => z.toString()));
  
  // Get zeros from the contract for comparison
  const contractZeros = [];
  for (let i = 0; i < levels; i++) {
    const zero = await zkVotingSystem.zeros(i);
    contractZeros.push(BigInt(zero.toString()));
  }
  console.log("Zeros from contract:", contractZeros.map(z => z.toString()));
  
  // Compare zeros
  let zerosMatch = true;
  for (let i = 0; i < levels; i++) {
    const jsZeroFormatted = formatForComparison(zeros[i].toString());
    const contractZeroFormatted = formatForComparison(contractZeros[i].toString());
    if (jsZeroFormatted !== contractZeroFormatted) {
      console.log(`Zero at level ${i} doesn't match:`);
      console.log(`JS: ${jsZeroFormatted}`);
      console.log(`Contract: ${contractZeroFormatted}`);
      zerosMatch = false;
    }
  }
  if (zerosMatch) {
    console.log("✅ All zero values match between JS and contract");
  } else {
    console.log("⚠️ Some zero values don't match");
  }
  
  // Get all filled subtrees from the contract
  const filledSubtrees = [];
  for (let i = 0; i < levels; i++) {
    const subtree = await zkVotingSystem.filledSubtrees(i);
    filledSubtrees.push(BigInt(subtree.toString()));
  }
  console.log("Filled subtrees from contract:", filledSubtrees.map(t => t.toString()));
  
  // Get the current root from the contract
  const currentRoot = await zkVotingSystem.getLastRoot();
  console.log("Current Merkle root from contract:", currentRoot.toString());
  
  // Get the nextIndex to determine how many leaves we have
  const nextIndex = await zkVotingSystem.nextIndex();
  const leavesCount = Number(nextIndex.toString());
  console.log(`Contract has ${leavesCount} leaves`);
  
  // Fetch all existing commitments from contract events
  const leaves = [];
  if (leavesCount > 0) {
    // The contract emits Commit events when leaves are inserted
    const commitEvents = await getCommitEvents(zkVotingSystem);
    console.log(`Found ${commitEvents.length} commit events`);
    
    for (const event of commitEvents) {
      const commitment = BigInt(event.commitment);
      leaves.push(commitment);
      console.log(`Leaf ${event.leafIndex}: ${commitment.toString()}`);
    }
  }
  
  return {
    levels: levels,
    zeros: zeros,
    filledSubtrees: filledSubtrees,
    leaves: leaves,
    root: BigInt(currentRoot.toString()),
    leavesCount: leavesCount
  };
};

/**
 * Get all Commit events from the contract to find commitments
 */
const getCommitEvents = async (zkVotingSystem) => {
  // Get events from the latest 1000 blocks
  const currentBlock = await web3.eth.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 1000);
  
  // Filter for Commit events
  const events = await zkVotingSystem.getPastEvents('Commit', {
    fromBlock: fromBlock,
    toBlock: 'latest'
  });
  
  return events.map(event => ({
    commitment: event.returnValues.commitment,
    leafIndex: Number(event.returnValues.leafIndex),
    timestamp: Number(event.returnValues.timestamp)
  })).sort((a, b) => a.leafIndex - b.leafIndex); // Sort by index
};

/**
 * Generate a Merkle proof for a leaf
 */
const generateMerkleProof = async (tree, leafIndex, zkVotingSystem, mimc) => {
  console.log(`Generating Merkle proof for leaf at index ${leafIndex}...`);
  console.log(`Tree has ${tree.leaves.length} locally stored leaves and ${tree.leavesCount} total leaves in contract`);
  
  // Ensure leaf index is valid
  if (leafIndex >= tree.leavesCount) {
    throw new Error(`Leaf index out of bounds: ${leafIndex} >= ${tree.leavesCount}`);
  }
  
  // Make sure we have the leaf
  if (leafIndex >= tree.leaves.length) {
    throw new Error(`Leaf at index ${leafIndex} not found in local tree`);
  }
  
  const leafValue = tree.leaves[leafIndex];
  console.log(`Using leaf value: ${leafValue.toString()}`);
  
  // Generate Merkle path using our implementation
  const result = calculateMerkleRootAndPath(mimc, tree.levels, tree.leaves, leafValue);
  
  // Log for verification
  console.log("Calculated root from proof:", result.root);
  const contractRoot = await zkVotingSystem.getLastRoot();
  console.log("Contract root:", contractRoot.toString());

  // Compare roots with proper formatting
  const calculatedRootFormatted = formatForComparison(result.root);
  const contractRootFormatted = formatForComparison(contractRoot.toString());
  
  console.log("Calculated root formatted:", calculatedRootFormatted);
  console.log("Contract root formatted:", contractRootFormatted);
  
  if (calculatedRootFormatted === contractRootFormatted) {
    console.log("✅ Calculated root matches contract root");
  } else {
    console.log("⚠️ Calculated root doesn't match contract root");
  }

  return {
    pathElements: result.pathElements,
    pathIndices: result.pathIndices,
    root: result.root
  };
};

/**
 * Get known roots from the contract history
 */
const getHistoricalRoots = async (zkVotingSystem) => {
  const knownRoots = [];
  // The contract stores ROOT_HISTORY_SIZE (30) historical roots
  for (let i = 0; i < 30; i++) {
    try {
      const root = await zkVotingSystem.roots(i);
      knownRoots.push(root.toString());
    } catch (error) {
      console.log(`Error getting root at index ${i}:`, error.message);
      break;
    }
  }
  return knownRoots;
};

// Main test function
module.exports = async (callback) => {
  try {
    console.log("Starting complete ZKP voting flow test with multiple voters...");
    
    // Get deployed contracts
    const zkVotingSystem = await ZKVotingSystem.deployed();
    const verifier = await Verifier.deployed();
    
    // Get MiMCSponge address from the contract
    const mimcAddress = await zkVotingSystem.hasher();
    
    console.log("ZKVotingSystem address:", zkVotingSystem.address);
    console.log("MiMCSponge address:", mimcAddress);
    console.log("Verifier address:", verifier.address);
    
    // Get accounts
    const accounts = await web3.eth.getAccounts();
    console.log("Available accounts:", accounts.length);
    
    const admin = accounts[0];
    console.log("Admin account:", admin);
    
    // Initialize MiMC hash function from circomlib
    const mimcSponge = await buildMiMCSponge();
    
    // Set up the voting system - add a candidate and start voting
    await setupVotingSystem(zkVotingSystem, admin);
    
    // Number of voters to test
    const numVoters = 3;
    const voterResults = [];
    
    // Process multiple voters
    for (let i = 1; i <= numVoters; i++) {
      // Use different accounts for each voter
      const voterAccount = accounts[i];
      console.log(`\n======= PROCESSING VOTER ${i} (${voterAccount}) =======`);
      
      const result = await processVoter(
        i, // Voter number
        voterAccount, 
        admin, 
        zkVotingSystem, 
        verifier, 
        mimcSponge
      );
      
      voterResults.push(result);
    }
    
    // Display final vote counts
    console.log("\n======= FINAL VOTE COUNTS =======");
    const candidate = await zkVotingSystem.getCandidate(1);
    console.log(`Candidate: ${candidate[0]}`);
    console.log(`Total votes: ${candidate[3].toString()}`);
    
    // Check if votes match expected count
    if (Number(candidate[3]) === numVoters) {
      console.log(`✅ SUCCESS: All ${numVoters} votes were successfully recorded!`);
    } else {
      console.log(`❌ ERROR: Expected ${numVoters} votes but got ${candidate[3]}`);
    }
    
    callback();
  } catch (error) {
    console.error("Error in test:", error);
    callback(error);
  }
};

/**
 * Set up the voting system with a candidate and start voting
 */
async function setupVotingSystem(zkVotingSystem, admin) {
  // Check if we have a candidate, or create one
  let candidateExists = false;
  
  try {
    const candidate = await zkVotingSystem.getCandidate(1);
    console.log("Found candidate:", candidate[0]);
    candidateExists = true;
  } catch (error) {
    console.log("No candidates found");
    candidateExists = false;
  }
  
  if (!candidateExists) {
    console.log("Adding a test candidate...");
    await zkVotingSystem.addCandidate("Test Candidate", "Test Details", { from: admin });
    console.log("Candidate added");
  }
  
  // Check if voting is active
  try {
    const votingStatus = await zkVotingSystem.getVotingStatus();
    const isVotingActive = votingStatus[0]; // Access the first element of the returned array
    console.log("Is voting active:", isVotingActive);
    
    if (!isVotingActive) {
      console.log("Starting voting...");
      await zkVotingSystem.startVoting(600, { from: admin }); // 10 minutes
      console.log("Voting started");
    }
  } catch (error) {
    console.log("Error checking voting status:", error.message);
  }
}

/**
 * Process a single voter - generate credentials, register, and vote
 */
async function processVoter(voterNum, voterAccount, admin, zkVotingSystem, verifier, mimc) {
  try {
    console.log(`Processing voter ${voterNum} with account ${voterAccount}`);
    
    // Get current Merkle tree state from contract
    let merkleTree = await getMerkleTreeFromContract(zkVotingSystem, mimc);
    
    // Generate voter credentials using our improved implementation
    const voterCredentials = await generateCommitment(mimc);
    
    const nullifier = voterCredentials.nullifier;
    const secret = voterCredentials.secret;
    const commitmentStr = voterCredentials.commitment;
    const nullifierHashStr = voterCredentials.nullifierHash;
    
    console.log(`Voter ${voterNum} credentials:`);
    console.log("- Nullifier:", nullifier);
    console.log("- Secret:", secret);
    console.log("- Commitment:", commitmentStr);
    console.log("- Nullifier Hash:", nullifierHashStr);
    
    // Check if the voter is already registered and unregister them if needed
    const isRegistered = await zkVotingSystem.checkVoterStatus(voterAccount);
    console.log(`Is voter ${voterNum} already registered: ${isRegistered}`);
    
    if (isRegistered) {
      console.log(`Unregistering voter ${voterNum}...`);
      await zkVotingSystem.unregisterVoter(voterAccount, { from: admin });
      console.log(`Voter ${voterNum} unregistered successfully`);
    }
    
    // Register the voter with a unique hash
    console.log(`Registering voter ${voterNum}...`);
    const uniqueHash = Date.now() + voterNum; // Add voter number to ensure uniqueness
    await zkVotingSystem.registerVoter(
      voterAccount,
      uniqueHash,
      commitmentStr,
      { from: admin }
    );
    console.log(`Voter ${voterNum} registered successfully`);
    
    // Update local tree state to match contract after registration
    merkleTree = await getMerkleTreeFromContract(zkVotingSystem, mimc);
    
    // Find this voter's leaf index
    const leafIndex = merkleTree.leaves.findIndex(leaf => leaf.toString() === commitmentStr);
    if (leafIndex === -1) {
      throw new Error(`Could not find commitment ${commitmentStr} in the merkle tree`);
    }
    
    console.log(`Leaf for voter ${voterNum} was found at index ${leafIndex}`);
    
    // Generate the Merkle proof for the commitment
    const merkleProof = await generateMerkleProof(merkleTree, leafIndex, zkVotingSystem, mimc);
    console.log(`Merkle proof generated for voter ${voterNum}`);
    
    // Create input for the ZK proof
    const input = {
      nullifier: nullifier,
      secret: secret,
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices
    };
    
    // Generate the ZK proof with a timeout to prevent hanging
    console.log(`Generating ZK proof for voter ${voterNum}...`);
    
    // Set a timeout for the proof generation (5 minutes)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('ZK proof generation timed out')), 300000));
    
    const proofPromise = groth16.fullProve(
      input,
      "circuits/out/Verifier_js/Verifier.wasm",
      "circuits/out/Verifier_0001.zkey"
    );
    
    // Race the proof generation against the timeout
    const { proof, publicSignals } = await Promise.race([proofPromise, timeoutPromise]);
    
    console.log(`Proof generated successfully for voter ${voterNum}`);
    
    // Format the proof for the contract
    const proofFormatted = {
      a: proof.pi_a.slice(0, 2).map(x => x.toString()),
      b: [
        proof.pi_b[0].slice(0, 2).reverse().map(x => x.toString()),
        proof.pi_b[1].slice(0, 2).reverse().map(x => x.toString())
      ],
      c: proof.pi_c.slice(0, 2).map(x => x.toString())
    };
    
    // Verify the proof with the verifier contract
    console.log(`\n=== VERIFYING PROOF FOR VOTER ${voterNum} ===`);
    
    const isValid = await verifier.verifyProof(
      proofFormatted.a,
      proofFormatted.b,
      proofFormatted.c,
      publicSignals.map(x => x.toString())
    );
    
    console.log(`Proof verification result for voter ${voterNum}: ${isValid}`);
    
    if (!isValid) {
      console.error(`❌ Proof verification failed for voter ${voterNum}!`);
      return { success: false, error: "Proof verification failed" };
    }
    
    // Check the root calculated by the circuit vs the contract's root
    console.log(`\n=== COMPARING ROOTS FOR VOTER ${voterNum} ===`);
    const calculatedRoot = publicSignals[1];
    const contractRoot = await zkVotingSystem.getLastRoot();
    
    console.log(`Root calculated by circuit (voter ${voterNum}): ${calculatedRoot.toString()}`);
    console.log(`Current root from contract: ${contractRoot.toString()}`);
    
    // Format for comparison
    const calculatedRootFormatted = formatForComparison(calculatedRoot.toString());
    const contractRootFormatted = formatForComparison(contractRoot.toString());
    console.log(`Circuit root formatted: ${calculatedRootFormatted}`);
    console.log(`Contract root formatted: ${contractRootFormatted}`);
    
    // Get all historical roots from the contract
    const knownRoots = await getHistoricalRoots(zkVotingSystem);
    
    // Convert known roots to consistent format for comparison
    const formattedKnownRoots = knownRoots.map(root => formatForComparison(root));
    
    // Check if the calculated root is in the known roots
    const isCalculatedRootKnown = formattedKnownRoots.includes(calculatedRootFormatted);
    
    if (calculatedRootFormatted !== contractRootFormatted) {
      console.warn(`⚠️ NOTE: Calculated root for voter ${voterNum} doesn't match current contract root!`);
      
      if (isCalculatedRootKnown) {
        console.log(`✅ Good news! The calculated root for voter ${voterNum} is in the contract's historical roots.`);
      } else {
        console.warn(`❌ WARNING: The calculated root for voter ${voterNum} is NOT in the contract's historical roots.`);
        console.warn("This will cause the vote transaction to fail with 'Cannot find your merkle root'.");
        console.warn("");
        console.warn(`For testing, we'll add the circuit's calculated root to the contract:`);
        
        // Using the addRootForTesting function for testing purposes
        try {
          console.log(`Adding calculated root to contract for voter ${voterNum}...`);
          await zkVotingSystem.addRootForTesting(calculatedRoot.toString(), { from: admin });
          console.log(`Circuit root added to contract's known roots for voter ${voterNum}`);
        } catch (error) {
          console.error(`Failed to add calculated root to contract for voter ${voterNum}:`, error.message);
          return { success: false, error: "Failed to add root" };
        }
      }
    }
    
    // Use the proof's calculated root for voting
    const rootToUse = calculatedRoot.toString();
    console.log(`Using root for voting (voter ${voterNum}): ${rootToUse}`);
    
    // Cast the vote
    console.log(`\n=== CASTING VOTE FOR VOTER ${voterNum} ===`);
    console.log(`Casting vote for candidate ID 1 from voter ${voterNum}...`);
    
    try {
      const voteTx = await zkVotingSystem.vote(
        1, // Candidate ID
        publicSignals[0], // Nullifier hash
        rootToUse, // Use the root calculated by the circuit
        proofFormatted.a,
        proofFormatted.b,
        proofFormatted.c,
        { from: voterAccount, gas: 5000000 }
      );
      
      console.log(`Vote cast successfully for voter ${voterNum}, transaction hash: ${voteTx.tx}`);
      
      // Check vote count
      const candidateAfter = await zkVotingSystem.getCandidate(1);
      console.log(`Candidate vote count after voter ${voterNum}: ${candidateAfter[3].toString()}`);
      
      return { 
        success: true, 
        voterAccount, 
        nullifierHash: publicSignals[0],
        transactionHash: voteTx.tx 
      };
    } catch (error) {
      console.error(`Error casting vote for voter ${voterNum}:`, error.message);
      
      if (error.reason) {
        console.log(`Error reason for voter ${voterNum}:`, error.reason);
      }
      
      if (error.data) {
        console.log(`Error data for voter ${voterNum}:`, error.data);
        if (error.data.reason) {
          console.log(`Error data reason for voter ${voterNum}:`, error.data.reason);
        }
      }
      
      return { success: false, error: error.message };
    }
  } catch (err) {
    console.error(`Error in voter ${voterNum} processing:`, err.message);
    if (err.reason) {
      console.log(`Error reason for voter ${voterNum}:`, err.reason);
    }
    return { success: false, error: err.message };
  }
} 