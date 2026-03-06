"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { DiffViewer } from "@/components/workshop/diff-viewer";
import { AgentChatInput } from "./agent-chat-input";
import { MarkdownPreview } from "./markdown-preview";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-sm">
      Loading editor...
    </div>
  ),
});

interface SkillEditorProps {
  slug: string;
  skillId: string;
  initialContent: string;
  currentVersion: string | null;
}

type EditorMode = "edit" | "diff" | "preview";

export function SkillEditor({
  slug,
  skillId,
  initialContent,
  currentVersion,
}: SkillEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [originalContent] = useState(initialContent);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<string | null>(null);

  const hasChanges = content !== originalContent;

  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/skills/${slug}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, skillId }),
      });
    } finally {
      setIsSaving(false);
    }
  }, [slug, content, skillId]);

  const handleAiEdit = useCallback(
    async (instruction: string) => {
      setIsAiLoading(true);
      try {
        const res = await fetch(`/api/skills/${slug}/ai-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, instruction }),
        });
        const data = await res.json();
        if (data.proposedContent) {
          setAiProposal(data.proposedContent);
          setMode("diff");
        }
      } finally {
        setIsAiLoading(false);
      }
    },
    [slug, content]
  );

  const acceptAiProposal = useCallback(() => {
    if (aiProposal) {
      setContent(aiProposal);
      setAiProposal(null);
      setMode("edit");
    }
  }, [aiProposal]);

  const rejectAiProposal = useCallback(() => {
    setAiProposal(null);
    setMode("edit");
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Mode tabs + save button */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex gap-1">
          {(["edit", "diff", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-wider ${
                mode === m
                  ? "text-green-400 bg-green-400/10"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-400 font-mono">
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleSaveDraft}
            disabled={!hasChanges || isSaving}
            className="px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider border disabled:opacity-50 transition-colors"
            style={{
              backgroundColor: hasChanges
                ? "rgba(212, 160, 23, 0.15)"
                : "transparent",
              color: hasChanges ? "#d4a017" : "#4b5563",
              borderColor: hasChanges ? "#d4a017" : "#374151",
            }}
          >
            {isSaving ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 flex gap-0 rounded-lg overflow-hidden border border-gray-800">
        {mode === "edit" && (
          <>
            <div className="flex-1 min-w-0">
              <Editor
                height="100%"
                language="markdown"
                value={content}
                onChange={(val) => setContent(val || "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                  lineNumbers: "on",
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>

            <div className="w-px bg-gray-800" />

            <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-[#0f1520]">
              <MarkdownPreview content={content} />
            </div>
          </>
        )}

        {mode === "diff" && (
          <div className="flex-1 min-w-0 overflow-y-auto">
            <DiffViewer
              oldContent={originalContent}
              newContent={aiProposal || content}
              oldLabel={currentVersion ? `v${currentVersion} (current)` : "Current"}
              newLabel={aiProposal ? "AI Proposal" : "Draft"}
            />
            {aiProposal && (
              <div className="flex gap-2 p-4 border-t border-gray-800">
                <button
                  onClick={acceptAiProposal}
                  className="px-4 py-2 rounded text-sm font-mono border border-green-400 bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
                >
                  Accept Changes
                </button>
                <button
                  onClick={rejectAiProposal}
                  className="px-4 py-2 rounded text-sm font-mono border border-red-400 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "preview" && (
          <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-[#0f1520]">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>

      <AgentChatInput onSubmit={handleAiEdit} isLoading={isAiLoading} />
    </div>
  );
}
