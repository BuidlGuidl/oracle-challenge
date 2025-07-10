import { reportPrices } from "./oracle-bot/reporting";
import { validateNodes } from "./oracle-bot/validation";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import hre from "hardhat";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runCycle = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const publicClient = await hre.viem.getPublicClient();
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`\n[Block ${blockNumber}] Starting new oracle cycle...`);

    await publicClient.transport.request({ method: "evm_setAutomine", params: [false] });
    await reportPrices(hre);
    await publicClient.transport.request({ method: "evm_mine" });

    await validateNodes(hre);
    await publicClient.transport.request({ method: "evm_mine" });
    await publicClient.transport.request({ method: "evm_setAutomine", params: [true] });
  } catch (error) {
    console.error("Error in oracle cycle:", error);
  }
};

const run = async () => {
  console.log("Starting oracle bot system...");
  while (true) {
    await runCycle(hre);
    await sleep(3000);
  }
};

// Add proper error handling for the main loop
process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

run().catch(error => {
  console.error("Fatal error in oracle bot system:", error);
  process.exit(1);
});
