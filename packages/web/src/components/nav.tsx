import { auth, signOut } from "@/lib/auth";

export async function Nav() {
  const session = await auth();
  if (!session) return null;

  const role = (session as any).role;

  return (
    <nav className="border-b border-gray-800 bg-[#0d1117]">
      <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
        <a href="/dashboard" className="font-mono text-green-400 text-sm">
          claudiator
        </a>
        <div className="flex items-center gap-4">
          <a
            href="/workshop"
            className="font-mono text-xs text-amber-400 hover:text-amber-300"
          >
            Workshop
          </a>
          <a
            href="/workshop/feedback"
            className="font-mono text-xs text-gray-500 hover:text-gray-300"
          >
            Feedback
          </a>
          <a
            href="/workshop/learnings"
            className="font-mono text-xs text-gray-500 hover:text-gray-300"
          >
            Learnings
          </a>
          <a
            href="/arena"
            className="font-mono text-xs text-yellow-500 hover:text-yellow-400"
          >
            Arena
          </a>
          {role === "admin" && (
            <a
              href="/admin"
              className="font-mono text-xs text-red-400 hover:text-red-300"
            >
              Admin
            </a>
          )}
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
