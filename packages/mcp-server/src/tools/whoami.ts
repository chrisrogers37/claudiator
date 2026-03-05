export async function whoami(
  user: { id: string; githubUsername: string; isAdmin: boolean }
): Promise<{ content: { type: "text"; text: string }[] }> {
  const lines = [
    `GitHub: @${user.githubUsername}`,
    `Role: ${user.isAdmin ? "admin" : "member"}`,
    `User ID: ${user.id}`,
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
