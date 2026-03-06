"use client";

import { useState, type FormEvent } from "react";

interface AgentChatInputProps {
  onSubmit: (instruction: string) => Promise<void>;
  isLoading: boolean;
}

export function AgentChatInput({ onSubmit, isLoading }: AgentChatInputProps) {
  const [instruction, setInstruction] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || isLoading) return;
    await onSubmit(instruction.trim());
    setInstruction("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex gap-2 items-center px-1">
      <div className="flex-1">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ask AI to edit this skill... (e.g., 'Make the error handling section more concise')"
          disabled={isLoading}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-mono bg-[#0d1220] text-gray-200 border border-gray-800 placeholder:text-gray-600 disabled:opacity-50 focus:border-cyan-400 focus:outline-none transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={!instruction.trim() || isLoading}
        className="px-4 py-2.5 rounded-lg text-sm font-mono uppercase tracking-wider border border-amber-500 bg-amber-500/15 text-amber-400 disabled:opacity-30 hover:bg-amber-500/25 transition-colors"
      >
        {isLoading ? "Thinking..." : "Send"}
      </button>
    </form>
  );
}
