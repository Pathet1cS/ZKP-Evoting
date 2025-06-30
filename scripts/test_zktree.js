// ZK Tree Test Script
/**
 * This script tests the zkTree implementation directly, without going through the voting system.
 * It's similar to the TypeScript tests in zktree_test.ts but in JavaScript for Truffle.
 */

const fs = require('fs');
const circomlibjs = require('circomlibjs');
const { buildMimcSponge, mimcSpongecontract } = require('circomlibjs');
const { groth16 } = require('snarkjs');

// Contract artifacts - only require what's in your contracts directory
const ZKTreeTest = artifacts.require("ZKTreeTest");

// Try to require the Verifier contract, but handle the case if it's missing
let Verifier;
try {
  Verifier = artifacts.require("Groth16Verifier");
} catch (error) {
  console.log("Note: Verifier contract not found in artifacts. ZK proof tests will be skipped.");
}

// Use the same zero value as in zktree.ts
const ZERO_VALUE = '21663839004416932945382355908790599225266501822907911457504978515578255421292'; // = keccak256("tornado") % FIELD_SIZE
const TREE_LEVELS = 20;

// Calculate hash using MiMC hash method like in original test
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

// Add a helper function to convert between formats
const hexToBigInt = (hexStr) => {
  if (hexStr.startsWith('0x')) {
    return BigInt(hexStr);
  }
  return BigInt('0x' + hexStr);
};

// Add a helper to ensure consistent format for comparison
const formatForComparison = (value) => {
  if (typeof value === 'string' && value.startsWith('0x')) {
    return hexToBigInt(value).toString();
  }
  return BigInt(value).toString();
};

// Main test function
module.exports = async (callback) => {
  try {
    console.log("Starting ZK Tree tests...");
    
    // Deploy MiMCSponge directly using web3
    const SEED = "mimcsponge";
    console.log("Deploying MiMCSponge from circomlibjs...");
    
    // Create and deploy MiMC contract directly
    const mimcContract = new web3.eth.Contract(mimcSpongecontract.abi);
    const accounts = await web3.eth.getAccounts();
    
    const deployTx = mimcContract.deploy({
      data: mimcSpongecontract.createCode(SEED, 220)
    });
    
    const gas = await deployTx.estimateGas();
    const mimcSpongeInstance = await deployTx.send({
      from: accounts[0],
      gas: Math.round(gas * 1.5)
    });
    
    console.log("Deployed MiMCSponge at:", mimcSpongeInstance.options.address);
    
    // Try to deploy or get Verifier if it exists
    let verifier;
    let verifierAddress;
    
    if (Verifier) {
      try {
        // Try to get existing deployed instance
        verifier = await Verifier.deployed();
        verifierAddress = verifier.address;
        console.log("Using existing Verifier at:", verifierAddress);
      } catch (error) {
        console.log("No deployed Verifier found. Will use a placeholder address for now.");
        verifierAddress = accounts[0]; // Use placeholder address
      }
    } else {
      console.log("Verifier contract not available. Using a placeholder address.");
      verifierAddress = accounts[0]; // Use placeholder address
    }
    
    // Deploy ZKTreeTest
    console.log("Deploying ZKTreeTest...");
    const zkTreeTest = await ZKTreeTest.new(
      TREE_LEVELS, 
      mimcSpongeInstance.options.address, 
      verifierAddress, // Use verifier if available, otherwise use placeholder
      { from: accounts[0] }
    );
    console.log("Deployed ZKTreeTest at:", zkTreeTest.address);
    
    // Initialize MiMC from circomlib
    const mimc = await buildMimcSponge();
    
    // Test 0: Compare hash implementations directly
    console.log("\n=== Test 0: Compare Hash Implementations ===");
    try {
      const testVal1 = 1;
      const testVal2 = 2;
      
      // Call the contract's MiMCSponge function directly if possible
      console.log("Comparing contract hash and JS hash implementation...");
      
      // Method 1: Use mimcSpongeInstance directly
      const contractHashResult = await zkTreeTest.hashLeftRight(testVal1, testVal2);
      console.log("Contract hash result:", contractHashResult.toString());
      
      // Method 2: Use JS implementation
      const jsHashResult = calculateHash(mimc, testVal1, testVal2);
      console.log("JS hash result:", jsHashResult.toString());
      
      // Convert to same format for comparison
      const contractHashBigInt = BigInt(contractHashResult.toString());
      console.log("Contract hash as BigInt:", contractHashBigInt.toString());
      
      if (contractHashBigInt.toString() === jsHashResult.toString()) {
        console.log("✅ Hash implementations match");
      } else {
        console.log("❌ Hash implementations don't match");
        
        // Try alternative hash approach
        console.log("\nTrying alternative hash approach (direct hash comparison)...");
        
        // Try direct hash comparison like in the original test
        const altJsHashResult = mimc.F.toString(mimc.hash(testVal1, mimc.F.e(0), 0).xL);
        console.log("Alternative JS hash:", altJsHashResult);
        
        if (contractHashResult.toString().includes(altJsHashResult)) {
          console.log("✅ Alternative hash approach matches");
        } else {
          console.log("❌ Alternative hash approaches still don't match");
        }
      }
    } catch (error) {
      console.error("Error comparing hash implementations:", error.message);
    }
    
    // Test 1: Hash calculation
    console.log("\n=== Test 1: Hash Calculation ===");
    const zero = BigInt(ZERO_VALUE);
    const contractHash = await zkTreeTest.hashLeftRight(zero, zero);
    console.log("Contract hash:", contractHash.toString());
    
    const jsHash = calculateHash(mimc, zero, zero);
    console.log("JS hash:", jsHash.toString());
    
    const contractHashFormatted = formatForComparison(contractHash.toString());
    console.log("Contract hash formatted:", contractHashFormatted);
    const jsHashFormatted = formatForComparison(jsHash.toString());
    console.log("JS hash formatted:", jsHashFormatted);

    if (contractHashFormatted === jsHashFormatted) {
      console.log("✅ Hash calculation matches");
    } else {
      console.log("❌ Hash calculation doesn't match");
    }
    
    // Test 2: Zero values
    console.log("\n=== Test 2: Zero Values ===");
    const zeros = generateZeros(mimc, TREE_LEVELS);
    console.log("First few zeros from JS:");
    for (let i = 0; i < Math.min(4, TREE_LEVELS); i++) {
      console.log(`Level ${i}: ${zeros[i]}`);
    }
    
    // Test 3: Initial root
    console.log("\n=== Test 3: Initial Root ===");
    const contractRoot = await zkTreeTest.getLastRoot();
    console.log("Contract initial root:", contractRoot.toString());
    
    const jsRoot = calculateMerkleRootAndPath(mimc, TREE_LEVELS, []).root;
    console.log("JS initial root:", jsRoot);
    
    const contractRootFormatted = formatForComparison(contractRoot.toString());
    console.log("Contract root formatted:", contractRootFormatted);
    const jsRootFormatted = formatForComparison(jsRoot);
    console.log("JS root formatted:", jsRootFormatted);

    if (contractRootFormatted === jsRootFormatted) {
      console.log("✅ Initial root matches");
    } else {
      console.log("❌ Initial root doesn't match");
    }
    
    // Test 4: Commit a value
    console.log("\n=== Test 4: Commit Value ===");
    const testValue = 1;
    const commitTx = await zkTreeTest.commit(testValue);
    console.log("Committed value:", testValue);
    console.log("Transaction hash:", commitTx.tx);
    
    // Get updated root
    const rootAfterCommit = await zkTreeTest.getLastRoot();
    console.log("Contract root after commit:", rootAfterCommit.toString());
    
    const jsRootAfterCommit = calculateMerkleRootAndPath(mimc, TREE_LEVELS, [testValue]).root;
    console.log("JS root after commit:", jsRootAfterCommit);
    
    const rootAfterCommitFormatted = formatForComparison(rootAfterCommit.toString());
    console.log("Contract root formatted:", rootAfterCommitFormatted);
    const jsRootAfterCommitFormatted = formatForComparison(jsRootAfterCommit);
    console.log("JS root formatted:", jsRootAfterCommitFormatted);

    if (rootAfterCommitFormatted === jsRootAfterCommitFormatted) {
      console.log("✅ Root after commit matches");
    } else {
      console.log("❌ Root after commit doesn't match");
    }
    
    // Test 5: Commit multiple values
    console.log("\n=== Test 5: Commit Multiple Values ===");
    await zkTreeTest.commit(2);
    await zkTreeTest.commit(3);
    console.log("Committed values: 2, 3");
    
    // Get the updated root
    const rootAfterMultiple = await zkTreeTest.getLastRoot();
    console.log("Contract root after multiple commits:", rootAfterMultiple.toString());
    
    const jsRootAfterMultiple = calculateMerkleRootAndPath(mimc, TREE_LEVELS, [testValue, 2, 3]).root;
    console.log("JS root after multiple commits:", jsRootAfterMultiple);
    
    const rootAfterMultipleFormatted = formatForComparison(rootAfterMultiple.toString());
    console.log("Contract root formatted:", rootAfterMultipleFormatted);
    const jsRootAfterMultipleFormatted = formatForComparison(jsRootAfterMultiple);
    console.log("JS root formatted:", jsRootAfterMultipleFormatted);

    if (rootAfterMultipleFormatted === jsRootAfterMultipleFormatted) {
      console.log("✅ Root after multiple commits matches");
    } else {
      console.log("❌ Root after multiple commits doesn't match");
    }
    
    // Test 6: Verify proof for a specific element
    console.log("\n=== Test 6: Verify Proof ===");
    const jsProof = calculateMerkleRootAndPath(mimc, TREE_LEVELS, [testValue, 2, 3], 3);
    const verifiedRoot = checkMerkleProof(mimc, TREE_LEVELS, jsProof.pathElements, jsProof.pathIndices, 3);
    
    console.log("Verified root:", verifiedRoot.toString());
    console.log("Expected root:", rootAfterMultiple.toString());
    
    const verifiedRootFormatted = formatForComparison(verifiedRoot.toString());
    console.log("Verified root formatted:", verifiedRootFormatted);
    const rootAfterMultipleForMatching = formatForComparison(rootAfterMultiple.toString());
    console.log("Expected root formatted:", rootAfterMultipleForMatching);

    if (verifiedRootFormatted === rootAfterMultipleForMatching) {
      console.log("✅ Proof verification successful");
    } else {
      console.log("❌ Proof verification failed");
    }
    
    // Test 7: Get tree information
    console.log("\n=== Test 7: Tree Information ===");
    const nextIndex = await zkTreeTest.nextIndex();
    console.log("Next index:", nextIndex.toString());
    console.log("Expected next index:", "3"); // We committed 3 values
    
    if (nextIndex.toString() === "3") {
      console.log("✅ Next index is correct");
    } else {
      console.log("❌ Next index is incorrect");
    }
    
    // Test 8: Full process with commitment and ZK proof if Verifier exists
    console.log("\n=== Test 8: Full Process with ZK Proof ===");
    
    // Only run this test if we have a real Verifier contract and not just a placeholder
    if (Verifier && verifier) {
      try {
        // Generate a commitment
        const commitment = await generateCommitment(mimc);
        console.log("Generated commitment:", commitment.commitment);
        
        // Commit the commitment
        await zkTreeTest.commit(commitment.commitment);
        console.log("Commitment added to the tree");
        
        // Get the tree state
        const currentRoot = await zkTreeTest.getLastRoot();
        console.log("Current root:", currentRoot.toString());
        
        // Generate proof path for the commitment
        const commitments = [testValue, 2, 3, BigInt(commitment.commitment)];
        const proofPath = calculateMerkleRootAndPath(mimc, TREE_LEVELS, commitments, BigInt(commitment.commitment));
        
        // Check if we have the required circuit files
        const wasmPath = "circuits/out/Verifier_js/Verifier.wasm";
        const zkeyPath = "circuits/out/Verifier_0001.zkey";
        
        if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
          console.log("Found circuit files, generating ZK proof...");
          
          // Set a timeout for the proof generation
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('ZK proof generation timed out')), 300000));
          
          const proofPromise = groth16.fullProve(
            {
              nullifier: commitment.nullifier,
              secret: commitment.secret,
              pathElements: proofPath.pathElements,
              pathIndices: proofPath.pathIndices
            },
            wasmPath,
            zkeyPath
          );
          
          // Race the proof generation against the timeout
          const { proof, publicSignals } = await Promise.race([proofPromise, timeoutPromise]);
          
          console.log("✅ ZK proof generated");
          console.log("Public signals:");
          console.log("- Nullifier hash:", publicSignals[0]);
          console.log("- Root:", publicSignals[1]);
          
          // Format the proof for the contract
          const proofFormatted = {
            a: proof.pi_a.slice(0, 2).map(x => x.toString()),
            b: [
              proof.pi_b[0].slice(0, 2).reverse().map(x => x.toString()),
              proof.pi_b[1].slice(0, 2).reverse().map(x => x.toString())
            ],
            c: proof.pi_c.slice(0, 2).map(x => x.toString())
          };
          
          // Try to nullify using the proof
          try {
            const nullifyTx = await zkTreeTest.nullify(
              publicSignals[0], // nullifierHash
              publicSignals[1], // root
              proofFormatted.a,
              proofFormatted.b,
              proofFormatted.c
            );
            
            console.log("✅ Nullification successful!");
            console.log("Transaction hash:", nullifyTx.tx);
          } catch (error) {
            console.error("❌ Nullification failed:", error.message);
          }
        } else {
          console.log("Circuit files not found, skipping ZK proof generation");
          console.log("Expected paths:");
          console.log("- WASM:", wasmPath);
          console.log("- ZKEY:", zkeyPath);
        }
      } catch (error) {
        console.error("❌ Full process test failed:", error.message);
      }
    } else {
      console.log("Skipping ZK proof test because Verifier contract is not available.");
      console.log("To run this test, make sure you have a Verifier contract compiled and deployed.");
    }
    
    console.log("\n=== All ZK Tree Tests Completed ===");
    
    callback();
  } catch (error) {
    console.error("Error in ZK tree tests:", error);
    callback(error);
  }
}; 