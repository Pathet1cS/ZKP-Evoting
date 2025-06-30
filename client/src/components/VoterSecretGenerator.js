import React, { useState } from 'react';
import { generateCommitment, storeVoterSecrets } from '../utils/zkProofs';
import { registerCommitment } from '../utils/merkleTree';

function VoterSecretGenerator({ onCommitmentGenerated }) {
  const [commitment, setCommitment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);

  const generateVoterSecret = async () => {
    setLoading(true);
    try {
      // Generate a new commitment for the voter
      const commitmentData = await generateCommitment();
      setCommitment(commitmentData);
      
      // Add the commitment to the Merkle tree using our new function
      console.log('Adding commitment to Merkle tree:', commitmentData.commitment);
      const leafIndex = await registerCommitment(commitmentData.commitment);
      console.log('Commitment added at index:', leafIndex);
      
      // No need to call localStorage.setItem for leaf index and commitment
      // The registerCommitment function now handles storing these values
      
      // Store the complete commitment data in localStorage
      storeVoterSecrets(commitmentData);
      
      // Pass the commitment up to the parent component
      if (onCommitmentGenerated) {
        onCommitmentGenerated(commitmentData.commitment);
      }
    } catch (err) {
      console.error("Error generating commitment:", err);
    } finally {
      setLoading(false);
    }
  };

  const downloadSecretFile = () => {
    if (!commitment) return;
    
    const dataStr = JSON.stringify(commitment, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voting-secret.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSecretSaved(true);
  };

  return (
    <div className="voter-secret-generator">
      <h3>Generate Your Voting Secret</h3>
      <p>
        To participate in this private voting system, you need to generate a secret 
        that will be used to create your anonymous voting commitment.
      </p>
      
      {!commitment ? (
        <button 
          onClick={generateVoterSecret} 
          disabled={loading}
          className="generate-button"
        >
          {loading ? 'Generating...' : 'Generate Voting Secret'}
        </button>
      ) : (
        <div className="commitment-details">
          <p className="success-message">Your voting secret has been generated successfully!</p>
          
          <div className="commitment-info">
            <p>Commitment: <code>{commitment.commitment.substring(0, 20)}...{commitment.commitment.substring(commitment.commitment.length - 10)}</code></p>
          </div>
          
          <p>Save this secret securely. You will need it when voting.</p>
          <p className="warning">Warning: If you lose this secret, you won't be able to vote!</p>
          
          <button 
            onClick={downloadSecretFile}
            className="download-button"
            disabled={secretSaved}
          >
            {secretSaved ? 'Secret Saved ✓' : 'Download Secret File'}
          </button>
          
          {secretSaved && (
            <p className="saved-message">
              Your secret has been saved! Keep it secure and don't share it with anyone.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default VoterSecretGenerator; 