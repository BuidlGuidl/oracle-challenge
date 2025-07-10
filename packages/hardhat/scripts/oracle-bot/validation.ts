import { HardhatRuntimeEnvironment } from "hardhat/types";

export const validateNodes = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments } = hre;
  const [account] = await hre.viem.getWalletClients();
  const oracleContract = await deployments.get("StakeBasedOracle");

  try {
    return await account.writeContract({
      address: oracleContract.address as `0x${string}`,
      abi: oracleContract.abi,
      functionName: "validateNodes",
      args: [],
    });
  } catch (error) {
    console.error("Error validating nodes:", error);
  }
};
