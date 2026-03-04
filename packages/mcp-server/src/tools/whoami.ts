export async function whoami(
  user: { id: string; githubUsername: string; role: string }
): Promise<{ content: { type: "text"; text: string }[] }> {
  const lines = [
    `GitHub: @${user.githubUsername}`,
    `Role: ${user.role}`,
    `User ID: ${user.id}`,
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
