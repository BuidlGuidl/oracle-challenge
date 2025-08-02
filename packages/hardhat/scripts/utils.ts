import { Config } from "./oracle-bot/types";
import fs from "fs";
import path from "path";
import hre from "hardhat";

const getConfigPath = (): string => {
  return path.join(__dirname, "oracle-bot", "config.json");
};

export const getConfig = (): Config => {
  const configPath = getConfigPath();
  const configContent = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configContent) as Config;
  return config;
};

export const updateConfig = (updates: Partial<Config>): void => {
  const configPath = getConfigPath();
  const currentConfig = getConfig();
  const updatedConfig = { ...currentConfig, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
};

export const updatePriceCache = (price: number, timestamp: number): void => {
  updateConfig({
    PRICE: {
      CACHEDPRICE: price,
      TIMESTAMP: timestamp,
    },
  });
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup function to ensure automining is turned back on
export async function cleanup() {
  const publicClient = await hre.viem.getPublicClient();
  await publicClient.transport.request({ method: "evm_setAutomine", params: [true] });
  console.log("\nCleaning up: turning automining back on...");
}

export const QUESTIONS_FOR_OO: string[] = [
  "Did ETH/USD exceed $3,000 at 00:00 UTC on July 1, 2025?",
  "Did the BTC/ETH ratio fall below 14 on June 30, 2025?",
  "Did Uniswap’s TVL exceed $10B on May 15, 2025?",
  "Did the Ethereum Cancun upgrade activate before May 1, 2025?",
  "Did the average gas price on Ethereum exceed 200 gwei on June 5, 2025?",
  "Did Ethereum’s staking participation rate exceed 25% on June 1, 2025?",
  "Did Base chain have more than 1M daily transactions on June 15, 2025?",
  "Did the SEC approve a Bitcoin ETF before July 1, 2025?",
  "Did OpenSea’s trading volume exceed $500M in May 2025?",
  "Did Farcaster have more than 10K active users on June 10, 2025?",
  "Did ENS domains exceed 5M total registrations before July 2025?",
  "Did the total bridged USDC on Arbitrum exceed $2B on June 1, 2025?",
  "Did Optimism’s native token OP increase above $1.50 on July 1, 2025?",
  "Did Aave v3 have higher borrow volume than v2 on June 1, 2025?",
  "Did Compound see more than 1,000 liquidations on June 12, 2025?",
  "Did BTC’s 24-hour volume exceed $50B on June 7, 2025?",
  "Did Real Madrid win the UEFA Champions League Final in 2025?",
  "Did G2 Esports win a major tournament in May 2025?",
  "Did the temperature in New York exceed 35°C on July 1, 2025?",
  "Did it rain more than 50mm in London on June 15, 2025?",
  "Did Tokyo experience an earthquake of magnitude 5.0 or higher in June 2025?",
  "Did the Nasdaq Composite fall more than 3% on June 20, 2025?",
  "Did the S&P 500 set a new all-time high on June 5, 2025?",
  "Did the US unemployment rate drop below 4% in June 2025?",
  "Did the average global temperature for June 2025 exceed that of June 2024?",
  "Did gold price exceed $2,200/oz on June 30, 2025?",
  "Did YouTube’s most viewed video gain more than 10M new views in June 2025?",
  "Did the population of India officially surpass China according to the UN in 2025?",
  "Did the UEFA Euro 2024 Final have more than 80,000 attendees in the stadium?",
  "Did a pigeon successfully complete a 500km race in under 10 hours in June 2025?",
  "Did a goat attend a university graduation ceremony wearing a cap and gown in June 2025?",
  "Did someone eat 100 chicken nuggets in under 10 minutes in July 2025?",
  "Did a cat walk across a live TV weather report in June 2025?",
  "Did a cow escape from a farm and get caught on camera riding a water slide in 2025?",
  "Did a man legally change his name to 'Bitcoin McMoneyface' in June 2025?",
  "Did a squirrel steal a GoPro and film itself in June 2025?",
  "Did someone cosplay as Shrek and complete a full marathon in July 2025?",
  "Did a group of people attempt to cook the world's largest pancake using a flamethrower?",
  "Did a man propose using a pizza drone delivery in June 2025?",
  "Did a woman knit a sweater large enough to cover a school bus in July 2025?",
  "Did someone attempt to break the world record for most dad jokes told in 1 hour?",
  "Did an alpaca accidentally join a Zoom meeting for a tech startup in June 2025?",
];
