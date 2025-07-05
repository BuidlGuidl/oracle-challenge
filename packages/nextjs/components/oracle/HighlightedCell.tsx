import { useEffect, useRef, useState } from "react";

export const HighlightedCell = ({
  value,
  highlightColor,
  children,
}: {
  value: string | number;
  highlightColor: string;
  children: React.ReactNode;
}) => {
  const [isHighlighted, setIsHighlighted] = useState(false);
  const prevValue = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof value !== "number") return;
    const hasPrev = typeof prevValue.current === "number";

    if (hasPrev && value !== prevValue.current) {
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), 1000);
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  return <td className={`transition-colors duration-300 ${isHighlighted ? highlightColor : ""}`}>{children}</td>;
};
