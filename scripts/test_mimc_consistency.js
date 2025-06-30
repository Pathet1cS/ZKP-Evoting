// Test script to verify MiMC hash consistency between circomlib and our Solidity contract
const { buildMimcSponge } = require('circomlibjs');

// Contract artifacts
const Hasher = artifacts.require("Hasher");

module.exports = async (callback) => {
  try {
    console.log("Testing MiMC hash consistency between circomlib and Solidity contract...");
    
    // Deploy our Hasher contract
    const hasher = await Hasher.deployed();
    console.log("Hasher contract address:", hasher.address);
    
    // Initialize circomlib MiMC
    const mimcSponge = await buildMimcSponge();
    console.log("Initialized circomlib MiMCSponge");
    
    // Test values
    const testCases = [
      { left: 1, right: 2, k: 3 },
      { left: 42, right: 43, k: 44 },
      { left: 123456789, right: 987654321, k: 0 },
      { left: "21663839004416932945382355908790599225266501822907911457504978515578255421292", 
        right: "21663839004416932945382355908790599225266501822907911457504978515578255421292", 
        k: 0 
      },
    ];
    
    // Test each case
    for (const testCase of testCases) {
      console.log(`\nTesting: left=${testCase.left}, right=${testCase.right}, k=${testCase.k}`);
      
      // Calculate hash using our Solidity contract
      const contractResult = await hasher.MiMCSponge(
        testCase.left, 
        testCase.right, 
        testCase.k
      );
      console.log("  Contract result:", contractResult.toString());
      
      // Calculate hash using circomlib
      const circuitResult = mimcSponge.F.toString(
        mimcSponge.hash(testCase.left, testCase.right, testCase.k).xL
      );
      console.log("  Circuit result:", circuitResult);
      
      // Compare results
      if (contractResult.toString() === circuitResult) {
        console.log("  ✅ MATCH - Hash values are identical");
      } else {
        console.log("  ❌ MISMATCH - Hash values differ");
        console.log(`  Difference: contract=${contractResult.toString()} vs circuit=${circuitResult}`);
      }
    }
    
    console.log("\nTest completed.");
    callback();
  } catch (error) {
    console.error("Error in test:", error);
    callback(error);
  }
}; 