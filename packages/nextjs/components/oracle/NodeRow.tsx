import { useEffect, useRef } from "react";
import { ConfigSlider } from "./ConfigSlider";
import { NodeRowProps } from "./types";
import { formatEther, formatUnits } from "viem";
import { HighlightedCell } from "~~/components/oracle/HighlightedCell";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const getHighlightColorForPrice = (currentPrice: bigint | undefined, medianPrice: bigint | undefined) => {
  if (currentPrice === undefined || medianPrice === undefined) return "";
  const medianPriceNum = Number(medianPrice);
  if (medianPriceNum === 0) return "";
  const percentageChange = Math.abs((Number(currentPrice) - medianPriceNum) / medianPriceNum) * 100;
  if (percentageChange < 5) return "bg-success";
  else if (percentageChange < 10) return "bg-warning";
  else return "bg-error";
};

export const NodeRow = ({ address }: NodeRowProps) => {
  const { data = [] } = useScaffoldReadContract({
    contractName: "StakeBasedOracle",
    functionName: "nodes",
    args: [address],
  });

  const { data: orcBalance } = useScaffoldReadContract({
    contractName: "ORC",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: minimumStake } = useScaffoldReadContract({
    contractName: "StakeBasedOracle",
    functionName: "MINIMUM_STAKE",
    args: undefined,
  });

  const { data: medianPrice } = useScaffoldReadContract({
    contractName: "StakeBasedOracle",
    functionName: "getPrice",
  }) as { data: bigint | undefined };

  const [, stakedAmount, lastReportedPrice] = data;

  const prevMedianPrice = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (medianPrice !== undefined && medianPrice !== prevMedianPrice.current) {
      prevMedianPrice.current = medianPrice;
    }
  }, [medianPrice]);

  const stakedAmountFormatted = stakedAmount !== undefined ? Number(formatEther(stakedAmount)) : "Loading...";
  const lastReportedPriceFormatted =
    lastReportedPrice !== undefined ? Number(formatUnits(lastReportedPrice, 6)) : "No price reported";
  const orcBalanceFormatted = orcBalance !== undefined ? Number(formatEther(orcBalance)) : "Loading...";

  // Check if staked amount is below minimum requirement
  const isInsufficientStake = stakedAmount !== undefined && minimumStake !== undefined && stakedAmount < minimumStake;

  return (
    <tr className={isInsufficientStake ? "bg-gray-300 opacity-50" : ""}>
      <td>
        <Address address={address} size="sm" format="short" onlyEnsOrAddress={true} />
      </td>
      <HighlightedCell value={stakedAmountFormatted} highlightColor="bg-error">
        {stakedAmountFormatted}
      </HighlightedCell>
      <HighlightedCell
        value={lastReportedPriceFormatted}
        highlightColor={getHighlightColorForPrice(lastReportedPrice, medianPrice)}
      >
        {lastReportedPriceFormatted}
      </HighlightedCell>
      <HighlightedCell value={orcBalanceFormatted} highlightColor="bg-success">
        {orcBalanceFormatted}
      </HighlightedCell>
      <ConfigSlider nodeAddress={address.toLowerCase()} endpoint="skip-probability" label="skip rate" />
      <ConfigSlider nodeAddress={address.toLowerCase()} endpoint="price-variance" label="variance" />
    </tr>
  );
};
