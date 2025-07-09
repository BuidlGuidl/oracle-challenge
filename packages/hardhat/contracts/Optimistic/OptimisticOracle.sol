// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Decider } from "./Decider.sol";

contract OptimisticOracle {
    enum State { Invalid, Asserted, Proposed, Disputed, Settled }

    error AssertionExists();
    error AssertionNotFound();
    error AssertionProposed();
    error IncorrectBond();
    error ProposalDisputed();
    error DeadlineNotMet();
    error NotProposedAssertion();
    error AlreadyClaimed();
    error AlreadySettled();
    error AwaitingDecider();
    error NotDisputedAssertion();
    error OnlyDecider();
    error OnlyOwner();
    error TransferFailed();

    struct EventAssertion {
        address asserter;
        address proposer;
        address disputer;
        bool proposedOutcome;
        bool resolvedOutcome;
        uint256 reward;
        uint256 bond;
        uint256 deadline;
        bool claimed;
        address winner;
    }

    uint256 public constant DISPUTE_WINDOW = 1 hours;
    uint256 public constant FIXED_BOND = 1 ether;
    uint256 public constant DECIDER_FEE = 0.2 ether;
    Decider public decider;
    address public owner;
    mapping(bytes32 => EventAssertion) public assertions;

    event EventAsserted(bytes32 assertionId, address indexed asserter, string description, uint256 reward);
    event OutcomeProposed(bytes32 assertionId, address indexed proposer, bool outcome);
    event OutcomeDisputed(bytes32 assertionId, address indexed disputer);
    event AssertionSettled(bytes32 assertionId, bool outcome, address winner);
    event DeciderUpdated(address indexed oldDecider, address indexed newDecider);
    event RewardClaimed(bytes32 assertionId, address indexed winner, uint256 amount);
    event RefundClaimed(bytes32 assertionId, address indexed asserter, uint256 amount);

    modifier onlyDecider() {
        if (msg.sender != address(decider)) revert OnlyDecider();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _decider) {
        decider = Decider(payable(_decider));
        owner = msg.sender;
    }

    /**
     * @notice Update the decider address (for deployment integration)
     */
    function setDecider(address _decider) external onlyOwner {
        address oldDecider = address(decider);
        decider = Decider(payable(_decider));
        emit DeciderUpdated(oldDecider, _decider);
    }

    /**
     * @notice Assert that an event will have a true/false outcome.
     * @dev The `description` is used to identify the event (e.g. "Did X happen by time Y?")
     */
    function assertEvent(string memory description) external payable returns (bytes32) {
        bytes32 assertionId = keccak256(abi.encodePacked(msg.sender, description));
        if (assertions[assertionId].asserter != address(0)) revert AssertionExists();

        assertions[assertionId] = EventAssertion({
            asserter: msg.sender,
            proposer: address(0),
            disputer: address(0),
            proposedOutcome: false,
            resolvedOutcome: false,
            reward: msg.value,
            bond: FIXED_BOND,
            deadline: block.timestamp + DISPUTE_WINDOW,
            claimed: false,
            winner: address(0)
        });

        emit EventAsserted(assertionId, msg.sender, description, msg.value);
        return assertionId;
    }

    /**
     * @notice Propose the outcome (true or false) for an asserted event.
     */
    function proposeOutcome(address asserter, string memory description, bool outcome) external payable {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.asserter == address(0)) revert AssertionNotFound();
        if (assertion.proposer != address(0)) revert AssertionProposed();
        if (msg.value != assertion.bond) revert IncorrectBond();

        assertion.proposer = msg.sender;
        assertion.proposedOutcome = outcome;
        // Reset the dispute deadline 
        assertion.deadline = block.timestamp + DISPUTE_WINDOW;

        emit OutcomeProposed(assertionId, msg.sender, outcome);
    }

    /**
     * @notice Dispute the proposed outcome by bonding ETH.
     */
    function disputeOutcome(address asserter, string memory description) external payable {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.proposer == address(0)) revert NotProposedAssertion();
        if (assertion.disputer != address(0)) revert ProposalDisputed();
        if (block.timestamp > assertion.deadline) revert DeadlineNotMet();
        if (msg.value != assertion.bond) revert IncorrectBond();

        assertion.disputer = msg.sender;

        emit OutcomeDisputed(assertionId, msg.sender);
    }

    function _sendReward(bytes32 assertionId, uint256 totalReward, address winner) internal {
        // Send decider fee
        (bool deciderSuccess, ) = payable(address(decider)).call{value: DECIDER_FEE}("");
        if (!deciderSuccess) revert TransferFailed();

        // Send reward to winner
        (bool winnerSuccess, ) = payable(winner).call{value: totalReward}("");
        if (!winnerSuccess) revert TransferFailed();

        emit RewardClaimed(assertionId, winner, totalReward);
    }
    /**
     * @notice Claim reward for uncontested assertions after dispute window expires.
     * @dev Only the proposer can claim if no dispute occurred.
     */
    function claimUndisputedReward(address asserter, string memory description) external {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.proposer == address(0)) revert NotProposedAssertion();
        if (assertion.disputer != address(0)) revert ProposalDisputed();
        if (block.timestamp <= assertion.deadline) revert DeadlineNotMet();
        if (assertion.claimed) revert AlreadyClaimed();

        assertion.claimed = true;
        assertion.resolvedOutcome = assertion.proposedOutcome;
        assertion.winner = assertion.proposer;

        uint256 totalReward = (assertion.reward + assertion.bond) - DECIDER_FEE;

        _sendReward(assertionId, totalReward, assertion.proposer);
    }

    /**
     * @notice Claim reward for disputed assertions after decider settlement.
     * @dev Only the winner can claim after the decider has settled the dispute.
     */
    function claimDisputedReward(address asserter, string memory description) external {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.proposer == address(0)) revert NotProposedAssertion();
        if (assertion.disputer == address(0)) revert NotDisputedAssertion();
        if (assertion.winner == address(0)) revert AwaitingDecider();
        if (assertion.claimed) revert AlreadyClaimed();

        assertion.claimed = true;

        uint256 totalReward = (assertion.reward + assertion.bond + assertion.bond) - DECIDER_FEE; // reward + proposer bond + disputer bond - decider fee
        _sendReward(assertionId, totalReward, assertion.winner);
    }

    /**
     * @notice Claim refund for any assertion that does not get a proposal before deadline
     * @dev Only the asserter can claim refund
     */
    function claimRefund(address asserter, string memory description) external {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.proposer != address(0)) revert AssertionProposed();
        if (block.timestamp <= assertion.deadline) revert DeadlineNotMet();
        if (assertion.claimed) revert AlreadyClaimed();

        assertion.claimed = true;

        (bool refundSuccess, ) = payable(assertion.asserter).call{value: assertion.reward}("");
        if (!refundSuccess) revert TransferFailed();
        emit RefundClaimed(assertionId, assertion.asserter, assertion.reward);
    }

    /**
     * @notice Decider resolves disputed assertions and sets the winner.
     * @dev Only the decider can call this. The winner must then call claimDisputedReward.
     */
    function settleAssertion(address asserter, string memory description, bool resolvedOutcome) external onlyDecider {
        bytes32 assertionId = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage assertion = assertions[assertionId];

        if (assertion.proposer == address(0)) revert NotProposedAssertion();
        if (assertion.disputer == address(0)) revert NotDisputedAssertion();
        if (assertion.winner != address(0)) revert AlreadySettled();

        assertion.resolvedOutcome = resolvedOutcome;
        
        // Set the winner based on whether the proposed outcome was correct
        assertion.winner = (resolvedOutcome == assertion.proposedOutcome)
            ? assertion.proposer
            : assertion.disputer;

        emit AssertionSettled(assertionId, resolvedOutcome, assertion.winner);
    }

    /**
     * @notice Returns the current state of an assertion.
     */
    function getState(address asserter, string memory description) external view returns (State) {
        bytes32 id = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage a = assertions[id];

        if (a.asserter == address(0)) return State.Invalid;
        
        // If no proposal yet, it's in Asserted state
        if (a.proposer == address(0)) return State.Asserted;
        
        // If there's a winner, it's settled
        if (a.winner != address(0)) return State.Settled;
        
        // If there's a dispute, it's disputed
        if (a.disputer != address(0)) return State.Disputed;
        
        // If no dispute and deadline passed, it's settled (can be claimed)
        if (a.deadline > 0 && block.timestamp > a.deadline) return State.Settled;
        
        // Otherwise it's proposed
        return State.Proposed;
    }

    /**
     * @notice Get the resolution of an assertion.
     */
    function getResolution(address asserter, string memory description) external view returns (bool) {
        bytes32 id = keccak256(abi.encodePacked(asserter, description));
        EventAssertion storage a = assertions[id];
        if (a.asserter == address(0)) revert AssertionNotFound();

        if (a.disputer == address(0)) {
            if (block.timestamp <= a.deadline) revert DeadlineNotMet();
            return a.proposedOutcome;
        } else {
            if (a.winner == address(0)) revert AwaitingDecider();
            return a.resolvedOutcome;
        }
    }
}
