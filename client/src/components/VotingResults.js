import React, { useState, useEffect } from 'react';

function VotingResults({ contract, votingActive }) {
  const [results, setResults] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [votingEnded, setVotingEnded] = useState(false);

  useEffect(() => {
    if (contract) {
      loadResults();
      checkVotingStatus();
    }
    
    // Poll for results every 15 seconds if voting is active
    let interval;
    if (votingActive) {
      interval = setInterval(loadResults, 15000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [contract, votingActive]);

  const checkVotingStatus = async () => {
    try {
      const hasEnded = await contract.votingEnded();
      setVotingEnded(hasEnded);
    } catch (err) {
      console.error("Error checking voting status:", err);
    }
  };

  const loadResults = async () => {
    try {
      const [ids, names, voteCounts] = await contract.getAllCandidatesWithVotes();
      
      const formattedResults = ids.map((id, index) => ({
        id: Number(id),
        name: names[index],
        voteCount: Number(voteCounts[index])
      }));
      
      // Sort by vote count descending
      formattedResults.sort((a, b) => b.voteCount - a.voteCount);
      
      setResults(formattedResults);
      
      // Calculate total votes
      const total = formattedResults.reduce((sum, item) => sum + item.voteCount, 0);
      setTotalVotes(total);
    } catch (err) {
      console.error("Error loading results:", err);
    }
  };

  const calculatePercentage = (votes) => {
    if (totalVotes === 0) return 0;
    return ((votes / totalVotes) * 100).toFixed(1);
  };

  return (
    <div className="voting-results card">
      <h2>Election Results {!votingEnded && votingActive && <span>(Live)</span>}</h2>
      
      {results.length === 0 ? (
        <p>No results to display yet.</p>
      ) : (
        <>
          <div className="results-summary">
            <div className="total-votes">
              <span>Total Votes: {totalVotes}</span>
            </div>
            {votingEnded && (
              <div className="voting-complete-tag">
                Voting Complete
              </div>
            )}
          </div>
          
          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Candidate</th>
                  <th>Votes</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {results.map((candidate, index) => (
                  <tr key={candidate.id} className={index === 0 && votingEnded ? 'winner' : ''}>
                    <td>{index + 1}</td>
                    <td>{candidate.name}</td>
                    <td>{candidate.voteCount}</td>
                    <td>
                      <div className="percentage-bar">
                        <div 
                          className="percentage-fill" 
                          style={{width: `${calculatePercentage(candidate.voteCount)}%`}}
                        ></div>
                        <span>{calculatePercentage(candidate.voteCount)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {!votingEnded && (
            <p className="results-note">
              {votingActive 
                ? "Results update automatically every 15 seconds while voting is active."
                : "Final results will be available once voting ends."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default VotingResults;