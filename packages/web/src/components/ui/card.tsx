import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "dashed" | "interactive";
  onClick?: () => void;
}

export function Card({
  children,
  className = "",
  variant = "default",
  onClick,
}: CardProps) {
  const base = "rounded-lg p-4 bg-[#161b22]";
  const border =
    variant === "dashed"
      ? "border border-dashed border-gray-700"
      : "border border-gray-800";
  const hover =
    variant === "interactive" || onClick
      ? "cursor-pointer hover:border-cyan-500/50 hover:bg-[#1c2333] transition-colors"
      : "";

  return (
    <div
      className={`${base} ${border} ${hover} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
