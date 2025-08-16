import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StakingOracle", function () {
  let oracle: any;
  let oraToken: any;
  let node1: any;
  let node2: any;
  let node3: any;
  let node4: any;
  let slasher: any;

  const MINIMUM_STAKE = ethers.parseEther("1");
  const STALE_DATA_WINDOW = 5;

  beforeEach(async function () {
    [, node1, node2, node3, node4, slasher] = await ethers.getSigners();

    const StakingOracleFactory = await ethers.getContractFactory("StakingOracle");
    oracle = await StakingOracleFactory.deploy();

    const oraTokenAddress = await oracle.oracleToken();
    oraToken = await ethers.getContractAt("ORA", oraTokenAddress);
  });

  describe("constructor", function () {
    it("Should deploy an ORA token and set initial state", async function () {
      const StakingOracleFactory = await ethers.getContractFactory("StakingOracle");
      const newly_deployed_oracle = await StakingOracleFactory.deploy();
      const tokenAddress = await newly_deployed_oracle.oracleToken();
      const contractCode = await ethers.provider.getCode(tokenAddress);
      expect(contractCode).to.not.equal("0x");
    });
  });

  describe("getNodeAddresses", function () {
    it("Should return an empty array when no nodes are registered", async function () {
      const StakingOracleFactory = await ethers.getContractFactory("StakingOracle");
      const newOracle = await StakingOracleFactory.deploy();
      const nodeAddresses = await newOracle.getNodeAddresses();
      assert(Array.isArray(nodeAddresses), "nodeAddresses should be an array");
      assert(nodeAddresses.length === 0, "nodeAddresses should be empty");
    });

    it("Should return all registered node addresses in order", async function () {
      await oracle.connect(node1).registerNode(1500, { value: MINIMUM_STAKE });
      await oracle.connect(node2).registerNode(1501, { value: MINIMUM_STAKE });
      await oracle.connect(node3).registerNode(1502, { value: MINIMUM_STAKE });
      const nodeAddresses = await oracle.getNodeAddresses();
      expect(nodeAddresses).to.deep.equal([node1.address, node2.address, node3.address]);
    });
  });

  describe("Node Registration", function () {
    it("Should allow nodes to register with minimum stake", async function () {
      const initialPrice = 1500;
      await expect(oracle.connect(node1).registerNode(initialPrice, { value: MINIMUM_STAKE }))
        .to.emit(oracle, "NodeRegistered")
        .withArgs(node1.address, MINIMUM_STAKE)
        .and.to.emit(oracle, "PriceReported")
        .withArgs(node1.address, initialPrice);

      const nodeInfo = await oracle.nodes(node1.address);
      expect(nodeInfo.nodeAddress).to.equal(node1.address);
      expect(nodeInfo.stakedAmount).to.equal(MINIMUM_STAKE);
      expect(nodeInfo.lastReportedPrice).to.equal(initialPrice);
      expect(nodeInfo.lastReportedTimestamp).to.be.gt(0);

      expect(await oracle.nodeAddresses(0)).to.equal(node1.address);
    });

    it("Should emit NodeRegistered and PriceReported events on successful registration", async function () {
      const initialPrice = 1500;
      await expect(oracle.connect(node1).registerNode(initialPrice, { value: MINIMUM_STAKE }))
        .to.emit(oracle, "NodeRegistered")
        .withArgs(node1.address, MINIMUM_STAKE)
        .and.to.emit(oracle, "PriceReported")
        .withArgs(node1.address, initialPrice);
    });

    it("Should reject registration with insufficient stake", async function () {
      const insufficientStake = ethers.parseEther("0.5");
      const initialPrice = 1500;
      await expect(oracle.connect(node1).registerNode(initialPrice, { value: insufficientStake })).to.be.revertedWith(
        "Insufficient stake",
      );
    });

    it("Should reject duplicate node registration", async function () {
      const initialPrice = 1500;
      await oracle.connect(node1).registerNode(initialPrice, { value: MINIMUM_STAKE });

      await expect(oracle.connect(node1).registerNode(initialPrice, { value: MINIMUM_STAKE })).to.be.revertedWith(
        "Node already registered",
      );
    });
  });

  describe("Price Reporting", function () {
    beforeEach(async function () {
      await oracle.connect(node1).registerNode(1500, { value: MINIMUM_STAKE });
    });

    it("Should record the reported price and timestamp in contract state", async function () {
      let nodeInfo = await oracle.nodes(node1.address);
      expect(nodeInfo.lastReportedPrice).to.equal(1500);
      expect(nodeInfo.lastReportedTimestamp).to.be.gt(0);

      const price = 1600;
      const tx = await oracle.connect(node1).reportPrice(price);
      await tx.wait();

      nodeInfo = await oracle.nodes(node1.address);
      expect(nodeInfo.lastReportedPrice).to.equal(price);
      expect(nodeInfo.lastReportedTimestamp).to.be.gt(0);
    });

    it("Should emit PriceReported event when reporting price", async function () {
      const price = 1500;
      await expect(oracle.connect(node1).reportPrice(price))
        .to.emit(oracle, "PriceReported")
        .withArgs(node1.address, price);
    });

    it("Should reject price reports from unregistered nodes", async function () {
      const price = 1500;

      await expect(oracle.connect(node2).reportPrice(price)).to.be.revertedWith("Node not registered");
    });

    it("Should reject price reports from nodes with insufficient stake", async function () {
      await oracle.connect(node1).reportPrice(1500);
      await time.increase(STALE_DATA_WINDOW + 1);
      await oracle.connect(slasher).slashNodes();

      const nodeInfo = await oracle.nodes(node1.address);
      const expectedSlashedAmount = MINIMUM_STAKE - ethers.parseEther("1");
      expect(nodeInfo.stakedAmount).to.equal(expectedSlashedAmount);
      expect(nodeInfo.stakedAmount).to.be.lt(MINIMUM_STAKE);

      await expect(oracle.connect(node1).reportPrice(1600)).to.be.revertedWith("Not enough stake");
    });
  });

  describe("Claim Reward", function () {
    beforeEach(async function () {
      await oracle.connect(node1).registerNode(1500, { value: MINIMUM_STAKE });
    });

    it("Should allow nodes to claim rewards based on time elapsed", async function () {
      await time.increase(100); // 100 seconds

      const balanceBefore = await oraToken.balanceOf(node1.address);
      await oracle.connect(node1).claimReward();
      const balanceAfter = await oraToken.balanceOf(node1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should reject claim from unregistered nodes", async function () {
      await expect(oracle.connect(node2).claimReward()).to.be.revertedWith("Node not registered");
    });

    it("Should update lastClaimedTimestamp after successful claim", async function () {
      await time.increase(100);

      const nodeInfoBefore = await oracle.nodes(node1.address);
      await oracle.connect(node1).claimReward();
      const nodeInfoAfter = await oracle.nodes(node1.address);

      expect(nodeInfoAfter.lastClaimedTimestamp).to.be.gt(nodeInfoBefore.lastClaimedTimestamp);
    });
  });

  describe("Price Aggregation and Node Management", function () {
    beforeEach(async function () {
      await oracle.connect(node1).registerNode(1450, { value: MINIMUM_STAKE });
      await oracle.connect(node2).registerNode(1500, { value: MINIMUM_STAKE });
      await oracle.connect(node3).registerNode(1550, { value: MINIMUM_STAKE });
    });

    it("Should slash stale nodes and reward slasher", async function () {
      await time.increase(STALE_DATA_WINDOW + 1);
      await oracle.connect(node1).reportPrice(1600);

      const slasherBalanceBefore = await ethers.provider.getBalance(slasher.address);
      await oracle.connect(slasher).slashNodes();
      const slasherBalanceAfter = await ethers.provider.getBalance(slasher.address);

      expect(slasherBalanceAfter).to.be.gt(slasherBalanceBefore);

      const node2Info = await oracle.nodes(node2.address);
      const node3Info = await oracle.nodes(node3.address);

      const expectedSlashedAmount = MINIMUM_STAKE - ethers.parseEther("1");
      expect(node2Info.stakedAmount).to.equal(expectedSlashedAmount);
      expect(node3Info.stakedAmount).to.equal(expectedSlashedAmount);
    });

    it("Should emit NodeSlashed events for stale nodes", async function () {
      await time.increase(STALE_DATA_WINDOW + 1);
      await oracle.connect(node1).reportPrice(1600);

      await expect(oracle.connect(slasher).slashNodes())
        .to.emit(oracle, "NodeSlashed")
        .withArgs(node2.address, ethers.parseEther("1"))
        .and.to.emit(oracle, "NodeSlashed")
        .withArgs(node3.address, ethers.parseEther("1"));
    });

    it("Should correctly calculate median price", async function () {
      let price = await oracle.getPrice();
      expect(price).to.equal(1500);

      await oracle.connect(node4).registerNode(1600, { value: MINIMUM_STAKE });
      price = await oracle.getPrice();
      expect(price).to.equal(1525);
    });

    it("Should exclude stale price reports in the median calculation", async function () {
      let price = await oracle.getPrice();
      expect(price).to.equal(1500);

      await time.increase(STALE_DATA_WINDOW + 1);

      await oracle.connect(node2).reportPrice(2400);
      await oracle.connect(node3).reportPrice(2500);

      price = await oracle.getPrice();
      expect(price).to.equal(2450);

      await time.increase(STALE_DATA_WINDOW + 1);
      await oracle.connect(node1).reportPrice(1700);

      price = await oracle.getPrice();
      expect(price).to.equal(1700);
    });

    it("Should handle case when no valid prices are available", async function () {
      await time.increase(STALE_DATA_WINDOW + 1);

      await expect(oracle.getPrice()).to.be.revertedWith("No valid prices available");
    });

    it("Should reward slasher with correct percentage of slashed amounts", async function () {
      const StakingOracleFactory = await ethers.getContractFactory("StakingOracle");
      const freshOracle = await StakingOracleFactory.deploy();

      await freshOracle.connect(node1).registerNode(1500, { value: MINIMUM_STAKE });
      await freshOracle.connect(node2).registerNode(1501, { value: MINIMUM_STAKE });

      await time.increase(STALE_DATA_WINDOW + 1);

      await freshOracle.connect(node1).reportPrice(1500);

      const slasherBalanceBefore = await ethers.provider.getBalance(slasher.address);

      const tx = await freshOracle.connect(slasher).slashNodes();
      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");
      const gasUsed = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice);

      const node2InfoAfter = await freshOracle.nodes(node2.address);
      expect(node2InfoAfter.stakedAmount).to.equal(MINIMUM_STAKE - ethers.parseEther("1"));

      const SLASHER_REWARD_PERCENTAGE = await freshOracle.SLASHER_REWARD_PERCENTAGE();
      const expectedReward = (ethers.parseEther("1") * SLASHER_REWARD_PERCENTAGE) / 100n;
      const slasherBalanceAfter = await ethers.provider.getBalance(slasher.address);

      expect(slasherBalanceAfter).to.equal(slasherBalanceBefore + expectedReward - gasUsed);
    });
  });
});
