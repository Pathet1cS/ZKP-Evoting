// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./ZKTree.sol";

/**
 * @title ZKVotingSystem
 * @dev Smart contract for a privacy-preserving decentralized voting system using ZKPs
 */
contract ZKVotingSystem is ZKTree {
    // Structures
    struct Candidate {
        uint256 id;
        string name;
        string details;
        uint256 voteCount;
        bool exists;
    }

    struct Voter {
        address voter;
        uint256 uniqueHash;
        bool registered;
    }

    struct VotingStatus {
        bool isActive;
        uint256 endTime;
    }

    // State variables
    address public admin;
    uint256 public candidatesCount;
    mapping(uint256 => Candidate) private candidates;
    mapping(address => Voter) public voters;
    VotingStatus public votingStatus;
    mapping(address => bool) public registeredVoterAddresses;
    mapping(uint256 => bool) public uniqueHashes; // To ensure each voter is registered only once
    
    bool public votingStarted;
    bool public votingEnded;
    uint256 public startTime;
    uint256 public endTime;
    
    uint256 public totalVotes;

    // Events
    event CandidateAdded(uint256 candidateId, string name);
    event VoterRegistered(address indexed voterAddress, bytes32 indexed commitment);
    event VoteCast(bytes32 indexed nullifier, uint256 candidateId);
    event VotingStarted(uint256 startTime, uint256 endTime);
    event VotingEnded(uint256 endTime, uint256 totalVotes);
    event VoterUnregistered(address indexed voter);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyRegisteredVoter() {
        require(voters[msg.sender].registered, "Voter not registered");
        _;
    }

    modifier votingActive() {
        require(votingStatus.isActive, "Voting is not active");
        require(
            block.timestamp < votingStatus.endTime,
            "Voting period has ended"
        );
        _;
    }

    modifier votingNotStarted() {
        require(!votingStarted, "Voting has already started");
        _;
    }

    // Constructor
    constructor(
        uint32 _levels,
        IHasher _hasher,
        IVerifier _verifier
    ) ZKTree(_levels, _hasher, _verifier) {
        admin = msg.sender;
        candidatesCount = 0;
        votingStarted = false;
        votingEnded = false;
        totalVotes = 0;
    }

    /**
     * @dev Add a new candidate to the election
     * @param _name Name of the candidate
     * @param _details Additional details about the candidate
     */
    function addCandidate(string memory _name, string memory _details) public onlyAdmin votingNotStarted {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, _name, _details, 0, true);
        emit CandidateAdded(candidatesCount, _name);
    }

    /**
     * @dev Register a voter with commitment
     * @param _voterAddress Address of the voter to register
     * @param _uniqueHash Unique hash to ensure one voter registers only once
     * @param _commitment The ZKP commitment of the voter
     */
    function registerVoter(address _voterAddress, uint256 _uniqueHash, uint256 _commitment) public onlyAdmin {
        require(!voters[_voterAddress].registered, "Voter already registered");
        require(!uniqueHashes[_uniqueHash], "This unique hash is already used");
        
        voters[_voterAddress] = Voter({
            voter: _voterAddress,
            uniqueHash: _uniqueHash,
            registered: true
        });
        
        uniqueHashes[_uniqueHash] = true;
        
        _commit(bytes32(_commitment));
        
        emit VoterRegistered(_voterAddress, bytes32(_commitment));
    }

    /**
     * @dev Start the voting period
     * @param _durationInMinutes Duration of the voting period in minutes
     */
    function startVoting(uint256 _durationInMinutes) public onlyAdmin votingNotStarted {
        require(candidatesCount > 0, "No candidates added yet");
        require(_durationInMinutes > 0, "Duration must be greater than 0");
        
        votingStatus.isActive = true;
        votingStatus.endTime = block.timestamp + (_durationInMinutes * 1 minutes);
        
        emit VotingStarted(block.timestamp, votingStatus.endTime);
    }

    /**
     * @dev End the voting period (can be called by admin before the scheduled end time)
     */
    function endVoting() public onlyAdmin votingActive {
        votingStatus.isActive = false;
        votingEnded = true;
        endTime = block.timestamp;
        emit VotingEnded(endTime, totalVotes);
    }

    /**
     * @dev Cast a vote for a candidate using ZKP
     * @param _candidateId ID of the candidate to vote for
     * @param _nullifier The nullifier corresponding to the commitment
     * @param _root The Merkle root at the time of proof generation
     * @param _proof_a First part of the zero-knowledge proof
     * @param _proof_b Second part of the zero-knowledge proof
     * @param _proof_c Third part of the zero-knowledge proof
     */
    function vote(
        uint256 _candidateId,
        uint256 _nullifier,
        uint256 _root,
        uint[2] memory _proof_a,
        uint[2][2] memory _proof_b,
        uint[2] memory _proof_c
    ) public votingActive {
        require(candidates[_candidateId].exists, "Candidate does not exist");
        
        // Verify the nullifier using ZKP
        _nullify(
            bytes32(_nullifier),
            bytes32(_root),
            _proof_a,
            _proof_b,
            _proof_c
        );
        
        // Increment vote count for the candidate
        candidates[_candidateId].voteCount++;
        totalVotes++;
        
        emit VoteCast(bytes32(_nullifier), _candidateId);
    }

    /**
     * @dev Get candidate information by ID
     * @param _candidateId Candidate to retrieve info for
     * @return id The unique identifier of the candidate
     * @return name The name of the candidate
     * @return details Additional information about the candidate
     * @return voteCount The number of votes the candidate has received
     */
    function getCandidate(uint256 _candidateId) public view returns (
        uint256 id, 
        string memory name, 
        string memory details, 
        uint256 voteCount
    ) {
        require(candidates[_candidateId].exists, "Candidate does not exist");
        Candidate memory candidate = candidates[_candidateId];
        return (
            candidate.id,
            candidate.name,
            candidate.details,
            candidate.voteCount
        );
    }

    /**
     * @dev Get all candidates with their vote counts
     * @return ids Array of candidate IDs
     * @return names Array of candidate names
     * @return voteCounts Array of vote counts for each candidate
     */
    function getAllCandidatesWithVotes() public view returns (
        uint256[] memory ids, 
        string[] memory names, 
        uint256[] memory voteCounts
    ) {
        uint256[] memory _ids = new uint256[](candidatesCount);
        string[] memory _names = new string[](candidatesCount);
        uint256[] memory _voteCounts = new uint256[](candidatesCount);
        
        for (uint256 i = 1; i <= candidatesCount; i++) {
            _ids[i-1] = candidates[i].id;
            _names[i-1] = candidates[i].name;
            _voteCounts[i-1] = candidates[i].voteCount;
        }
        
        return (_ids, _names, _voteCounts);
    }

    /**
     * @dev Get voting status
     * @return isActive Whether voting is currently active
     * @return remainingTime Time remaining before voting ends (in seconds)
     */
    function getVotingStatus() public view returns (
        bool isActive, 
        uint256 remainingTime
    ) {
        if (votingStatus.isActive && block.timestamp < votingStatus.endTime) {
            return (true, votingStatus.endTime - block.timestamp);
        } else {
            return (false, 0);
        }
    }

    /**
     * @dev Unregister a voter (for testing purposes only)
     * @param _voterAddress Address of the voter to unregister
     */
    function unregisterVoter(address _voterAddress) public onlyAdmin {
        require(voters[_voterAddress].registered, "Voter not registered");
        voters[_voterAddress].registered = false;
        emit VoterUnregistered(_voterAddress);
    }

    /**
     * @dev Check if an address is registered
     * @param _voter Address to check
     * @return isRegistered Whether the address is registered
     */
    function checkVoterStatus(address _voter) public view returns (
        bool isRegistered
    ) {
        return voters[_voter].registered;
    }
} 