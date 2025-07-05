import { useEffect, useRef, useState } from "react";
import TooltipInfo from "../TooltipInfo";
import { formatUnits } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const getHighlightColor = (oldPrice: bigint | undefined, newPrice: bigint | undefined): string => {
  if (oldPrice === undefined || newPrice === undefined) return "";

  const change = Math.abs(Number(newPrice) - Number(oldPrice));

  if (change < 3) return "bg-success";
  if (change < 10) return "bg-warning";
  return "bg-error";
};

export const PriceWidget = () => {
  const [highlight, setHighlight] = useState(false);
  const [highlightColor, setHighlightColor] = useState("");
  const prevPrice = useRef<bigint | undefined>(undefined);

  const { data: currentPrice } = useScaffoldReadContract({
    contractName: "StakeBasedOracle",
    functionName: "getPrice",
  }) as { data: bigint | undefined };

  useEffect(() => {
    if (currentPrice !== undefined && prevPrice.current !== undefined && currentPrice !== prevPrice.current) {
      setHighlightColor(getHighlightColor(prevPrice.current, currentPrice));
      setHighlight(true);
      setTimeout(() => {
        setHighlight(false);
        setHighlightColor("");
      }, 650);
    }
    prevPrice.current = currentPrice;
  }, [currentPrice]);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Current Price</h2>
      <div className="bg-base-100 rounded-lg p-4 w-1/2 md:w-1/4 mx-auto flex justify-center items-center relative">
        <TooltipInfo top={0} right={0} infoText="TODO: Update this tooltip" />
        <div className={`rounded-lg transition-colors duration-1000 ${highlight ? highlightColor : ""}`}>
          <div className="text-4xl font-bold">
            {currentPrice !== undefined ? (
              `$${formatUnits(currentPrice, 6)}`
            ) : (
              <div className="animate-pulse">
                <div className="h-10 bg-secondary rounded-md w-32"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
