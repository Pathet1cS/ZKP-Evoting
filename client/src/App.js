// App.js - Main component
import React, { useState, useEffect } from 'react';
import { Contract, ethers, BrowserProvider } from 'ethers';
import './App.css';
import contractABI from './contractABI.json';
import AdminPanel from './components/AdminPanel';
import VoterPanel from './components/VoterPanel';
import VotingResults from './components/VotingResults';
import ConnectWallet from './components/ConnectWallet';
import ZKAdminPanel from './components/ZKAdminPanel';
import ZKVotingForm from './components/ZKVotingForm';
import TransactionMonitor from './components/TransactionMonitor';

// Import contract configuration
import { CONTRACT_ADDRESSES, CONTRACT_ABIS, CONTRACTS } from './contractConfig';

// Import the MerkleTree initialization function
import { initializeMerkleTree } from './utils/merkleTree';

// Flag to use the ZKP version
const USE_ZKP = true; // Set to true to use ZKP components, false to use original components

function App() {
  const [provider, setProvider] = useState(null);
  const [contracts, setContracts] = useState({});
  const [account, setAccount] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votingActive, setVotingActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [merkleTreeInitialized, setMerkleTreeInitialized] = useState(false);

  // Function to check voter status
  const checkVoterStatus = async (accountAddress, contractWithSigner) => {
    try {
      if (USE_ZKP) {
        // ZKP voter status check
        const registered = await contractWithSigner.checkVoterStatus(accountAddress);
        // In ZKP we can't check if user has voted directly from the contract
        // We need to rely on local storage or other means
        const hasVotedFromLocalStorage = localStorage.getItem('hasVoted') === 'true';
        
        console.log("ZKP Voter status check:", { registered, hasVotedFromLocalStorage, address: accountAddress });
        setIsRegistered(registered);
        setHasVoted(hasVotedFromLocalStorage);
      } else {
        // Original voter status check
        const [registered, voted] = await contractWithSigner.checkVoterStatus(accountAddress);
        console.log("Voter status check:", { registered, voted, address: accountAddress });
        setIsRegistered(registered);
        setHasVoted(voted);
      }
    } catch (err) {
      console.error("Error checking voter status:", err);
      setIsRegistered(false);
      setHasVoted(false);
    }
  };

  // Connect to the blockchain and load contracts
  useEffect(() => {
    const init = async () => {
      try {
        if (window.ethereum) {
          // Connect to provider using ethers v6
          const web3Provider = new BrowserProvider(window.ethereum);
          setProvider(web3Provider);
          
          let contractInstances = {};
          
          if (USE_ZKP) {
            // Initialize ZKP contracts
            const zkVotingSystem = new ethers.Contract(
              CONTRACT_ADDRESSES.ZK_VOTING_SYSTEM,
              CONTRACT_ABIS.ZK_VOTING_SYSTEM,
              web3Provider
            );
            
            const verifier = new ethers.Contract(
              CONTRACT_ADDRESSES.VERIFIER,
              CONTRACT_ABIS.VERIFIER,
              web3Provider
            );
            
            contractInstances = {
              zkVotingSystem,
              verifier
            };
            
            // Get voting status
            const [isActive] = await zkVotingSystem.getVotingStatus();
            setVotingActive(isActive);
          } else {
            // Initialize original contract
            const votingSystem = new ethers.Contract(
              CONTRACT_ADDRESSES.VOTING_SYSTEM || "0x09fC3d6BeC34b2c7107019B837Ae7f849598F55A",
              contractABI,
              web3Provider
            );
            
            contractInstances = {
              votingSystem
            };
            
            // Get voting status
            const [isActive] = await votingSystem.getVotingStatus();
            setVotingActive(isActive);
          }
          
          setContracts(contractInstances);
          setLoading(false);
        } else {
          setError('Please install MetaMask to use this app');
          setLoading(false);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to connect to the blockchain');
        setLoading(false);
      }
    };

    init();
  }, []);

  // Load candidates
  const loadCandidates = async (contract) => {
    try {
      const [ids, names, voteCounts] = await contract.getAllCandidatesWithVotes();
      
      const formattedCandidates = ids.map((id, index) => ({
        id: Number(id),
        name: names[index],
        voteCount: Number(voteCounts[index])
      }));
      
      setCandidates(formattedCandidates);
    } catch (err) {
      console.error("Error loading candidates:", err);
    }
  };

  // Initialize the Merkle tree
  const initMerkleTree = async (contract) => {
    try {
      if (!merkleTreeInitialized) {
        console.log("Initializing Merkle tree...");
        await initializeMerkleTree(contract);
        setMerkleTreeInitialized(true);
        console.log("Merkle tree initialized successfully");
      }
    } catch (err) {
      console.error("Error initializing Merkle tree:", err);
    }
  };

  // Connect wallet function
  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const connectedAccount = accounts[0];
      setAccount(connectedAccount);
      
      // Get signer for transactions
      const signer = await provider.getSigner();
      
      let updatedContracts = {};
      let mainContract = null;
      
      if (USE_ZKP) {
        // Connect ZKP contracts with signer
        const zkVotingSystem = contracts.zkVotingSystem.connect(signer);
        const verifier = contracts.verifier.connect(signer);
        
        updatedContracts = {
          zkVotingSystem,
          verifier
        };
        
        mainContract = zkVotingSystem;
        
        // Initialize the Merkle tree with the ZKP contract
        await initMerkleTree(zkVotingSystem);
      } else {
        // Connect original contract with signer
        const votingSystem = contracts.votingSystem.connect(signer);
        updatedContracts = {
          votingSystem
        };
        
        mainContract = votingSystem;
      }
      
      setContracts(updatedContracts);
      
      // Check if connected account is admin
      const adminAddress = await mainContract.admin();
      const isAdminAccount = connectedAccount.toLowerCase() === adminAddress.toLowerCase();
      setIsAdmin(isAdminAccount);
      
      // Check voter status
      await checkVoterStatus(connectedAccount, mainContract);
      
      // Load candidates
      await loadCandidates(mainContract);
      
      setLoading(false);
    } catch (err) {
      console.error('Connection error:', err);
      setError('Failed to connect wallet');
      setLoading(false);
    }
  };

  // Update status on account change
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          const newAccount = accounts[0];
          setAccount(newAccount);
          
          if (provider) {
            const signer = await provider.getSigner();
            
            let mainContract = null;
            let updatedContracts = {};
            
            if (USE_ZKP && contracts.zkVotingSystem) {
              // Connect ZKP contracts with new signer
              const zkVotingSystem = contracts.zkVotingSystem.connect(signer);
              const verifier = contracts.verifier.connect(signer);
              
              updatedContracts = {
                zkVotingSystem,
                verifier
              };
              
              mainContract = zkVotingSystem;
            } else if (contracts.votingSystem) {
              // Connect original contract with new signer
              const votingSystem = contracts.votingSystem.connect(signer);
              updatedContracts = {
                votingSystem
              };
              
              mainContract = votingSystem;
            }
            
            if (mainContract) {
              setContracts(updatedContracts);
              
              // Check if new account is admin
              const adminAddress = await mainContract.admin();
              setIsAdmin(newAccount.toLowerCase() === adminAddress.toLowerCase());
              
              // Check voter status for new account
              await checkVoterStatus(newAccount, mainContract);
              
              // Load candidates
              await loadCandidates(mainContract);
            }
          }
        } else {
          // No accounts found - user disconnected
          setAccount('');
          setIsAdmin(false);
          setIsRegistered(false);
          setHasVoted(false);
        }
      };
      
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      
      // Clean up event listener
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, [contracts, provider]);

  // Render loading state
  if (loading) {
    return <div className="app-container"><p>Loading...</p></div>;
  }

  // Render error state
  if (error) {
    return <div className="app-container"><p className="error">{error}</p></div>;
  }

  // Get the main contract based on selected mode
  const getMainContract = () => {
    return USE_ZKP ? contracts.zkVotingSystem : contracts.votingSystem;
  };

  return (
    <div className="app-container">
      <header>
        <h1>{USE_ZKP ? "ZKP Voting System" : "Blockchain E-Voting System"}</h1>
        {account ? (
          <div className="account-info">
            <p>Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}</p>
            {isAdmin && <span className="admin-badge">Admin</span>}
          </div>
        ) : (
          <ConnectWallet onConnect={connectWallet} />
        )}
      </header>

      <main>
        {account ? (
          <>
            {isAdmin && USE_ZKP ? (
              <ZKAdminPanel 
                contract={contracts.zkVotingSystem} 
                votingActive={votingActive}
                setVotingActive={setVotingActive}
              />
            ) : isAdmin && !USE_ZKP ? (
              <AdminPanel 
                contract={contracts.votingSystem} 
                votingActive={votingActive}
                setVotingActive={setVotingActive}
              />
            ) : !isAdmin && USE_ZKP ? (
              <ZKVotingForm
                contract={contracts.zkVotingSystem}
                candidates={candidates}
                votingActive={votingActive}
              />
            ) : (
              <VoterPanel 
                contract={contracts.votingSystem}
                account={account}
                isRegistered={isRegistered}
                hasVoted={hasVoted}
                votingActive={votingActive}
                setHasVoted={setHasVoted}
              />
            )}
            
            <VotingResults 
              contract={getMainContract()}
              votingActive={votingActive}
            />
          </>
        ) : (
          <div className="welcome-message">
            <h2>Welcome to the {USE_ZKP ? "ZKP Voting System" : "Blockchain E-Voting System"}</h2>
            <p>Please connect your wallet to participate in the voting process.</p>
            {USE_ZKP && (
              <p className="privacy-note">
                This system uses Zero-Knowledge Proofs to ensure your vote remains private while maintaining verifiability.
              </p>
            )}
          </div>
        )}
      </main>

      <footer>
        <p>Secure, Transparent, {USE_ZKP ? "Private" : "Decentralized"} Voting</p>
      </footer>

      {provider && getMainContract() && (
        <TransactionMonitor 
          web3={provider} 
          contract={getMainContract()} 
          showInConsole={true} 
          showInUI={true} 
        />
      )}
    </div>
  );
}

export default App;