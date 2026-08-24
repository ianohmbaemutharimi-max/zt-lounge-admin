"use client";

import { useState } from "react";

type ChatResponse = { reply?: string; error?: string };

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setReply("");
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = (await res.json()) as ChatResponse;

      if (!res.ok || typeof data.reply !== "string") {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setReply(data.reply);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        color: "#f1f5f9",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "#1e293b",
          borderRadius: "16px",
          padding: "2rem",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            margin: "0 0 1.5rem",
            fontSize: "1.5rem",
            textAlign: "center",
          }}
        >
          Claude Chat
        </h1>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
          placeholder="Type your message… (Ctrl/Cmd+Enter to send)"
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "0.75rem",
            borderRadius: "8px",
            border: "1px solid #334155",
            backgroundColor: "#0f172a",
            color: "#f1f5f9",
            fontSize: "1rem",
            fontFamily: "inherit",
            marginBottom: "1rem",
          }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !message.trim()}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: loading ? "#475569" : "#6366f1",
            color: "#fff",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: loading || !message.trim() ? "not-allowed" : "pointer",
            marginBottom: "1rem",
          }}
        >
          {loading ? "Thinking…" : "Send"}
        </button>

        {loading && (
          <p style={{ textAlign: "center", color: "#94a3b8", margin: "0 0 1rem" }}>
            Claude is thinking…
          </p>
        )}

        {error && (
          <p
            style={{
              color: "#f87171",
              backgroundColor: "#7f1d1d",
              padding: "0.75rem",
              borderRadius: "8px",
              margin: "0 0 1rem",
            }}
          >
            {error}
          </p>
        )}

        {reply && (
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "1rem",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {reply}
          </div>
        )}
      </div>
    </main>
  );
}