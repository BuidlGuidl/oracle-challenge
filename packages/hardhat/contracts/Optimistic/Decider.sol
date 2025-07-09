// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./OptimisticOracle.sol";

contract Decider {
    address public owner;
    OptimisticOracle public oracle;
    
    event DisputeSettled(address indexed asserter, string description, bool resolvedValue, address indexed resolvedBy);
    
    constructor(address _oracle) {
        owner = msg.sender;
        oracle = OptimisticOracle(_oracle);
    }
    
    /**
     * @notice Settle a dispute by determining the true/false outcome
     * @param asserter The address that made the original assertion
     * @param description The description of the event being disputed
     * @param resolvedValue The true/false outcome determined by the decider
     */
    function settleDispute(address asserter, string memory description, bool resolvedValue) external {
        require(asserter != address(0), "Invalid asserter");
        require(bytes(description).length > 0, "Invalid description");
        
        // Call the oracle's settleAssertion function
        oracle.settleAssertion(asserter, description, resolvedValue);
        
        emit DisputeSettled(asserter, description, resolvedValue, msg.sender);
    }
    
    function setOracle(address newOracle) external {
        require(msg.sender == owner, "Only owner can set oracle");
        oracle = OptimisticOracle(newOracle);
    }

    /**
     * @notice Allow the contract to receive ETH
     */
    receive() external payable {}
} 
