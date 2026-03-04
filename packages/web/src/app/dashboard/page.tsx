import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TokenTable } from "@/components/token-table";
import { ConnectionHealth } from "@/components/connection-health";
import { CopySnippet } from "@/components/copy-snippet";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-mono text-2xl text-green-400 mb-2">
          claudefather
        </h1>
        <p className="text-gray-500 mb-8">
          API Keys &amp; MCP Configuration
        </p>

        {/* Connection Health */}
        <section className="mb-10">
          <h2 className="font-mono text-lg text-amber-400 mb-4">
            Connection Health
          </h2>
          <ConnectionHealth />
        </section>

        {/* API Keys */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-lg text-amber-400">API Keys</h2>
            <a
              href="/dashboard/generate"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-mono text-sm rounded transition-colors"
            >
              + Generate New Key
            </a>
          </div>
          <TokenTable />
        </section>

        {/* MCP Configuration Snippet */}
        <section>
          <h2 className="font-mono text-lg text-amber-400 mb-4">
            MCP Configuration
          </h2>
          <p className="text-gray-400 text-sm mb-3">
            Add this to your <code className="text-green-400">~/.claude/settings.json</code>:
          </p>
          <CopySnippet />
        </section>
      </div>
    </div>
  );
}
