# Zero Knowledge Proof Voting System

A decentralized voting system using Zero Knowledge Proofs (ZKPs) to ensure privacy while maintaining voting integrity.

## Overview

This system provides zkp voting mechanisms:
Zero Knowledge Proof (ZKP) based anonymous voting system

The ZKP implementation allows voters to cast votes without revealing their identity, while still ensuring each registered voter can only vote once.

## Key Features

- **Voter Privacy**: ZKPs enable voting without revealing voter identity
- **Vote Integrity**: One-person-one-vote rule enforced through ZKP nullifiers
- **Transparency**: All votes are recorded on the blockchain
- **Efficiency**: Gas-optimized smart contracts and circuits

## Technical Components

### Smart Contracts

- **ZKVotingSystem.sol**: Main contract for the ZKP-based voting system
- **MerkleTreeWithHistory.sol**: Maintains a Merkle tree of voter commitments
- **ZKTree.sol**: Base contract for ZKP functionality
- **Hasher.sol**: Implements MiMC hash function for commitments
- **verifier.sol**: Generated Groth16 verifier for ZKP verification

### ZKP Circuits (Circom)

- **CommitmentHasher.circom**: Circuit for generating commitments
- **MerkleTreeChecker.circom**: Circuit for verifying Merkle tree membership
- **Verifier.circom**: Main circuit for verifying voter eligibility

### Frontend Components

- **ZKAdminPanel.js**: Admin interface for ZKP-based election management
- **ZKVotingForm.js**: Voter interface for ZKP-based voting
- **VoterSecretGenerator.js**: Utility for generating and storing voter secrets

## How It Works

### Voter Registration Process
1. Admin registers voters by adding their commitment to a Merkle tree
2. Voter generates a secret and nullifier for later use
3. Voter keeps their secret safe for voting

### Voting Process
1. Voter connects their wallet and provides their secret
2. System generates a ZK proof of valid registration without revealing identity
3. Vote is cast and recorded on the blockchain with a nullifier to prevent double-voting

## Setup and Development

### Prerequisites
- Node.js and npm
- Truffle Suite
- Circom 2.0
- SnarkJS

### Installation

```
npm install
```

### Compiling and Deploying Contracts

```
npx truffle compile
npx truffle migrate
```

### Running Tests

```
npx truffle exec scripts/test_zkp.js
```

### Running the Frontend

```
cd client
npm start
```

## Security Considerations

- Voter secrets must be stored securely
- The Merkle tree structure prevents enumeration of voter identities
- Nullifiers ensure each voter can only vote once

## Future Improvements

- Enhanced UX for secret management
- Additional ZKP-based features (e.g., anonymous proposals)
- Gas optimization for on-chain verification
- Improved error handling and user feedback
