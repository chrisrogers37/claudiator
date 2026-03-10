import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-mono text-4xl text-green-400 mb-4">
          claudiator
        </h1>
        <p className="text-gray-400 mb-8 max-w-md">
          Centralized skill registry for Claude Code. Manage your skills,
          API keys, and sync configuration.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-mono text-sm rounded transition-colors"
          >
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
