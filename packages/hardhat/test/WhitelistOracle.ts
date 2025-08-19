import { expect } from "chai";
import { ethers } from "hardhat";

describe("WhitelistOracle", function () {
  let whitelistOracle;
  let owner;
  let simpleOracleFactory;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const WhitelistOracleFactory = await ethers.getContractFactory("WhitelistOracle");
    simpleOracleFactory = await ethers.getContractFactory("SimpleOracle");
    whitelistOracle = await WhitelistOracleFactory.deploy();
  });

  it("Should deploy and set owner", async function () {
    expect(await whitelistOracle.owner()).to.equal(owner.address);
  });

  it("Should allow owner to add and remove oracles", async function () {
    const oracle = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle.target);

    expect(await whitelistOracle.oracles(0)).to.equal(oracle.target);

    await whitelistOracle.removeOracle(0);

    await expect(whitelistOracle.oracles(0)).to.be.reverted;
  });

  it("Should not allow adding duplicate oracle addresses", async function () {
    const oracle = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle.target);

    await expect(whitelistOracle.addOracle(oracle.target)).to.be.revertedWith("Oracle already exists");
  });

  it("Should emit OracleAdded event when an oracle is added", async function () {
    const oracle = await simpleOracleFactory.deploy();

    const tx = await whitelistOracle.addOracle(oracle.target);
    const receipt = await tx.wait();

    await expect(receipt).to.emit(whitelistOracle, "OracleAdded").withArgs(oracle.target);
  });

  it("Should emit OracleRemoved event when an oracle is removed", async function () {
    const oracle = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle.target);

    await expect(whitelistOracle.removeOracle(0)).to.emit(whitelistOracle, "OracleRemoved").withArgs(oracle.target);
  });

  it("Should revert when trying to remove an oracle when none have been added", async function () {
    await expect(whitelistOracle.removeOracle(0)).to.be.revertedWith("Index out of bounds");
  });

  it("Should revert when trying to remove an oracle with a non-existent index", async function () {
    const oracle = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle.target);

    await expect(whitelistOracle.removeOracle(1)).to.be.revertedWith("Index out of bounds");

    await whitelistOracle.removeOracle(0);

    await expect(whitelistOracle.removeOracle(0)).to.be.revertedWith("Index out of bounds");
    await expect(whitelistOracle.removeOracle(999)).to.be.revertedWith("Index out of bounds");
  });

  it("Should revert getPrice if no oracles", async function () {
    await expect(whitelistOracle.getPrice()).to.be.revertedWith("No oracles available");
  });

  it("Should return correct price with one oracle", async function () {
    const oracle = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle.target);

    await oracle.connect(owner).setPrice(1000n);

    const price = await whitelistOracle.getPrice();
    expect(price).to.equal(1000n);
  });

  it("Should return correct median price with odd number of oracles", async function () {
    const oracle1 = await simpleOracleFactory.deploy();
    const oracle2 = await simpleOracleFactory.deploy();
    const oracle3 = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle1.target);
    await whitelistOracle.addOracle(oracle2.target);
    await whitelistOracle.addOracle(oracle3.target);

    const price1 = 1000n;
    const price2 = 3000n;
    const price3 = 2000n;

    await oracle1.connect(owner).setPrice(price1);

    await oracle2.connect(owner).setPrice(price2);

    await oracle3.connect(owner).setPrice(price3);

    const medianPrice = await whitelistOracle.getPrice();
    expect(medianPrice).to.equal(2000n);
  });

  it("Should return correct median price with even number of oracles", async function () {
    const oracle1 = await simpleOracleFactory.deploy();
    const oracle2 = await simpleOracleFactory.deploy();
    const oracle3 = await simpleOracleFactory.deploy();
    const oracle4 = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle1.target);
    await whitelistOracle.addOracle(oracle2.target);
    await whitelistOracle.addOracle(oracle3.target);
    await whitelistOracle.addOracle(oracle4.target);

    const price1 = 1000n;
    const price2 = 3000n;
    const price3 = 2000n;
    const price4 = 4000n;

    await oracle1.connect(owner).setPrice(price1);
    await oracle2.connect(owner).setPrice(price2);
    await oracle3.connect(owner).setPrice(price3);
    await oracle4.connect(owner).setPrice(price4);

    const medianPrice = await whitelistOracle.getPrice();
    expect(medianPrice).to.equal(2500n);
  });

  it("Should exclude price reports older than 10 seconds from median calculation", async function () {
    const oracle1 = await simpleOracleFactory.deploy();
    const oracle2 = await simpleOracleFactory.deploy();
    const oracle3 = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle1.target);
    await whitelistOracle.addOracle(oracle2.target);
    await whitelistOracle.addOracle(oracle3.target);

    await oracle1.connect(owner).setPrice(1000n);
    await oracle2.connect(owner).setPrice(2000n);
    await oracle3.connect(owner).setPrice(3000n);

    let medianPrice = await whitelistOracle.getPrice();
    expect(medianPrice).to.equal(2000n);

    await ethers.provider.send("evm_increaseTime", [11]);
    await ethers.provider.send("evm_mine");

    await oracle1.connect(owner).setPrice(5000n);
    await oracle2.connect(owner).setPrice(3000n);

    medianPrice = await whitelistOracle.getPrice();
    expect(medianPrice).to.equal(4000n);
  });

  it("Should revert when all price reports are older than 10 seconds", async function () {
    const oracle1 = await simpleOracleFactory.deploy();
    const oracle2 = await simpleOracleFactory.deploy();

    await whitelistOracle.addOracle(oracle1.target);
    await whitelistOracle.addOracle(oracle2.target);

    await oracle1.connect(owner).setPrice(1000n);
    await oracle2.connect(owner).setPrice(2000n);

    const medianPrice = await whitelistOracle.getPrice();
    expect(medianPrice).to.equal(1500n);

    await ethers.provider.send("evm_increaseTime", [11]);
    await ethers.provider.send("evm_mine");

    await expect(whitelistOracle.getPrice()).to.be.revertedWith("No valid prices available");
  });
});
