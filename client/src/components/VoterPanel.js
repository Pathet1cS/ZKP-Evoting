import React, { useState, useEffect } from 'react';

function VoterPanel({ contract, account, isRegistered, hasVoted, votingActive, setHasVoted }) {
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [remainingTime, setRemainingTime] = useState(null);
  const [votedFor, setVotedFor] = useState(null);

  // Load candidates
  useEffect(() => {
    if (contract) {
      loadCandidates();
      if (hasVoted) {
        checkVotedCandidate();
      }
    }
  }, [contract, hasVoted]);

  // Poll for remaining time if voting is active
  useEffect(() => {
    let interval;
    
    if (votingActive) {
      interval = setInterval(updateRemainingTime, 5000);
      updateRemainingTime();
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [votingActive, contract]);

  const updateRemainingTime = async () => {
    try {
      const [isActive, remaining] = await contract.getVotingStatus();
      setRemainingTime(Number(remaining));
      
      if (!isActive && votingActive) {
        window.location.reload(); // Refresh to update UI
      }
    } catch (err) {
      console.error("Error updating time:", err);
    }
  };

  const formatTime = (seconds) => {
    if (seconds <= 0) return "Ended";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const checkVotedCandidate = async () => {
    try {
      if (hasVoted) {
        // Get the voter info directly from the voters mapping
        const voterInfo = await contract.voters(account);
        if (voterInfo && voterInfo.hasVoted) {
          setVotedFor(Number(voterInfo.votedCandidateId));
        }
      }
    } catch (err) {
      console.error("Error checking voted candidate:", err);
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
    }
  };

  const castVote = async () => {
    if (!selectedCandidate) {
      setMessage({ text: "Please select a candidate", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const tx = await contract.vote(selectedCandidate);
      await tx.wait();
      
      setHasVoted(true);
      setVotedFor(selectedCandidate);
      setMessage({ text: "Vote cast successfully", type: 'success' });
      loadCandidates();
    } catch (err) {
      console.error("Error casting vote:", err);
      
      if (err.message.includes("Voter is not registered")) {
        setMessage({ text: "You are not registered to vote", type: 'error' });
      } else if (err.message.includes("Voter has already voted")) {
        setMessage({ text: "You have already voted", type: 'error' });
        setHasVoted(true);
      } else if (err.message.includes("Voting is not active")) {
        setMessage({ text: "Voting is not currently active", type: 'error' });
      } else {
        setMessage({ text: "Failed to cast vote", type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isRegistered) {
    return (
      <div className="voter-panel card">
        <h2>Voter Panel</h2>
        <div className="not-registered">
          <p>You are not registered to vote in this election.</p>
          <p>Please contact the administrator to get registered.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="voter-panel card">
      <h2>Voter Panel</h2>
      
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {votingActive ? (
        <div className="voting-status active">
          <span className="status-indicator"></span>
          <span>Voting Active - Time remaining: {formatTime(remainingTime)}</span>
        </div>
      ) : (
        <div className="voting-status inactive">
          <span className="status-indicator"></span>
          <span>Voting is currently {hasVoted ? "ended" : "not active"}</span>
        </div>
      )}
      
      {hasVoted ? (
        <div className="voted-status">
          <h3>You have already voted</h3>
          {votedFor && (
            <p>You voted for: <strong>
              {candidates.find(c => c.id === votedFor)?.name || `Candidate #${votedFor}`}
            </strong></p>
          )}
          <p>Thank you for participating in this election!</p>
        </div>
      ) : votingActive ? (
        <div className="voting-form">
          <h3>Cast Your Vote</h3>
          
          <div className="candidates-selection">
            {candidates.length > 0 ? (
              candidates.map(candidate => (
                <div key={candidate.id} className="candidate-option">
                  <label className={selectedCandidate === candidate.id ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="candidate"
                      value={candidate.id}
                      checked={selectedCandidate === candidate.id}
                      onChange={() => setSelectedCandidate(candidate.id)}
                      disabled={loading}
                    />
                    <span>{candidate.name}</span>
                  </label>
                </div>
              ))
            ) : (
              <p>No candidates available</p>
            )}
          </div>
          
          <button 
            onClick={castVote} 
            disabled={loading || !selectedCandidate}
            className="vote-button"
          >
            {loading ? 'Processing...' : 'Cast Vote'}
          </button>
        </div>
      ) : (
        <p className="waiting-message">
          Waiting for the administrator to start the voting process.
        </p>
      )}
    </div>
  );
}

export default VoterPanel;