import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TokenForm } from "@/components/token-form";

export default async function GenerateTokenPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      <div className="max-w-lg mx-auto px-6 py-12">
        <a
          href="/dashboard"
          className="text-gray-500 hover:text-gray-300 font-mono text-sm mb-6 block"
        >
          &larr; Back to Dashboard
        </a>
        <h1 className="font-mono text-2xl text-green-400 mb-6">
          Generate API Key
        </h1>
        <TokenForm />
      </div>
    </div>
  );
}
