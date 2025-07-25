// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { Arrays } from "@openzeppelin/contracts/utils/Arrays.sol";
import "./OracleToken.sol";

contract StakingOracle {
    ORA public oracleToken;

    struct OracleNode {
        address nodeAddress;
        uint256 stakedAmount;
        uint256 lastReportedPrice;
        uint256 lastReportedTimestamp;
    }

    mapping(address => OracleNode) public nodes;
    address[] public nodeAddresses;

    uint256 public constant MINIMUM_STAKE = 10 ether;
    uint256 public constant STALE_DATA_WINDOW = 5 seconds;

    event NodeRegistered(address indexed node, uint256 stakedAmount);
    event PriceReported(address indexed node, uint256 price);

    event NodeSlashed(address indexed node, uint256 amount);
    event NodeRewarded(address indexed node, uint256 amount);

    event NodesValidated();

    address public oracleTokenAddress;

    constructor() {
        oracleToken = new ORA();
    }

    /* ========== Oracle Node Operation Functions ========== */
    function registerNode() public payable {
        require(msg.value >= MINIMUM_STAKE, "Insufficient stake");
        require(nodes[msg.sender].nodeAddress == address(0), "Node already registered");

        nodes[msg.sender] = OracleNode({
            nodeAddress: msg.sender,
            stakedAmount: msg.value,
            lastReportedPrice: 0,
            lastReportedTimestamp: 0
        });

        nodeAddresses.push(msg.sender);

        emit NodeRegistered(msg.sender, msg.value);
    }

    function reportPrice(uint256 price) public {
        OracleNode storage node = nodes[msg.sender];
        require(node.nodeAddress != address(0), "Node not registered");
        require(node.stakedAmount >= MINIMUM_STAKE, "Not enough stake");

        node.lastReportedPrice = price;
        node.lastReportedTimestamp = block.timestamp;

        emit PriceReported(msg.sender, price);
    }

    function rewardNode(address nodeAddress, uint256 reward) internal {
        oracleToken.mint(nodeAddress, reward);
        emit NodeRewarded(nodeAddress, reward);
    }

    function slashNode(address nodeToSlash, uint256 penalty) internal {
        OracleNode storage node = nodes[nodeToSlash];
        uint256 actualPenalty = penalty > node.stakedAmount ? node.stakedAmount : penalty;
        node.stakedAmount -= actualPenalty;

        emit NodeSlashed(nodeToSlash, actualPenalty);
    }

    function validateNodes() public {
        (address[] memory freshNodes, address[] memory staleNodes) = separateStaleNodes(nodeAddresses);

        for (uint256 i = 0; i < freshNodes.length; i++) {
            address nodeAddress = freshNodes[i];
            rewardNode(nodeAddress, 10 ether);
        }

        for (uint256 i = 0; i < staleNodes.length; i++) {
            address nodeAddress = staleNodes[i];
            slashNode(nodeAddress, 1 ether);
        }

        emit NodesValidated();
    }

    /* ========== Price Calculation Functions ========== */
    function getMedian(uint256[] memory arr) internal pure returns (uint256) {
        uint256 length = arr.length;
        if (length % 2 == 0) {
            return (arr[length / 2 - 1] + arr[length / 2]) / 2;
        } else {
            return arr[length / 2];
        }
    }

    function separateStaleNodes(
        address[] memory nodesToSeparate
    ) internal view returns (address[] memory fresh, address[] memory stale) {
        address[] memory freshNodeAddresses = new address[](nodesToSeparate.length);
        address[] memory staleNodeAddresses = new address[](nodesToSeparate.length);
        uint256 freshCount = 0;
        uint256 staleCount = 0;

        for (uint i = 0; i < nodesToSeparate.length; i++) {
            address nodeAddress = nodesToSeparate[i];
            OracleNode memory node = nodes[nodeAddress];
            uint256 timeElapsed = block.timestamp - node.lastReportedTimestamp;
            bool dataIsStale = timeElapsed > STALE_DATA_WINDOW;

            if (dataIsStale) {
                staleNodeAddresses[staleCount] = nodeAddress;
                staleCount++;
            } else {
                freshNodeAddresses[freshCount] = nodeAddress;
                freshCount++;
            }
        }

        address[] memory trimmedFreshNodes = new address[](freshCount);
        address[] memory trimmedStaleNodes = new address[](staleCount);

        for (uint i = 0; i < freshCount; i++) {
            trimmedFreshNodes[i] = freshNodeAddresses[i];
        }
        for (uint i = 0; i < staleCount; i++) {
            trimmedStaleNodes[i] = staleNodeAddresses[i];
        }

        return (trimmedFreshNodes, trimmedStaleNodes);
    }

    function getPricesFromAddresses(address[] memory addresses) internal view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            OracleNode memory node = nodes[addresses[i]];
            prices[i] = node.lastReportedPrice;
        }

        return prices;
    }

    function getPrice() public view returns (uint256) {
        (address[] memory validAddresses, ) = separateStaleNodes(nodeAddresses);
        uint256[] memory validPrices = getPricesFromAddresses(validAddresses);
        require(validPrices.length > 0, "No valid prices available");
        Arrays.sort(validPrices);
        return getMedian(validPrices);
    }

    function getNodeAddresses() public view returns (address[] memory) {
        return nodeAddresses;
    }
}
