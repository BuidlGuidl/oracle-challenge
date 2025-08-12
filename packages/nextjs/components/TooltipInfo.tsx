import React from "react";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

interface TooltipInfoProps {
  top?: number;
  right?: number;
  infoText: string;
  direction?: "left" | "right" | "top" | "bottom";
}

// Note: The relative positioning is required for the tooltip to work.
const TooltipInfo: React.FC<TooltipInfoProps> = ({ top, right, infoText, direction = "right" }) => {
  const tooltipDirectionClass = `tooltip-${direction}`;

  if (top !== undefined && right !== undefined) {
    return (
      <span className="absolute z-10" style={{ top: `${top * 0.25}rem`, right: `${right * 0.25}rem` }}>
        <div className={`tooltip tooltip-secondary ${tooltipDirectionClass} font-normal`} data-tip={infoText}>
          <QuestionMarkCircleIcon className="h-5 w-5 m-1" />
        </div>
      </span>
    );
  }

  return (
    <div className={`tooltip tooltip-secondary ${tooltipDirectionClass} font-normal`} data-tip={infoText}>
      <QuestionMarkCircleIcon className="h-5 w-5 m-1" />
    </div>
  );
};

export default TooltipInfo;
