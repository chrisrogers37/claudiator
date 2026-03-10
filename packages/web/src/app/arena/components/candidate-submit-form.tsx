"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const sourceTypes = [
  { value: "github_skill", label: "GitHub Skill" },
  { value: "web_article", label: "Web Article" },
  { value: "community_submission", label: "Community Submission" },
  { value: "provider_skills", label: "Provider Skills" },
];

export function CandidateSubmitForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sourceType, setSourceType] = useState("github_skill");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawContent, setRawContent] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/arena/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceUrl: sourceUrl || null, rawContent }),
      });
      if (res.ok) {
        setSourceType("github_skill");
        setSourceUrl("");
        setRawContent("");
        setOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 font-mono text-sm text-yellow-500 hover:bg-yellow-500/20 transition-colors"
      >
        + Submit Candidate
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-800 bg-[#161b22] p-4 space-y-4"
    >
      <h3 className="font-mono text-sm text-gray-300">Submit New Candidate</h3>

      <div>
        <label className="block font-mono text-xs text-gray-500 mb-1">
          Source Type
        </label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="w-full rounded border border-gray-700 bg-[#0d1117] px-3 py-2 font-mono text-sm text-gray-200 focus:border-yellow-500 focus:outline-none"
        >
          {sourceTypes.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-mono text-xs text-gray-500 mb-1">
          Source URL <span className="text-gray-600">(optional)</span>
        </label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-gray-700 bg-[#0d1117] px-3 py-2 font-mono text-sm text-gray-200 placeholder:text-gray-600 focus:border-yellow-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block font-mono text-xs text-gray-500 mb-1">
          Raw Content <span className="text-red-400">*</span>
        </label>
        <textarea
          required
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          rows={6}
          placeholder="Paste skill content, article text, or description..."
          className="w-full rounded border border-gray-700 bg-[#0d1117] px-3 py-2 font-mono text-sm text-gray-200 placeholder:text-gray-600 focus:border-yellow-500 focus:outline-none resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !rawContent.trim()}
          className="rounded bg-yellow-500/20 border border-yellow-500/30 px-4 py-2 font-mono text-sm text-yellow-500 hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-gray-700 px-4 py-2 font-mono text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
