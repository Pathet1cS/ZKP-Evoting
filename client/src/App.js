// App.js - Main component
import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import './App.css';
import contractABI from './contractABI.json';
import AdminPanel from './components/AdminPanel';
import VoterPanel from './components/VoterPanel';
import VotingResults from './components/VotingResults';
import ConnectWallet from './components/ConnectWallet';

// The contract address will need to be updated after deployment
const CONTRACT_ADDRESS = "0x09fC3d6BeC34b2c7107019B837Ae7f849598F55A"; 

function App() {
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votingActive, setVotingActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Function to check voter status
  const checkVoterStatus = async (accountAddress, contractWithSigner) => {
    try {
      const [registered, voted] = await contractWithSigner.checkVoterStatus(accountAddress);
      console.log("Voter status check:", { registered, voted, address: accountAddress });
      setIsRegistered(registered);
      setHasVoted(voted);
    } catch (err) {
      console.error("Error checking voter status:", err);
      setIsRegistered(false);
      setHasVoted(false);
    }
  };

  // Connect to the blockchain and load contract
  useEffect(() => {
    const init = async () => {
      try {
        if (window.ethereum) {
          const provider = new BrowserProvider(window.ethereum);
          setProvider(provider);
          
          const contract = new Contract(
            CONTRACT_ADDRESS,
            contractABI,
            provider
          );
          setContract(contract);
          
          // Get voting status
          const [isActive] = await contract.getVotingStatus();
          setVotingActive(isActive);
          
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
      const contractWithSigner = contract.connect(signer);
      setContract(contractWithSigner);
      
      // Check if connected account is admin
      const adminAddress = await contractWithSigner.admin();
      const isAdminAccount = connectedAccount.toLowerCase() === adminAddress.toLowerCase();
      setIsAdmin(isAdminAccount);
      
      // Check voter status
      await checkVoterStatus(connectedAccount, contractWithSigner);
      
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
      window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
          const newAccount = accounts[0];
          setAccount(newAccount);
          
          if (contract && provider) {
            const signer = await provider.getSigner();
            const contractWithSigner = contract.connect(signer);
            setContract(contractWithSigner);
            
            // Check if new account is admin
            const adminAddress = await contractWithSigner.admin();
            setIsAdmin(newAccount.toLowerCase() === adminAddress.toLowerCase());
            
            // Check voter status for new account
            await checkVoterStatus(newAccount, contractWithSigner);
          }
        } else {
          // No accounts found - user disconnected
          setAccount('');
          setIsAdmin(false);
          setIsRegistered(false);
          setHasVoted(false);
        }
      });
    }
  }, [contract, provider]);

  // Render loading state
  if (loading) {
    return <div className="app-container"><p>Loading...</p></div>;
  }

  // Render error state
  if (error) {
    return <div className="app-container"><p className="error">{error}</p></div>;
  }

  return (
    <div className="app-container">
      <header>
        <h1>Blockchain E-Voting System</h1>
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
            {isAdmin && (
              <AdminPanel 
                contract={contract} 
                votingActive={votingActive}
                setVotingActive={setVotingActive}
              />
            )}
            
            {!isAdmin && (
              <VoterPanel 
                contract={contract}
                account={account}
                isRegistered={isRegistered}
                hasVoted={hasVoted}
                votingActive={votingActive}
                setHasVoted={setHasVoted}
              />
            )}
            
            <VotingResults 
              contract={contract}
              votingActive={votingActive}
            />
          </>
        ) : (
          <div className="welcome-message">
            <h2>Welcome to the Blockchain E-Voting System</h2>
            <p>Please connect your wallet to participate in the voting process.</p>
          </div>
        )}
      </main>

      <footer>
        <p>Secure, Transparent, Decentralized Voting</p>
      </footer>
    </div>
  );
}

export default App;