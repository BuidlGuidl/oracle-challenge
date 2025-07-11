import { Config } from "./oracle-bot/types";
import fs from "fs";
import path from "path";

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
