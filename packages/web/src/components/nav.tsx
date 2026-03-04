import { auth, signOut } from "@/lib/auth";

export async function Nav() {
  const session = await auth();
  if (!session) return null;

  return (
    <nav className="border-b border-gray-800 bg-[#0d1117]">
      <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
        <a href="/dashboard" className="font-mono text-green-400 text-sm">
          claudefather
        </a>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-sm">
            {session.user?.name || session.user?.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-gray-500 hover:text-gray-300 font-mono text-xs"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
