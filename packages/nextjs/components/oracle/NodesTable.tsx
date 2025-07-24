import TooltipInfo from "../TooltipInfo";
import { NodeRow } from "./NodeRow";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const LoadingRow = () => {
  return (
    <tr>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-32"></div>
      </td>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-20"></div>
      </td>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-24"></div>
      </td>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-20"></div>
      </td>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-32"></div>
      </td>
      <td className="animate-pulse">
        <div className="h-8 bg-secondary rounded w-32"></div>
      </td>
    </tr>
  );
};

const NoNodesRow = () => {
  return (
    <tr>
      <td colSpan={6} className="text-center">
        No nodes found
      </td>
    </tr>
  );
};

export const NodesTable = () => {
  const { data: nodeAddresses, isLoading } = useScaffoldReadContract({
    contractName: "StakingOracle",
    functionName: "getNodeAddresses",
  });

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Oracle Nodes</h2>
      <div className="bg-base-100 rounded-lg p-4 relative">
        <TooltipInfo top={0} right={0} infoText="TODO: Update this tooltip" />
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Node Address</th>
                <th>Staked Amount (ETH)</th>
                <th>Last Reported Price (USD)</th>
                <th>ORC Balance</th>
                <th>Skip Probability</th>
                <th>Price Variance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRow />
              ) : nodeAddresses?.length === 0 ? (
                <NoNodesRow />
              ) : (
                nodeAddresses?.map((address: string, index: number) => (
                  <NodeRow key={index} index={index} address={address} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
