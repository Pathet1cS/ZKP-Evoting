// Merkle Tree Test Script
/**
 * This script tests the Merkle tree implementation used in the ZKP voting system.
 * It validates that the tree construction, proof generation, and verification
 * work correctly and match the contract's implementation.
 */

const fs = require('fs');
const circomlibjs = require('circomlibjs');
const { buildMimcSponge } = require('circomlibjs');
const { groth16 } = require('snarkjs');
const { expect } = require('chai');

// Contract artifacts
const ZKVotingSystem = artifacts.require("ZKVotingSystem");
const Verifier = artifacts.require("Groth16Verifier");

// Use the same zero value as in zktree.ts
const ZERO_VALUE = '21663839004416932945382355908790599225266501822907911457504978515578255421292'; // = keccak256("tornado") % FIELD_SIZE

// Calculate hash using MiMC multiHash
const calculateHash = (mimc, left, right) => {
  return BigInt(mimc.F.toString(mimc.multiHash([left, right])));
};

// Generate zeros for the Merkle tree
const generateZeros = (mimc, levels) => {
  let zeros = [];
  zeros[0] = BigInt(ZERO_VALUE);
  for (let i = 1; i <= levels; i++) {
    zeros[i] = calculateHash(mimc, zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
};

// Generate Merkle root and path to specified element
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

// Generate a commitment like in zktree.ts
const generateCommitment = async (mimc) => {
  const nullifier = generateRandomFieldElement();
  const secret = generateRandomFieldElement();
  const commitment = BigInt(mimc.F.toString(mimc.multiHash([nullifier.toString(), secret.toString()])));
  const nullifierHash = BigInt(mimc.F.toString(mimc.multiHash([nullifier.toString()])));
  
  return {
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitment.toString(),
    nullifierHash: nullifierHash.toString()
  };
};

// Check a Merkle proof
const checkMerkleProof = (mimc, levels, pathElements, pathIndices, element) => {
  let current = BigInt(element);
  
  for (let i = 0; i < levels; i++) {
    const pathElement = BigInt(pathElements[i]);
    const pathIndex = pathIndices[i];
    
    if (pathIndex === 0) {
      // Current is left, pathElement is right
      current = calculateHash(mimc, current, pathElement);
    } else {
      // Current is right, pathElement is left
      current = calculateHash(mimc, pathElement, current);
    }
  }
  
  return current;
};

// Main test function
module.exports = async (callback) => {
  try {
    console.log("Starting Merkle tree tests...");
    
    // Get deployed contracts
    const zkVotingSystem = await ZKVotingSystem.deployed();
    const verifier = await Verifier.deployed();
    
    console.log("ZKVotingSystem address:", zkVotingSystem.address);
    console.log("Verifier address:", verifier.address);
    
    // Get the MiMC hasher
    const mimc = await buildMimcSponge();
    
    // Test 1: Zero values generation
    console.log("\n=== Test 1: Zero Values Generation ===");
    const levels = Number(await zkVotingSystem.levels());
    console.log(`Merkle tree has ${levels} levels`);
    
    const zeros = generateZeros(mimc, levels);
    console.log("First few zeros:");
    for (let i = 0; i <= Math.min(3, levels); i++) {
      console.log(`Level ${i}: ${zeros[i]}`);
    }
    
    // Get zeros from the contract for comparison
    const contractZeros = [];
    for (let i = 0; i < levels; i++) {
      const zero = await zkVotingSystem.zeros(i);
      contractZeros.push(BigInt(zero.toString()));
    }
    
    // Compare zeros
    let zerosMatch = true;
    for (let i = 0; i < levels; i++) {
      if (zeros[i].toString() !== contractZeros[i].toString()) {
        console.log(`❌ Zero at level ${i} doesn't match:`);
        console.log(`JS: ${zeros[i]}`);
        console.log(`Contract: ${contractZeros[i]}`);
        zerosMatch = false;
      }
    }
    
    if (zerosMatch) {
      console.log("✅ All zero values match between JS and contract");
    } else {
      console.log("❌ Some zero values don't match");
    }
    
    // Test 2: Empty tree root calculation
    console.log("\n=== Test 2: Empty Tree Root Calculation ===");
    const emptyTreeResult = calculateMerkleRootAndPath(mimc, levels, []);
    const emptyTreeRoot = emptyTreeResult.root;
    console.log("Calculated empty tree root:", emptyTreeRoot);
    
    const contractEmptyRoot = await zkVotingSystem.getInitialRoot();
    console.log("Contract empty tree root:", contractEmptyRoot.toString());
    
    if (emptyTreeRoot === contractEmptyRoot.toString()) {
      console.log("✅ Empty tree roots match");
    } else {
      console.log("❌ Empty tree roots don't match");
    }
    
    // Test 3: Commitment generation
    console.log("\n=== Test 3: Commitment Generation ===");
    const commitment = await generateCommitment(mimc);
    console.log("Generated commitment:");
    console.log("- Nullifier:", commitment.nullifier);
    console.log("- Secret:", commitment.secret);
    console.log("- Commitment:", commitment.commitment);
    console.log("- Nullifier Hash:", commitment.nullifierHash);
    
    // Test 4: Tree with single element
    console.log("\n=== Test 4: Tree With Single Element ===");
    const singleElementTree = calculateMerkleRootAndPath(mimc, levels, [BigInt(commitment.commitment)], BigInt(commitment.commitment));
    console.log("Single element tree root:", singleElementTree.root);
    console.log("Path elements:", singleElementTree.pathElements.slice(0, 3), "...");
    console.log("Path indices:", singleElementTree.pathIndices.slice(0, 3), "...");
    
    // Test 5: Tree with multiple elements
    console.log("\n=== Test 5: Tree With Multiple Elements ===");
    const commitment2 = await generateCommitment(mimc);
    const commitment3 = await generateCommitment(mimc);
    const elements = [
      BigInt(commitment.commitment),
      BigInt(commitment2.commitment),
      BigInt(commitment3.commitment)
    ];
    
    // Calculate root and paths
    const multiElementTree = calculateMerkleRootAndPath(mimc, levels, elements, elements[2]);
    console.log("Multi-element tree root:", multiElementTree.root);
    
    // Test 6: Verify Merkle proof
    console.log("\n=== Test 6: Verify Merkle Proof ===");
    const verifiedRoot = checkMerkleProof(
      mimc, 
      levels, 
      multiElementTree.pathElements, 
      multiElementTree.pathIndices, 
      elements[2]
    );
    
    console.log("Root from verification:", verifiedRoot.toString());
    console.log("Original root:", multiElementTree.root);
    
    if (verifiedRoot.toString() === multiElementTree.root) {
      console.log("✅ Merkle proof verification successful");
    } else {
      console.log("❌ Merkle proof verification failed");
    }
    
    // Test 7: ZK proof for Merkle tree membership
    console.log("\n=== Test 7: ZK Proof for Merkle Tree Membership ===");
    try {
      const input = {
        nullifier: commitment.nullifier,
        secret: commitment.secret,
        pathElements: singleElementTree.pathElements,
        pathIndices: singleElementTree.pathIndices
      };
      
      console.log("Generating ZK proof...");
      console.log("This may take a while...");
      
      // Set a timeout for the proof generation
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('ZK proof generation timed out')), 300000));
      
      const proofPromise = groth16.fullProve(
        input,
        "circuits/out/Verifier_js/Verifier.wasm",
        "circuits/out/Verifier_0001.zkey"
      );
      
      // Race the proof generation against the timeout
      const { proof, publicSignals } = await Promise.race([proofPromise, timeoutPromise]);
      
      console.log("✅ Proof generated successfully");
      console.log("Public signals:");
      console.log("- Nullifier hash:", publicSignals[0]);
      console.log("- Root:", publicSignals[1]);
      
      // Verify the proof
      const proofFormatted = {
        a: proof.pi_a.slice(0, 2).map(x => x.toString()),
        b: [
          proof.pi_b[0].slice(0, 2).reverse().map(x => x.toString()),
          proof.pi_b[1].slice(0, 2).reverse().map(x => x.toString())
        ],
        c: proof.pi_c.slice(0, 2).map(x => x.toString())
      };
      
      const isValid = await verifier.verifyProof(
        proofFormatted.a,
        proofFormatted.b,
        proofFormatted.c,
        publicSignals.map(x => x.toString())
      );
      
      console.log("Proof verification result:", isValid);
      if (isValid) {
        console.log("✅ ZK proof verification successful");
      } else {
        console.log("❌ ZK proof verification failed");
      }
      
      // Check calculated root matches
      if (publicSignals[1] === singleElementTree.root) {
        console.log("✅ Calculated root matches public signal root");
      } else {
        console.log("❌ Calculated root doesn't match public signal root");
        console.log("Calculated:", singleElementTree.root);
        console.log("Public signal:", publicSignals[1]);
      }
      
    } catch (error) {
      console.error("❌ ZK proof test failed:", error.message);
    }
    
    // Test 8: Compare with contract after registration and insertion
    console.log("\n=== Test 8: Compare With Contract After Registration ===");
    
    // Get accounts
    const accounts = await web3.eth.getAccounts();
    const admin = accounts[0];
    const testAccount = accounts[1];
    
    // Check if the account is already registered
    const isRegistered = await zkVotingSystem.checkVoterStatus(testAccount);
    if (isRegistered) {
      console.log("Unregistering test account...");
      await zkVotingSystem.unregisterVoter(testAccount, { from: admin });
    }
    
    // Register a new voter with our commitment
    const testCommitment = await generateCommitment(mimc);
    console.log("Registering voter with commitment:", testCommitment.commitment);
    
    const uniqueHash = Date.now();
    await zkVotingSystem.registerVoter(
      testAccount,
      uniqueHash,
      testCommitment.commitment,
      { from: admin }
    );
    console.log("Voter registered successfully");
    
    // Get the current root from the contract
    const contractRootAfter = await zkVotingSystem.getLastRoot();
    console.log("Contract root after registration:", contractRootAfter.toString());
    
    // Get all commitments from the contract
    const depositEvents = await zkVotingSystem.getPastEvents('Deposit', {
      fromBlock: 0,
      toBlock: 'latest'
    });
    
    const commitments = depositEvents.map(event => BigInt(event.returnValues.commitment));
    console.log(`Found ${commitments.length} commitments in the contract`);
    
    // Calculate the expected root
    const calculatedRootAfter = calculateMerkleRootAndPath(mimc, levels, commitments);
    console.log("Calculated root after registration:", calculatedRootAfter.root);
    
    if (contractRootAfter.toString() === calculatedRootAfter.root) {
      console.log("✅ Contract root matches calculated root after registration");
    } else {
      console.log("❌ Contract root doesn't match calculated root after registration");
    }
    
    console.log("\n=== All Merkle Tree Tests Completed ===");
    
    callback();
  } catch (error) {
    console.error("Error in Merkle tree tests:", error);
    callback(error);
  }
}; 