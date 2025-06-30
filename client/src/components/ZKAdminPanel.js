import React, { useState, useEffect } from 'react';
import { ethers, isAddress, AbiCoder, keccak256 } from 'ethers';
import VoterSecretGenerator from './VoterSecretGenerator';

function ZKAdminPanel({ contract, votingActive, setVotingActive }) {
  const [candidates, setCandidates] = useState([]);
  const [newCandidate, setNewCandidate] = useState({ name: '', details: '' });
  const [voterAddress, setVoterAddress] = useState('');
  const [voterCommitment, setVoterCommitment] = useState('');
  const [votingDuration, setVotingDuration] = useState(60); // Default 60 minutes
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [votingEnded, setVotingEnded] = useState(false);
  const [showSecretGenerator, setShowSecretGenerator] = useState(false);

  // Load candidates
  useEffect(() => {
    if (contract) {
      loadCandidates();
      checkVotingStatus();
    }
  }, [contract]);

  const checkVotingStatus = async () => {
    try {
      const [isActive] = await contract.getVotingStatus();
      setVotingActive(isActive);
      
      if (!isActive) {
        // Check if voting has ended
        const hasEnded = await contract.votingEnded();
        setVotingEnded(hasEnded);
      }
    } catch (err) {
      console.error("Error checking voting status:", err);
    }
  };

  const loadCandidates = async () => {
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
      setMessage({ text: "Failed to load candidates", type: 'error' });
    }
  };

  const addCandidate = async (e) => {
    e.preventDefault();
    if (!newCandidate.name || !newCandidate.details) {
      setMessage({ text: "Please provide both name and details", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const tx = await contract.addCandidate(newCandidate.name, newCandidate.details);
      await tx.wait();
      
      setNewCandidate({ name: '', details: '' });
      await loadCandidates();
      setMessage({ text: "Candidate added successfully", type: 'success' });
    } catch (err) {
      console.error("Error adding candidate:", err);
      // In ethers v6, error handling
      const errorMessage = err.message || "Failed to add candidate";
      setMessage({ 
        text: errorMessage.includes("Voting has already started") 
          ? "Cannot add candidates after voting has started" 
          : "Failed to add candidate", 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const registerVoter = async (e) => {
    e.preventDefault();
    if (!isAddress(voterAddress)) {
      setMessage({ text: "Please enter a valid Ethereum address", type: 'error' });
      return;
    }

    if (!voterCommitment) {
      setMessage({ text: "Please generate a commitment for the voter", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Create a unique hash for this voter (in a real system, this might be a hash of ID or other unique info)
      const abiCoder = new AbiCoder();
      const uniqueHash = keccak256(
        abiCoder.encode(
          ['address', 'uint256'],
          [voterAddress, Date.now()]
        )
      );
      
      // Convert to uint256 (in ethers v6, we use BigInt)
      const uniqueHashBigInt = BigInt(uniqueHash);
      
      // Register the voter with their commitment
      const tx = await contract.registerVoter(
        voterAddress,
        uniqueHashBigInt,
        voterCommitment
      );
      
      await tx.wait();
      
      setVoterAddress('');
      setVoterCommitment('');
      setShowSecretGenerator(false);
      setMessage({ text: "Voter registered successfully", type: 'success' });
    } catch (err) {
      console.error("Error registering voter:", err);
      const errorMessage = err.message || "Failed to register voter";
      setMessage({ 
        text: errorMessage.includes("Voter address is already registered") 
          ? "This address is already registered" 
          : "Failed to register voter", 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const startVoting = async () => {
    if (votingDuration <= 0) {
      setMessage({ text: "Duration must be greater than 0", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const tx = await contract.startVoting(votingDuration);
      await tx.wait();
      
      setVotingActive(true);
      setMessage({ text: "Voting started successfully", type: 'success' });
    } catch (err) {
      console.error("Error starting voting:", err);
      setMessage({ text: "Failed to start voting", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const endVoting = async () => {
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const tx = await contract.endVoting();
      await tx.wait();
      
      setVotingActive(false);
      setVotingEnded(true);
      setMessage({ text: "Voting ended successfully", type: 'success' });
      loadCandidates();
    } catch (err) {
      console.error("Error ending voting:", err);
      setMessage({ text: "Failed to end voting", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCommitmentGenerated = (commitment) => {
    setVoterCommitment(commitment);
  };

  return (
    <div className="zk-admin-panel">
      <h2>ZK Admin Control Panel</h2>
      
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {!votingActive && !votingEnded && (
        <>
          <div className="card">
            <h3>Add Candidate</h3>
            <form onSubmit={addCandidate}>
              <div className="form-group">
                <label>Name:</label>
                <input 
                  type="text" 
                  value={newCandidate.name}
                  onChange={(e) => setNewCandidate({...newCandidate, name: e.target.value})}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Details:</label>
                <textarea 
                  value={newCandidate.details}
                  onChange={(e) => setNewCandidate({...newCandidate, details: e.target.value})}
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Processing...' : 'Add Candidate'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Start Voting</h3>
            <div className="form-group">
              <label>Duration (minutes):</label>
              <input 
                type="number" 
                value={votingDuration}
                onChange={(e) => setVotingDuration(parseInt(e.target.value))}
                min="1"
                disabled={loading}
              />
            </div>
            <button onClick={startVoting} disabled={loading || candidates.length === 0}>
              {loading ? 'Processing...' : 'Start Voting'}
            </button>
            {candidates.length === 0 && (
              <p className="note">Add at least one candidate to start voting</p>
            )}
          </div>
        </>
      )}
      
      <div className="card">
        <h3>Register Voter with ZKP</h3>
        <form onSubmit={registerVoter}>
          <div className="form-group">
            <label>Ethereum Address:</label>
            <input 
              type="text" 
              value={voterAddress}
              onChange={(e) => setVoterAddress(e.target.value)}
              disabled={loading}
              placeholder="0x..."
            />
          </div>
          
          {!showSecretGenerator && !voterCommitment ? (
            <button 
              type="button" 
              onClick={() => setShowSecretGenerator(true)}
              className="generate-button"
            >
              Generate Voter Secret
            </button>
          ) : voterCommitment ? (
            <div className="commitment-display">
              <p>Commitment generated: <code>{voterCommitment.substring(0, 10)}...{voterCommitment.substring(voterCommitment.length - 10)}</code></p>
            </div>
          ) : null}
          
          {showSecretGenerator && !voterCommitment && (
            <VoterSecretGenerator onCommitmentGenerated={handleCommitmentGenerated} />
          )}
          
          <button type="submit" disabled={loading || !voterAddress || !voterCommitment}>
            {loading ? 'Processing...' : 'Register Voter'}
          </button>
        </form>
      </div>
      
      {votingActive && (
        <div className="card">
          <h3>End Voting</h3>
          <p>Voting is currently active.</p>
          <button onClick={endVoting} disabled={loading}>
            {loading ? 'Processing...' : 'End Voting'}
          </button>
        </div>
      )}

      <div className="card">
        <h3>Candidates & Results</h3>
        <div className="candidates-list">
          {candidates.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => (
                  <tr key={candidate.id}>
                    <td>{candidate.id}</td>
                    <td>{candidate.name}</td>
                    <td>{candidate.voteCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No candidates added yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ZKAdminPanel; 