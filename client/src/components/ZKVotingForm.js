import React, { useState, useEffect } from 'react';
import { getVoterSecrets, calculateMerkleRootAndZKProof } from '../utils/zkProofs';
import { generateMerkleProof, initializeMerkleTree } from '../utils/merkleTree';
import { transactionLogger } from '../utils/transactionLogger';
import './ZKVotingForm.css';

// Zero value used for empty tree nodes 
const ZERO_VALUE = '21663839004416932945382355908790599225266501822907911457504978515578255421292';

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

function ZKVotingForm({ contract, candidates, votingActive }) {
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [voterSecret, setVoterSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [debugInfo, setDebugInfo] = useState('');
  // Debug is now permanently set to false and the toggle function is removed
  const debug = false;

  // Check if we have a saved secret in localStorage
  useEffect(() => {
    const savedSecret = getVoterSecrets();
    if (savedSecret) {
      setVoterSecret(savedSecret);
    }
  }, []);

  const handleSecretFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const secretData = JSON.parse(event.target.result);
        setVoterSecret(secretData);
        setMessage({ text: 'Secret file loaded successfully', type: 'success' });
      } catch (err) {
        console.error("Error parsing secret file:", err);
        setMessage({ text: 'Invalid secret file', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const castVote = async () => {
    if (!selectedCandidate) {
      setMessage({ text: "Please select a candidate", type: 'error' });
      return;
    }

    if (!voterSecret) {
      setMessage({ text: "Please provide your voting secret", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });
    setDebugInfo('');

    try {
      // Clear previous debug info
      let debugLog = "** Debug Logging **\n";
      
      // Get the current Merkle root from the contract
      debugLog += "Fetching Merkle root from contract...\n";
      const contractRoot = await contract.getLastRoot();
      const formattedContractRoot = formatForComparison(contractRoot.toString());
      debugLog += `Contract's root: ${formattedContractRoot}\n`;
      
      // IMPORTANT: Always refresh the Merkle tree before voting
      debugLog += "Refreshing Merkle tree from contract...\n";
      await initializeMerkleTree(contract);
      debugLog += "Merkle tree refreshed successfully\n";
      
      // Get the stored leaf index from local storage
      const leafIndex = localStorage.getItem('voterLeafIndex');
      
      if (!leafIndex) {
        debugLog += "Leaf index not found in localStorage, checking for commitment...\n";
        
        // If we don't have a leaf index, we can try to find the commitment in the tree
        // Let's search localStorage for the voter secret and get its commitment
        if (voterSecret && voterSecret.commitment) {
          debugLog += `Looking for commitment ${voterSecret.commitment} in the tree...\n`;
          
          // Manually check if this is already registered by scanning past events
          try {
            // Get all Commit events to find this commitment
            const commitEvents = await contract.queryFilter(
              contract.filters.Commit(),
              0,
              'latest'
            );
            
            debugLog += `Found ${commitEvents.length} total commit events\n`;
            
            // Look for the commitment in these events
            let foundEvent = null;
            for (const event of commitEvents) {
              const eventCommitment = formatForComparison(event.args.commitment);
              if (eventCommitment === formatForComparison(voterSecret.commitment)) {
                foundEvent = event;
                break;
              }
            }
            
            if (foundEvent) {
              const foundIndex = Number(foundEvent.args.leafIndex);
              debugLog += `Found commitment at index ${foundIndex}\n`;
              localStorage.setItem('voterLeafIndex', foundIndex.toString());
              
              // Generate a Merkle proof for this index
              debugLog += "Generating Merkle proof...\n";
              const merkleProof = await generateMerkleProof(foundIndex);
              
              // Proceed with voting using this proof
              debugLog += "Proceeding with found index and proof\n";
              
              // Continue with proof generation
              await processZkProofAndVote(
                merkleProof, 
                voterSecret, 
                selectedCandidate, 
                debugLog
              );
              return;
            } else {
              debugLog += "Commitment not found in contract events\n";
              setMessage({ 
                text: "Your commitment was not found in the Merkle tree. Please register with the admin first.", 
                type: 'error' 
              });
              setDebugInfo(debugLog);
              setLoading(false);
              return;
            }
          } catch (error) {
            debugLog += `Error searching for commitment: ${error.message}\n`;
          }
        }
        
        setMessage({ 
          text: "Cannot find your commitment in the Merkle tree. Please contact admin.", 
          type: 'error' 
        });
        setDebugInfo(debugLog);
        setLoading(false);
        return;
      }
      
      debugLog += `Leaf index from storage: ${leafIndex}\n`;
      
      // Generate a Merkle proof for the voter
      debugLog += "Generating Merkle proof...\n";
      try {
        const merkleProof = await generateMerkleProof(parseInt(leafIndex));
        
        if (!merkleProof || !merkleProof.pathElements || merkleProof.pathElements.length === 0) {
          setMessage({ 
            text: "Failed to generate valid Merkle proof", 
            type: 'error' 
          });
          setDebugInfo(debugLog);
          setLoading(false);
          return;
        }
        
        debugLog += `Path Elements Length: ${merkleProof.pathElements.length}\n`;
        debugLog += `Path Indices Length: ${merkleProof.pathIndices.length}\n`;
        
        // Continue with proof generation and voting
        await processZkProofAndVote(
          merkleProof, 
          voterSecret, 
          selectedCandidate, 
          debugLog
        );
      } catch (error) {
        debugLog += `Error generating Merkle proof: ${error.message}\n`;
        setMessage({ 
          text: `Error generating Merkle proof: ${error.message}`, 
          type: 'error' 
        });
        setDebugInfo(debugLog);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error casting vote:", error);
      setMessage({ 
        text: `Error casting vote: ${error.message}`, 
        type: 'error' 
      });
      setDebugInfo(`Error: ${error.message}\n\nStack: ${error.stack}`);
      setLoading(false);
    }
  };
  
  // Helper function to process ZK proof and vote
  const processZkProofAndVote = async (merkleProof, voterSecret, candidateId, debugLog) => {
    try {
      // Generate the ZK proof
      debugLog += "Generating ZK proof...\n";
      const proof = await calculateMerkleRootAndZKProof(
        voterSecret.nullifier,
        voterSecret.secret,
        merkleProof
      );
      
      debugLog += "Proof generated successfully\n";
      debugLog += `Nullifier Hash: ${proof.nullifierHash}\n`;
      debugLog += `Proof root: ${proof.root}\n`;
      
      // Check if the nullifier has already been used (already voted)
      debugLog += "Checking if nullifier already used...\n";
      // Ensure nullifierHash is properly formatted - add 0x prefix if needed and ensure even length
      const formattedNullifierHash = formatHexValue(proof.nullifierHash);
      debugLog += `Formatted nullifier hash: ${formattedNullifierHash}\n`;
      
      const isNullifierUsed = await contract.nullifiers(formattedNullifierHash);
      debugLog += `Is nullifier used: ${isNullifierUsed}\n`;
      
      if (isNullifierUsed) {
        setMessage({ text: "You have already voted with this secret", type: 'error' });
        setDebugInfo(debugLog);
        setLoading(false);
        return;
      }

      // Check if voting is active
      debugLog += "Checking voting status...\n";
      const [isActive] = await contract.getVotingStatus();
      debugLog += `Is voting active: ${isActive}\n`;
      
      if (!isActive) {
        setMessage({ text: "Voting is currently not active", type: 'error' });
        setDebugInfo(debugLog);
        setLoading(false);
        return;
      }

      // Check if the calculated root is known to the contract
      debugLog += "Checking if calculated root is known...\n";
      try {
        // Ensure root is properly formatted
        const formattedCalcRoot = formatHexValue(proof.root);
        debugLog += `Formatted root: ${formattedCalcRoot}\n`;
        
        const isKnownRoot = await contract.isKnownRoot(formattedCalcRoot);
        debugLog += `Is calculated root known: ${isKnownRoot}\n`;
          
        if (!isKnownRoot) {
          setMessage({ 
            text: "The calculated Merkle root is not recognized by the contract. Your vote may fail.", 
            type: 'warning' 
          });
          // Continue anyway with a warning
        }
      } catch (rootCheckError) {
        debugLog += `Error checking root: ${rootCheckError.message}\n`;
        // Continue anyway - some contract versions might not have this function
      }

      // Format proof parameters for the contract call
      debugLog += "Formatting parameters for contract call...\n";
      
      // Ensure proof parameters are properly formatted for the contract
      const proofA = proof.a.map(value => value.toString());
      const proofB = [
        proof.b[0].map(value => value.toString()),
        proof.b[1].map(value => value.toString())
      ];
      const proofC = proof.c.map(value => value.toString());
      
      // Log exact transaction parameters for debugging
      debugLog += "Vote transaction parameters:\n";
      debugLog += `Candidate ID: ${candidateId}\n`;
      debugLog += `Nullifier Hash: ${formattedNullifierHash}\n`;
      debugLog += `Root: ${formatHexValue(proof.root)}\n`;
      debugLog += `Proof A: ${JSON.stringify(proofA)}\n`;
      debugLog += `Proof B: ${JSON.stringify(proofB)}\n`;
      debugLog += `Proof C: ${JSON.stringify(proofC)}\n`;
      
      // Log what's being sent to the blockchain
      let fromAddress = 'unknown';
      try {
        // Try to get the signer address if available
        if (contract.signer && typeof contract.signer.getAddress === 'function') {
          fromAddress = await contract.signer.getAddress();
        } else if (window.ethereum) {
          // Fallback to connected accounts from window.ethereum
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            fromAddress = accounts[0];
          }
        }
      } catch (addressError) {
        debugLog += `Error getting address: ${addressError.message}\n`;
      }
      
      transactionLogger.logTransaction(
        {
          from: fromAddress,
          to: contract.target || contract.address || 'unknown',
          candidateId: selectedCandidate,
          nullifierHash: formattedNullifierHash,
          zkProofIncluded: true
        },
        'Casting ZKP Vote'
      );
      
      // Try to cast vote with more gas
      debugLog += "Sending vote transaction...\n";
      const tx = await contract.vote(
        candidateId,
        formattedNullifierHash,
        formatHexValue(proof.root),
        proofA,
        proofB,
        proofC,
        { gasLimit: 5000000 } // Increase gas limit significantly
      );
      
      debugLog += `Transaction hash: ${tx.hash}\n`;
      debugLog += "Waiting for transaction confirmation...\n";
      
      await tx.wait();
      
      console.log('✅ Vote transaction successful!');
      debugLog += 'Vote transaction successful!\n';
      
      // Mark that the user has voted in local storage
      localStorage.setItem('hasVoted', 'true');
      
      setMessage({ 
        text: `Your vote has been successfully cast for Candidate ${candidateId}!`, 
        type: 'success' 
      });
      setDebugInfo(debugLog);
      setLoading(false);
    } catch (error) {
      console.error("Error in processZkProofAndVote:", error);
      setMessage({ 
        text: `Error processing vote: ${error.message}`, 
        type: 'error' 
      });
      setDebugInfo(`${debugLog}\nError: ${error.message}\nStack: ${error.stack}`);
      setLoading(false);
    }
  };

  // Helper function to properly format hex values for ethers.js
  const formatHexValue = (value) => {
    // Convert to string if it's not already
    let hexString = value.toString();
    
    // Ensure it has 0x prefix
    if (!hexString.startsWith('0x')) {
      // Convert to hex if it's a decimal number
      hexString = '0x' + BigInt(hexString).toString(16);
    }
    
    // Ensure even length (ethers.js requires this)
    if (hexString.length % 2 !== 0) {
      hexString = hexString.substring(0, 2) + '0' + hexString.substring(2);
    }
    
    return hexString;
  };

  if (!votingActive) {
    return (
      <div className="waiting-container">
        <p className="waiting-message">
          Waiting for the administrator to start the voting process.
        </p>
      </div>
    );
  }

  return (
    <div className="zk-voting-form">
      <h2 className="voting-title">Cast Your Vote</h2>
      
      <div className="form-section candidates-section">
        <h3 className="section-title">Select a Candidate</h3>
        <div className="candidates-list">
          {candidates.map(candidate => (
            <div 
              key={candidate.id} 
              className={`candidate-card ${selectedCandidate === candidate.id ? 'selected' : ''}`}
              onClick={() => setSelectedCandidate(candidate.id)}
            >
              <div className="candidate-name">{candidate.name}</div>
              <div className="select-indicator">
                {selectedCandidate === candidate.id ? '✓' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="form-section secret-section">
        <h3 className="section-title">Your Voting Secret</h3>
        {voterSecret ? (
          <div className="secret-info">
            <div className="alert alert-success">
              <span className="success-icon">✓</span> Voting secret loaded successfully
            </div>
            <button 
              className="btn btn-outline clear-btn" 
              onClick={() => setVoterSecret(null)}
            >
              Clear Secret
            </button>
          </div>
        ) : (
          <div className="secret-upload">
            <p>Upload your voting secret file:</p>
            <label className="file-upload-label">
              <input 
                type="file" 
                accept=".json" 
                onChange={handleSecretFileUpload}
                className="file-input" 
              />
              <span className="file-upload-text">Choose File</span>
            </label>
          </div>
        )}
      </div>
      
      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' && <span className="success-icon">✓</span>}
          {message.type === 'error' && <span className="error-icon">✗</span>}
          {message.type === 'warning' && <span className="warning-icon">⚠</span>}
          {message.text}
        </div>
      )}
      
      <div className="form-actions">
        <button 
          className="btn btn-primary vote-btn" 
          onClick={castVote} 
          disabled={loading || !voterSecret || !selectedCandidate || !votingActive}
        >
          {loading ? (
            <span>
              <span className="loading-spinner"></span> Processing...
            </span>
          ) : (
            'Cast Vote'
          )}
        </button>
      </div>
      
      {localStorage.getItem('hasVoted') === 'true' && (
        <div className="already-voted-message">
          You have already voted with this secret
        </div>
      )}
    </div>
  );
}

export default ZKVotingForm; 