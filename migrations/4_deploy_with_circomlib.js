const { mimcSpongecontract } = require('circomlibjs');
const Verifier = artifacts.require("Groth16Verifier");
const ZKVotingSystem = artifacts.require("ZKVotingSystem");
const ZKTreeTest = artifacts.require("ZKTreeTest");

module.exports = async function (deployer, network, accounts) {
  // Deploy MiMCSponge from circomlib directly
  console.log("Deploying MiMCSponge from circomlib...");
  
  // Get the ABI and bytecode from circomlib
  const mimcABI = mimcSpongecontract.abi;
  const mimcBytecode = mimcSpongecontract.createCode("mimcsponge", 220);
  
  // Deploy using web3 since Truffle doesn't support this pattern directly
  const MiMCSponge = new web3.eth.Contract(mimcABI);
  
  // Deploy the contract
  const mimc = await MiMCSponge.deploy({
    data: mimcBytecode
  }).send({
    from: accounts[0],
    gas: 5000000
  });
  
  console.log("MiMC deployed at:", mimc.options.address);
  
  // Deploy the Verifier contract
  await deployer.deploy(Verifier);
  const verifier = await Verifier.deployed();
  console.log("Verifier deployed at:", verifier.address);
  
  // Deploy the ZKVotingSystem with correct parameters
  // 20 is the number of levels in the Merkle tree
  await deployer.deploy(ZKVotingSystem, 20, mimc.options.address, verifier.address);
  const zkVotingSystem = await ZKVotingSystem.deployed();
  
  console.log("ZKVotingSystem deployed at:", zkVotingSystem.address);
  
}; 