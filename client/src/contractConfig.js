// Import the ABIs
import VerifierABI from './contracts/Groth16Verifier.json';
import ZKVotingSystemABI from './contracts/ZKVotingSystem.json';

// Contract addresses from deployment
export const CONTRACT_ADDRESSES = {
  VERIFIER: "0x6d967aC0de345D99FBcFFc6860c13CA4bAf881ec",
  ZK_VOTING_SYSTEM: "0x8d46Ba8D2E5Bd714D892ceEc4e6D571172fCA607"
};

export const CONTRACT_ABIS = {
  VERIFIER: VerifierABI.abi,
  ZK_VOTING_SYSTEM: ZKVotingSystemABI.abi
};

// Helper function to get contract instance
export const getContractInstance = (web3, contractName) => {
  const address = CONTRACT_ADDRESSES[contractName];
  const abi = CONTRACT_ABIS[contractName];
  
  if (!address || !abi) {
    console.error(`Contract ${contractName} configuration not found`);
    return null;
  }
  
  return new web3.eth.Contract(abi, address);
};

// Export contract names as constants
export const CONTRACTS = {
  VERIFIER: 'VERIFIER',
  ZK_VOTING_SYSTEM: 'ZK_VOTING_SYSTEM'
}; 