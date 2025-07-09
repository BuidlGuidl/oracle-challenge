import { expect } from "chai";
import { ethers } from "hardhat";
import { OptimisticOracle, Decider } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("OptimisticOracle", function () {
  let optimisticOracle: OptimisticOracle;
  let deciderContract: Decider;
  let owner: HardhatEthersSigner;
  let asserter: HardhatEthersSigner;
  let proposer: HardhatEthersSigner;
  let disputer: HardhatEthersSigner;
  let otherUser: HardhatEthersSigner;

  // Enum for state
  const State = {
    Invalid: 0n,
    Asserted: 1n,
    Proposed: 2n,
    Disputed: 3n,
    Settled: 4n,
  };

  beforeEach(async function () {
    [owner, asserter, proposer, disputer, otherUser] = await ethers.getSigners();

    // Deploy OptimisticOracle with temporary decider (owner)
    const OptimisticOracleFactory = await ethers.getContractFactory("OptimisticOracle");
    optimisticOracle = await OptimisticOracleFactory.deploy(owner.address);

    // Deploy Decider
    const DeciderFactory = await ethers.getContractFactory("Decider");
    deciderContract = await DeciderFactory.deploy(optimisticOracle.target);

    // Set the decider in the oracle
    await optimisticOracle.setDecider(deciderContract.target);
  });

  describe("Deployment", function () {
    it("Should deploy successfully", function () {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(optimisticOracle.target).to.not.be.undefined;
    });

    it("Should set the correct owner", async function () {
      const contractOwner = await optimisticOracle.owner();
      expect(contractOwner).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      const disputeWindow = await optimisticOracle.DISPUTE_WINDOW();
      const fixedBond = await optimisticOracle.FIXED_BOND();
      const deciderFee = await optimisticOracle.DECIDER_FEE();

      expect(disputeWindow).to.equal(3600n); // 1 hour
      expect(fixedBond).to.equal(ethers.parseEther("1"));
      expect(deciderFee).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("Event Assertion", function () {
    it("Should allow users to assert events with reward", async function () {
      const description = "Will Bitcoin reach $1m by end of 2026?";
      const reward = ethers.parseEther("1");

      const tx = await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const assertionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [asserter.address, description]),
      );
      expect(tx)
        .to.emit(optimisticOracle, "EventAsserted")
        .withArgs(assertionId, asserter.address, description, reward);

      const state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Asserted); // Asserted state
    });

    it("Should reject duplicate assertions", async function () {
      const description = "Will Bitcoin reach $1m by end of 2026?";
      const reward = ethers.parseEther("1");

      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      await expect(
        optimisticOracle.connect(asserter).assertEvent(description, { value: reward }),
      ).to.be.revertedWithCustomError(optimisticOracle, "AssertionExists");
    });
  });

  describe("Outcome Proposal", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });
    });

    it("Should allow proposing outcomes with correct bond", async function () {
      const bond = await optimisticOracle.FIXED_BOND();
      const outcome = true;

      const tx = await optimisticOracle
        .connect(proposer)
        .proposeOutcome(asserter.address, description, outcome, { value: bond });

      const assertionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [asserter.address, description]),
      );
      expect(tx).to.emit(optimisticOracle, "OutcomeProposed").withArgs(assertionId, proposer.address, outcome);

      // Check that the proposal was recorded by checking the state
      const state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Proposed); // Proposed state
    });

    it("Should reject proposals with incorrect bond", async function () {
      const wrongBond = ethers.parseEther("0.5");
      const outcome = true;

      await expect(
        optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, outcome, { value: wrongBond }),
      ).to.be.revertedWithCustomError(optimisticOracle, "IncorrectBond");
    });

    it("Should reject duplicate proposals", async function () {
      const bond = await optimisticOracle.FIXED_BOND();
      const outcome = true;

      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, outcome, { value: bond });

      await expect(
        optimisticOracle.connect(otherUser).proposeOutcome(asserter.address, description, !outcome, { value: bond }),
      ).to.be.revertedWithCustomError(optimisticOracle, "AssertionProposed");
    });
  });

  describe("Outcome Dispute", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });
    });

    it("Should allow disputing outcomes with correct bond", async function () {
      const bond = await optimisticOracle.FIXED_BOND();

      const tx = await optimisticOracle
        .connect(disputer)
        .disputeOutcome(asserter.address, description, { value: bond });

      const assertionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [asserter.address, description]),
      );
      expect(tx).to.emit(optimisticOracle, "OutcomeDisputed").withArgs(assertionId, disputer.address);

      // Check that the dispute was recorded by checking the state
      const state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Disputed); // Disputed state
    });

    it("Should reject disputes with incorrect bond", async function () {
      const wrongBond = ethers.parseEther("0.5");

      await expect(
        optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: wrongBond }),
      ).to.be.revertedWithCustomError(optimisticOracle, "IncorrectBond");
    });

    it("Should reject disputes after deadline", async function () {
      // Fast forward time past dispute window
      await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second
      await ethers.provider.send("evm_mine");

      const bond = await optimisticOracle.FIXED_BOND();
      await expect(
        optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond }),
      ).to.be.revertedWithCustomError(optimisticOracle, "DeadlineNotMet");
    });

    it("Should reject duplicate disputes", async function () {
      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond });

      await expect(
        optimisticOracle.connect(otherUser).disputeOutcome(asserter.address, description, { value: bond }),
      ).to.be.revertedWithCustomError(optimisticOracle, "ProposalDisputed");
    });
  });

  describe("Undisputed Reward Claiming", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });
    });

    it("Should allow claiming undisputed rewards after deadline", async function () {
      // Fast forward time past dispute window
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      const initialBalance = await ethers.provider.getBalance(proposer.address);
      const tx = await optimisticOracle.connect(proposer).claimUndisputedReward(asserter.address, description);
      const receipt = await tx.wait();
      const finalBalance = await ethers.provider.getBalance(proposer.address);

      // Check that proposer received the reward (reward + bond - decider fee - gas costs)
      const expectedReward = reward + (await optimisticOracle.FIXED_BOND()) - (await optimisticOracle.DECIDER_FEE());
      const gasCost = receipt!.gasUsed * receipt!.gasPrice!;
      expect(finalBalance - initialBalance + gasCost).to.equal(expectedReward);
    });

    it("Should reject claiming before deadline", async function () {
      await expect(
        optimisticOracle.connect(proposer).claimUndisputedReward(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "DeadlineNotMet");
    });

    it("Should reject claiming disputed assertions", async function () {
      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond });

      await expect(
        optimisticOracle.connect(proposer).claimUndisputedReward(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "ProposalDisputed");
    });

    it("Should reject claiming already claimed rewards", async function () {
      // Fast forward time and claim
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      await optimisticOracle.connect(proposer).claimUndisputedReward(asserter.address, description);

      await expect(
        optimisticOracle.connect(proposer).claimUndisputedReward(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "AlreadyClaimed");
    });
  });

  describe("Disputed Reward Claiming", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });
      await optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond });
    });

    it("Should allow winner to claim disputed rewards after settlement", async function () {
      // Settle with proposer winning
      await deciderContract.connect(owner).settleDispute(asserter.address, description, true);

      const initialBalance = await ethers.provider.getBalance(proposer.address);
      const tx = await optimisticOracle.connect(proposer).claimDisputedReward(asserter.address, description);
      const receipt = await tx.wait();
      const finalBalance = await ethers.provider.getBalance(proposer.address);

      // Check that proposer received the reward (reward + 2*bond - decider fee - gas costs)
      const expectedReward =
        reward + (await optimisticOracle.FIXED_BOND()) * 2n - (await optimisticOracle.DECIDER_FEE());
      const gasCost = receipt!.gasUsed * receipt!.gasPrice!;
      expect(finalBalance - initialBalance + gasCost).to.equal(expectedReward);
    });

    it("Should allow disputer to claim when they win", async function () {
      // Settle with disputer winning
      await deciderContract.connect(owner).settleDispute(asserter.address, description, false);

      const initialBalance = await ethers.provider.getBalance(disputer.address);
      const tx = await optimisticOracle.connect(disputer).claimDisputedReward(asserter.address, description);
      const receipt = await tx.wait();
      const finalBalance = await ethers.provider.getBalance(disputer.address);

      // Check that disputer received the reward
      const expectedReward =
        reward + (await optimisticOracle.FIXED_BOND()) * 2n - (await optimisticOracle.DECIDER_FEE());
      const gasCost = receipt!.gasUsed * receipt!.gasPrice!;
      expect(finalBalance - initialBalance + gasCost).to.equal(expectedReward);
    });

    it("Should reject claiming before settlement", async function () {
      await expect(
        optimisticOracle.connect(proposer).claimDisputedReward(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "AwaitingDecider");
    });

    it("Should reject claiming already claimed rewards", async function () {
      await deciderContract.connect(owner).settleDispute(asserter.address, description, true);
      await optimisticOracle.connect(proposer).claimDisputedReward(asserter.address, description);

      await expect(
        optimisticOracle.connect(proposer).claimDisputedReward(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "AlreadyClaimed");
    });
  });

  describe("Refund Claiming", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });
    });

    it("Should allow asserter to claim refund for assertions without proposals", async function () {
      // Fast forward time past dispute window
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      const initialBalance = await ethers.provider.getBalance(asserter.address);
      const tx = await optimisticOracle.connect(asserter).claimRefund(asserter.address, description);
      const receipt = await tx.wait();
      const finalBalance = await ethers.provider.getBalance(asserter.address);

      // Check that asserter received the refund (reward - gas costs)
      const gasCost = receipt!.gasUsed * receipt!.gasPrice!;
      expect(finalBalance - initialBalance + gasCost).to.equal(reward);
    });

    it("Should reject refund claiming for assertions with proposals", async function () {
      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });

      await expect(
        optimisticOracle.connect(asserter).claimRefund(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "AssertionProposed");
    });

    it("Should reject claiming already claimed refunds", async function () {
      // Fast forward time and claim
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      await optimisticOracle.connect(asserter).claimRefund(asserter.address, description);

      await expect(
        optimisticOracle.connect(asserter).claimRefund(asserter.address, description),
      ).to.be.revertedWithCustomError(optimisticOracle, "AlreadyClaimed");
    });
  });

  describe("Dispute Settlement", function () {
    let description: string;
    let reward: bigint;

    beforeEach(async function () {
      description = "Will Bitcoin reach $1m by end of 2026?";
      reward = ethers.parseEther("1");
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });
      await optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond });
    });

    it("Should allow decider to settle disputed assertions", async function () {
      const resolvedOutcome = true;
      const tx = await deciderContract.connect(owner).settleDispute(asserter.address, description, resolvedOutcome);

      const assertionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [asserter.address, description]),
      );
      expect(tx).to.emit(optimisticOracle, "AssertionSettled").withArgs(assertionId, resolvedOutcome, proposer.address);

      // Check that the assertion was settled correctly by checking the state
      const state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Settled); // Settled state
    });

    it("Should reject settlement by non-decider", async function () {
      const resolvedOutcome = true;

      await expect(
        optimisticOracle.connect(otherUser).settleAssertion(asserter.address, description, resolvedOutcome),
      ).to.be.revertedWithCustomError(optimisticOracle, "OnlyDecider");
    });

    it("Should reject settling undisputed assertions", async function () {
      // Create a new undisputed assertion
      const newDescription = "Will Ethereum reach $10k by end of 2024?";
      await optimisticOracle.connect(asserter).assertEvent(newDescription, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, newDescription, true, { value: bond });

      const resolvedOutcome = true;
      await expect(
        deciderContract.connect(owner).settleDispute(asserter.address, newDescription, resolvedOutcome),
      ).to.be.revertedWithCustomError(optimisticOracle, "NotDisputedAssertion");
    });
  });

  describe("State Management", function () {
    it("Should return correct states for different scenarios", async function () {
      const description = "Will Bitcoin reach $1m by end of 2026?";
      const reward = ethers.parseEther("1");

      // Invalid state for non-existent assertion
      let state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Invalid); // Invalid

      // Asserted state
      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });
      state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Asserted); // Asserted

      // Proposed state
      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });
      state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Proposed); // Proposed

      // Disputed state
      await optimisticOracle.connect(disputer).disputeOutcome(asserter.address, description, { value: bond });
      state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Disputed); // Disputed

      // Settled state (after decider resolution)
      await deciderContract.connect(owner).settleDispute(asserter.address, description, true);
      state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Settled); // Settled
    });

    it("Should show settled state for claimable uncontested assertions", async function () {
      const description = "Will Ethereum reach $10k by end of 2024?";
      const reward = ethers.parseEther("1");

      await optimisticOracle.connect(asserter).assertEvent(description, { value: reward });

      const bond = await optimisticOracle.FIXED_BOND();
      await optimisticOracle.connect(proposer).proposeOutcome(asserter.address, description, true, { value: bond });

      // Fast forward time past dispute window
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      const state = await optimisticOracle.getState(asserter.address, description);
      expect(state).to.equal(State.Settled); // Settled (can be claimed)
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set new decider", async function () {
      await optimisticOracle.connect(owner).setDecider(otherUser.address);
      expect(await optimisticOracle.decider()).to.equal(otherUser.address);
    });

    it("Should reject non-owner from setting decider", async function () {
      await expect(optimisticOracle.connect(otherUser).setDecider(otherUser.address)).to.be.revertedWithCustomError(
        optimisticOracle,
        "OnlyOwner",
      );
    });
  });
});
