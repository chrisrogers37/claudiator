"use client";

import { useState } from "react";

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || "https://mcp.the-claudefather.railway.app";

export function CopySnippet() {
  const [copied, setCopied] = useState(false);

  const snippet = JSON.stringify(
    {
      mcpServers: {
        claudefather: {
          type: "http",
          url: `${MCP_SERVER_URL}/mcp`,
          headers: {
            Authorization: "Bearer <your-token>",
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-sm text-gray-300 overflow-x-auto">
        {snippet}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
