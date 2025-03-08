// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.17;

/**
 * @title EVotingSystem
 * @dev Smart contract for a decentralized voting system
 */
contract EVotingSystem {
    // Structures
    struct Candidate {
        uint256 id;
        string name;
        string details;
        uint256 voteCount;
        bool exists;
    }

    struct Voter {
        bool isRegistered;
        bool hasVoted;
        uint256 votedCandidateId;
    }

    // State variables
    address public admin;
    uint256 public candidatesCount;
    mapping(uint256 => Candidate) private candidates;
    mapping(address => Voter) public voters;
    
    bool public votingStarted;
    bool public votingEnded;
    uint256 public startTime;
    uint256 public endTime;
    
    uint256 public totalVotes;

    // Events
    event CandidateAdded(uint256 candidateId, string name);
    event VoterRegistered(address voterAddress);
    event VoteCast(address voter, uint256 candidateId);
    event VotingStarted(uint256 startTime, uint256 endTime);
    event VotingEnded(uint256 endTime, uint256 totalVotes);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier votingActive() {
        require(votingStarted && !votingEnded, "Voting is not active");
        _;
    }

    modifier votingNotStarted() {
        require(!votingStarted, "Voting has already started");
        _;
    }

    // Constructor
    constructor() {
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
     * @dev Register a voter
     * @param _voter Address of the voter to register
     */
    function registerVoter(address _voter) public onlyAdmin {
        require(!voters[_voter].isRegistered, "Voter is already registered");
        voters[_voter] = Voter(true, false, 0);
        emit VoterRegistered(_voter);
    }

    /**
     * @dev Start the voting period
     * @param _durationInMinutes Duration of the voting period in minutes
     */
    function startVoting(uint256 _durationInMinutes) public onlyAdmin votingNotStarted {
        require(candidatesCount > 0, "No candidates added yet");
        require(_durationInMinutes > 0, "Duration must be greater than 0");
        
        votingStarted = true;
        startTime = block.timestamp;
        endTime = startTime + (_durationInMinutes * 1 minutes);
        
        emit VotingStarted(startTime, endTime);
    }

    /**
     * @dev End the voting period (can be called by admin before the scheduled end time)
     */
    function endVoting() public onlyAdmin votingActive {
        votingEnded = true;
        endTime = block.timestamp;
        emit VotingEnded(endTime, totalVotes);
    }

    /**
     * @dev Cast a vote for a candidate
     * @param _candidateId ID of the candidate to vote for
     */
    function vote(uint256 _candidateId) public votingActive {
        Voter storage sender = voters[msg.sender];
        
        require(sender.isRegistered, "Voter is not registered");
        require(!sender.hasVoted, "Voter has already voted");
        require(candidates[_candidateId].exists, "Candidate does not exist");
        
        sender.hasVoted = true;
        sender.votedCandidateId = _candidateId;
        
        candidates[_candidateId].voteCount++;
        totalVotes++;
        
        emit VoteCast(msg.sender, _candidateId);
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
        if (votingStarted && !votingEnded && block.timestamp < endTime) {
            return (true, endTime - block.timestamp);
        } else {
            return (false, 0);
        }
    }

    /**
    * @dev Check if an address has voted
    * @param _voter Address to check
    * @return hasVoted Whether the address has voted
    * @return votedFor The candidate ID they voted for (if they voted)
    */
    function checkVoterStatus(address _voter) public view returns (
        bool hasVoted, 
        uint256 votedFor
    ) {
        require(voters[_voter].isRegistered, "Voter is not registered");
        return (voters[_voter].hasVoted, voters[_voter].votedCandidateId);
    }
}