// App.js - Main component
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';
import contractABI from './contractABI.json';
import AdminPanel from './components/AdminPanel';
import VoterPanel from './components/VoterPanel';
import VotingResults from './components/VotingResults';
import ConnectWallet from './components/ConnectWallet';

// The contract address will need to be updated after deployment
const CONTRACT_ADDRESS = "0xfaE8cC4E7B24E8f519EAA0a1dc2c093B9778a08F"; 

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

  // Connect to the blockchain and load contract
  useEffect(() => {
    const init = async () => {
      try {
        if (window.ethereum) {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          setProvider(provider);
          
          const contract = new ethers.Contract(
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
      
      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const connectedAccount = accounts[0];
      setAccount(connectedAccount);
      
      // Check if connected account is admin
      const adminAddress = await contract.admin();
      setIsAdmin(connectedAccount.toLowerCase() === adminAddress.toLowerCase());
      
      // Get signer for transactions
      const signer = provider.getSigner();
      const contractWithSigner = contract.connect(signer);
      setContract(contractWithSigner);
      
      // Check if voter is registered
      try {
        const [registered, voted] = await contractWithSigner.checkVoterStatus(connectedAccount);
        setIsRegistered(registered);
        setHasVoted(voted);
      } catch (voterErr) {
        // If error occurs, voter is not registered
        setIsRegistered(false);
        setHasVoted(false);
      }
      
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
      window.ethereum.on('accountsChanged', (accounts) => {
        window.location.reload();
      });
    }
  }, []);

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