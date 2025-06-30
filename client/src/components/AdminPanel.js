import React, { useState, useEffect } from 'react';
// Import full ethers package
import { ethers, isAddress } from 'ethers';

function AdminPanel({ contract, votingActive, setVotingActive }) {
  const [candidates, setCandidates] = useState([]);
  const [newCandidate, setNewCandidate] = useState({ name: '', details: '' });
  const [voterAddress, setVoterAddress] = useState('');
  const [votingDuration, setVotingDuration] = useState(60); // Default 60 minutes
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [votingEnded, setVotingEnded] = useState(false);

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
      console.log("Adding candidate:", newCandidate);
      // Send the transaction
      const tx = await contract.addCandidate(newCandidate.name, newCandidate.details);
      console.log("Transaction sent:", tx);
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      console.log("Transaction receipt:", receipt);
      
      if (receipt.status === 1) {
        setNewCandidate({ name: '', details: '' });
        console.log("Loading candidates after add...");
        await loadCandidates();
        console.log("Current candidates:", candidates);
        setMessage({ text: "Candidate added successfully", type: 'success' });
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err) {
      console.error("Error adding candidate:", err);
      const errorMessage = err.message || "Failed to add candidate";
      setMessage({ 
        text: errorMessage.includes("Voting has already started") 
          ? "Cannot add candidates after voting has started" 
          : "Failed to add candidate. Make sure you are connected with the admin account.", 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const registerVoter = async (e) => {
    e.preventDefault();
    // Use ethers v6 address validation
    if (!isAddress(voterAddress)) {
      setMessage({ text: "Please enter a valid Ethereum address", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const tx = await contract.registerVoter(voterAddress);
      await tx.wait();
      
      setVoterAddress('');
      setMessage({ text: "Voter registered successfully", type: 'success' });

      // Check voter status again after registration
      try {
        const [registered, voted] = await contract.checkVoterStatus(voterAddress);
        console.log("Voter status after registration:", { registered, voted, address: voterAddress });
      } catch (checkErr) {
        console.error("Error checking voter status:", checkErr);
      }
    } catch (err) {
      console.error("Error registering voter:", err);
      const errorMessage = err.message || "Failed to register voter";
      setMessage({ 
        text: errorMessage.includes("Voter is already registered") 
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

  return (
    <div className="admin-panel">
      <h2>Admin Control Panel</h2>
      
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
        <h3>Register Voter</h3>
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
          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : 'Register Voter'}
          </button>
        </form>
      </div>
      
      {votingActive && (
        <div className="card">
          <h3>End Voting</h3>
          <p>Voting is currently active</p>
          <button onClick={endVoting} disabled={loading} className="end-button">
            {loading ? 'Processing...' : 'End Voting Early'}
          </button>
        </div>
      )}
      
      {votingEnded && (
        <div className="card">
          <h3>Voting Completed</h3>
          <p>The voting process has ended.</p>
        </div>
      )}
      
      <div className="candidates-list">
        <h3>Registered Candidates ({candidates.length})</h3>
        {candidates.length > 0 ? (
          <ul>
            {candidates.map(candidate => (
              <li key={candidate.id}>
                <strong>{candidate.name}</strong> - {candidate.voteCount} vote(s)
              </li>
            ))}
          </ul>
        ) : (
          <p>No candidates registered yet</p>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;