import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  Loader2,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const API_URL = "https://learn-with-ai-backend-jx3x.onrender.com";
//const API_URL = "http://127.0.0.1:8000";
const PORTFOLIO_URL = "https://dev-mahesh-portfolio.web.app/";

const INK = "#20293A";
const PAPER = "#F6F2E7";
const PAPER_DIM = "#EFE9D9";
const MARKER = "#F4C542";
const MARKER_SOFT = "#F4C54255";
const TEAL = "#2F6F62";
const CORAL = "#D9614C";

const suggestedPrompts = [
  { title: "Summarize", text: "Give me a clear summary of this document." },
  { title: "Study notes", text: "Turn this document into concise exam-ready notes." },
  { title: "Quiz me", text: "Quiz me on the most important concepts, one question at a time." },
  { title: "Explain simply", text: "Explain the hardest concepts in simple language with examples." },
];

// Strips <scratchpad>...</scratchpad> blocks from streamed text. Because
// text arrives in arbitrary chunks, this also hides a scratchpad block the
// instant its opening tag appears (even before the closing tag has arrived),
// and trims a partial tag fragment (e.g. "<scratch") that might be sitting
// at the very end of the buffer mid-stream.
function stripScratchpad(raw) {
  let cleaned = raw.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, "");

  const openMatch = cleaned.match(/<scratchpad\b[^>]*>/i);
  if (openMatch) {
    cleaned = cleaned.slice(0, openMatch.index);
  } else {
    // Hide a trailing partial opening tag, e.g. "<scr" or "<scratchpad" with
    // no ">" yet, so it doesn't flash on screen for a frame.
    cleaned = cleaned.replace(/<[a-zA-Z]*$/, "");
  }

  return cleaned;
}

function getStreamText(raw, allowIncomplete = false) {
  const text = String(raw);
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("data:"))
    .map((line) => line.replace(/^\s*data:\s?/, ""));
  const candidate = dataLines.length ? dataLines.join("") : text;
  if (!/^\s*[{[]/.test(candidate)) return candidate;

  try {
    const payload = JSON.parse(candidate);
    if (typeof payload === "string") return payload;
    if (typeof payload.reply === "string") return payload.reply;
    if (typeof payload.response === "string") return payload.response;
    return candidate;
  } catch {
    // Do not render an incomplete JSON envelope. The completed response is
    // parsed again after the reader finishes.
    return allowIncomplete ? candidate : "";
  }
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
      * { font-family: 'Nunito', ui-sans-serif, system-ui, sans-serif; }
      .mono { font-family: 'Space Mono', ui-monospace, monospace; }
      ::selection { background: ${MARKER}; color: ${INK}; }
      .ruled {
        background-image: repeating-linear-gradient(
          ${INK}0d 0px, ${INK}0d 1px, transparent 1px, transparent 40px
        );
      }
      .scrollbar-quiet::-webkit-scrollbar { width: 8px; }
      .scrollbar-quiet::-webkit-scrollbar-thumb { background: ${INK}22; border-radius: 999px; }
      .highlight-word {
        background: linear-gradient(180deg, transparent 58%, ${MARKER} 58%, ${MARKER} 92%, transparent 92%);
        padding: 0 .12em;
      }
      .file-row .file-delete-btn { opacity: 0; transition: opacity 0.15s ease; }
      .file-row:hover .file-delete-btn { opacity: 1; }
      .file-delete-btn:focus-visible { opacity: 1; }
      .stream-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        margin-left: 2px;
        vertical-align: -0.15em;
        background: ${TEAL};
        animation: stream-blink 0.9s steps(1) infinite;
      }
      @keyframes stream-blink { 50% { opacity: 0; } }
    `}</style>
  );
}

function Credit({ variant = "light" }) {
  const dim = variant === "light" ? `${INK}55` : `${INK}70`;
  return (
    <div style={{ fontSize: "10px", letterSpacing: "0.04em", color: dim, textAlign: "center" }}>
      © {new Date().getFullYear()} · Developed by{" "}
      <a
        href={PORTFOLIO_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: TEAL, fontWeight: 800, textDecoration: "none", borderBottom: `1px solid ${TEAL}55` }}
        onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = TEAL)}
        onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = `${TEAL}55`)}
      >
        Mahesh
      </a>
    </div>
  );
}

function Logomark({ size = 40, style = {}, className = "" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      style={{
        display: "block",
        flexShrink: 0,
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        maxWidth: `${size}px`,
        ...style,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" fill={INK} />
      <rect
        x="5"
        y="21.5"
        width="30"
        height="8.5"
        rx="4.25"
        fill={MARKER}
        transform="rotate(-16 20 20)"
      />
      <path
        d="M29.5 7 L31.4 11.6 L36 13.5 L31.4 15.4 L29.5 20 L27.6 15.4 L23 13.5 L27.6 11.6 Z"
        fill={CORAL}
      />
    </svg>
  );
}

// Themed replacement for window.confirm. Renders as a centered modal
// matching the paper/ink/coral aesthetic instead of the native browser
// popup. Purely presentational — the actual delete logic still lives in
// deleteFile(), this just decides *when* to call it.
function ConfirmDeleteModal({ name, onCancel, onConfirm }) {
  if (!name) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div
        onClick={onCancel}
        style={{ position: "absolute", inset: 0, backgroundColor: "rgba(32,41,58,0.5)" }}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "360px",
          borderRadius: "20px",
          backgroundColor: PAPER,
          border: `1px solid ${INK}1f`,
          padding: "24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", backgroundColor: `${CORAL}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trash2 style={{ width: "18px", height: "18px", color: CORAL }} />
          </div>
          <div id="confirm-delete-title" style={{ fontSize: "16px", fontWeight: 800 }}>
            Remove document?
          </div>
        </div>

        <div style={{ fontSize: "13px", lineHeight: 1.6, color: `${INK}99`, marginBottom: "22px" }}>
          <strong style={{ color: INK, wordBreak: "break-word" }}>{name}</strong> will be removed from this workspace. This can't be undone.
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCancel}
            className="focus-visible:outline focus-visible:outline-2"
            style={{ flex: 1, padding: "11px", borderRadius: "10px", border: `1px solid ${INK}1f`, background: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", color: INK, outlineColor: TEAL }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="focus-visible:outline focus-visible:outline-2"
            style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "none", background: CORAL, fontWeight: 700, fontSize: "13px", cursor: "pointer", color: "#fff", outlineColor: TEAL }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("upload");
  const [file, setFile] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [deletingFile, setDeletingFile] = useState(null); // filename currently being deleted
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSeconds, setUploadSeconds] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId && sessionId !== "demo") {
        fetch(`${API_URL}/session/${sessionId}`, {
          method: "DELETE",
          keepalive: true,
        }).catch((err) => console.error("Cleanup failed:", err));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!isUploading) {
      setUploadSeconds(0);
      return;
    }
    const interval = setInterval(() => setUploadSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isUploading]);

  const fileSize = useMemo(() => {
    if (!file) return "";
    const mb = file.size / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }, [file]);

  const chooseFile = (selectedFile) => {
    if (!selectedFile) return;
    if (selectedFile.type !== "application/pdf") {
      alert("Please select a PDF file.");
      return;
    }
    setFile(selectedFile);
  };

  const handleFileSelect = (e) => chooseFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    chooseFile(e.dataTransfer.files?.[0]);
  };

  const startChat = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setSessionId(data.session_id);
      setAttachedFiles([file.name]);
      setView("chat");
      setMessages([
        {
          role: "assistant",
          content: `I've read through **${file.name}**. Ask me anything about it — summaries, explanations, comparisons, quizzes, or exam questions.`,
        },
      ]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(error);
      const timedOut = error.name === "AbortError";
      const reason = timedOut
        ? "the request timed out after 2 minutes"
        : `I couldn't reach the backend at \`${API_URL}\``;
      setSessionId("demo");
      setView("chat");
      setMessages([
        {
          role: "assistant",
          content: `**Demo mode.** ${reason}, so this is running without a live document — replies here are simulated. Check that your FastAPI server is running and finished starting up, then start a new workspace to try again.`,
        },
      ]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadInChat = async (newFile) => {
    if (!newFile) return;
    if (newFile.type !== "application/pdf") {
      alert("Please select a PDF file.");
      return;
    }
    if (sessionId === "demo") {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: `📎 Uploaded **${newFile.name}**` },
        {
          role: "assistant",
          content: "This workspace is running in demo mode (no backend connected), so I can't actually add new documents right now.",
        },
      ]);
      return;
    }

    setIsTyping(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `📎 Uploaded **${newFile.name}**` },
    ]);

    const formData = new FormData();
    formData.append("file", newFile);
    if (sessionId) formData.append("session_id", sessionId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setSessionId(data.session_id);
      setFile(newFile);
      setAttachedFiles((prev) => (prev.includes(newFile.name) ? prev : [...prev, newFile.name]));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Added **${newFile.name}** to this workspace. I can now answer questions across all ${attachedFiles.length + 1} documents here.`,
        },
      ]);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(error);
      const timedOut = error.name === "AbortError";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: timedOut
            ? "**Upload timed out.** The backend took too long to respond — check that it's still running and try again."
            : `**Connection error.** ${error.message || "Is the backend running?"}`,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Remove a single file's chunks from the current session.
  const deleteFile = async (name) => {
    if (!sessionId || deletingFile) return;

    if (sessionId === "demo") {
      setAttachedFiles((prev) => prev.filter((f) => f !== name));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Removed **${name}** from this demo workspace (no backend connected, so nothing was actually deleted server-side).`,
        },
      ]);
      return;
    }

    setDeletingFile(name);
    try {
      const res = await fetch(
        `${API_URL}/session/${sessionId}/files?filename=${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete file");

      const remaining = attachedFiles.filter((f) => f !== name);
      setAttachedFiles(remaining);
      if (file?.name === name) setFile(null);

      if (remaining.length === 0) {
        resetToUpload();
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Removed **${name}** from this workspace. I'll now answer using the remaining ${remaining.length} document${remaining.length > 1 ? "s" : ""}.`,
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `**Couldn't remove ${name}.** ${error.message || "Is the backend running?"}`,
        },
      ]);
    } finally {
      setDeletingFile(null);
    }
  };

  // Sends a message and streams the assistant's reply token-by-token as it
  // arrives from the backend's StreamingResponse (plain text chunks, not
  // SSE/JSON). A placeholder assistant message is inserted immediately and
  // its content is updated as each chunk is decoded, with <scratchpad>
  // content filtered out live.
  const sendMessage = async (e, explicitText) => {
    e?.preventDefault();
    const userMessage = (explicitText ?? input).trim();
    if (!userMessage || !sessionId || isTyping) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);

    if (sessionId === "demo") {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `This is a simulated reply since no backend is connected yet. In demo mode I can't actually read **${file?.name || "your document"}** — connect the backend at \`${API_URL}\` to get real, document-grounded answers.`,
          },
        ]);
        setIsTyping(false);
      }, 700);
      return;
    }

    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 180000);

    // Insert a placeholder assistant message that gets filled in as chunks
    // stream in. `assistantIndex` is captured synchronously from the updater.
    let assistantIndex = -1;
    let streamActive = true;
    setMessages((prev) => {
      assistantIndex = prev.length;
      return [...prev, { role: "assistant", content: "", streaming: true }];
    });

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ session_id: sessionId, message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // The backend failed before it started streaming (e.g. retrieval
        // error) — this path still returns a normal JSON error body.
        let detail = "The assistant could not answer.";
        try {
          const data = await res.json();
          detail = data.detail || detail;
        } catch {
          // Response wasn't JSON — keep the generic message.
        }
        if (detail === "high_traffic") throw new Error("HIGH_TRAFFIC");
        throw new Error(detail);
      }

      if (!res.body) throw new Error("Streaming isn't supported in this browser.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rawBuffer = "";
      let receivedAny = false;
      let displayedText = "";
      let pendingText = "";
      let revealChain = Promise.resolve();

      const revealPendingText = () => {
        revealChain = revealChain.then(async () => {
          while (streamActive && displayedText.length < pendingText.length) {
            const nextSpace = pendingText.indexOf(" ", displayedText.length + 1);
            const end = nextSpace === -1 ? pendingText.length : nextSpace + 1;
            displayedText = pendingText.slice(0, end);
            setMessages((prev) => {
              const next = [...prev];
              if (next[assistantIndex]) {
                next[assistantIndex] = { role: "assistant", content: displayedText, streaming: true };
              }
              return next;
            });
            await new Promise((resolve) => setTimeout(resolve, 28));
          }
        });
        return revealChain;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // We're actively receiving data, so the "hung connection" timeout
        // no longer applies — reset it so a slow-but-alive stream isn't
        // killed mid-answer.
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), 180000);
        receivedAny = true;

        rawBuffer += decoder.decode(value, { stream: true });
        pendingText = stripScratchpad(getStreamText(rawBuffer)).trimStart();
        revealPendingText();
      }

      rawBuffer += decoder.decode();
      const finalText = stripScratchpad(getStreamText(rawBuffer, true)).trim();
      pendingText = finalText;
      await revealPendingText();
      setMessages((prev) => {
        const next = [...prev];
        if (next[assistantIndex]) {
          next[assistantIndex] = {
            role: "assistant",
            content: finalText || (receivedAny ? "" : "I couldn't generate an answer for that."),
            streaming: false,
          };
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      const timedOut = error.name === "AbortError";
      const highTraffic = error.message === "HIGH_TRAFFIC";
      const errorText = timedOut
        ? "**No response after 3 minutes.** The backend received the request but never replied — check its terminal for a hang or an unhandled exception (e.g. stuck on the embedding query or the Gemini call)."
        : highTraffic
        ? "**High demand right now.** Gemini is getting a lot of traffic at the moment — wait a few seconds and try sending that again."
        : `**Connection error.** ${error.message || "Is the backend running?"}`;

      setMessages((prev) => {
        const next = [...prev];
        // If the placeholder never received any text, replace it in place
        // rather than leaving an empty bubble plus a separate error bubble.
        if (assistantIndex !== -1 && next[assistantIndex]?.role === "assistant" && next[assistantIndex]?.streaming) {
          next[assistantIndex] = { role: "assistant", content: errorText, streaming: false };
          return next;
        }
        return [...next, { role: "assistant", content: errorText, streaming: false }];
      });
    } finally {
      streamActive = false;
      clearTimeout(timeoutId);
      setIsTyping(false);
    }
  };

  const resetToUpload = () => {
    setView("upload");
    setFile(null);
    setAttachedFiles([]);
    setSessionId(null);
    setMessages([]);
    setInput("");
  };

  const copyMessage = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  };

  const formatInline = (text) => {
    const parts = String(text).split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <mark
            key={i}
            className="rounded-[3px] px-1 py-0.5 font-bold"
            style={{ backgroundColor: MARKER, color: INK }}
          >
            {part.slice(2, -2)}
          </mark>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="mono rounded-md border px-1.5 py-0.5 text-[0.85em]"
            style={{ borderColor: `${INK}22`, backgroundColor: PAPER_DIM, color: TEAL }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const renderText = (text) => {
    const blocks = String(text).split("\n");
    return blocks.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-3" />;
      if (trimmed.startsWith("```")) return null;

      if (/^#{1,3}\s/.test(trimmed)) {
        return (
          <h3
            key={i}
            className="mt-5 mb-2 text-lg font-extrabold"
            style={{ color: INK }}
          >
            {trimmed.replace(/^#{1,3}\s/, "")}
          </h3>
        );
      }

      if (/^[-*]\s/.test(trimmed)) {
        return (
          <div key={i} className="flex gap-3 my-1.5">
            <span className="mt-2.5 h-1 w-3 shrink-0 rounded-full" style={{ backgroundColor: CORAL }} />
            <span>{formatInline(trimmed.replace(/^[-*]\s/, ""))}</span>
          </div>
        );
      }

      if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^\d+\./)?.[0].replace(".", "");
        return (
          <div key={i} className="flex gap-3 my-2 items-start">
            <span
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{ backgroundColor: INK, color: PAPER }}
            >
              {num}
            </span>
            <span>{formatInline(trimmed.replace(/^\d+\.\s/, ""))}</span>
          </div>
        );
      }

      return (
        <p key={i} className="my-1.5">
          {formatInline(line)}
        </p>
      );
    });
  };

  if (view === "upload") {
    return (
      <div
        className="relative min-h-screen overflow-y-auto ruled"
        style={{ backgroundColor: PAPER, color: INK }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <FontLoader />

        <div
          style={{
            position: "absolute",
            left: "20px",
            top: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 10,
          }}
        >
          <Logomark size={40} style={{ borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "0.02em", lineHeight: 1.2 }}>Learn with AI</div>
            <div style={{ color: `${INK}66`, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.24em", lineHeight: 1.3 }}>
              Study any document
            </div>
          </div>
        </div>

        <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-5 py-24">
          <div className="w-full max-w-2xl text-center">
            <div
              style={{
                marginLeft: "auto",
                marginRight: "auto",
                marginBottom: "40px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "999px",
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: `${TEAL}14`,
                color: TEAL,
              }}
            >
              <span style={{ height: "6px", width: "6px", borderRadius: "999px", backgroundColor: TEAL, flexShrink: 0 }} />
              Private, per-document workspace
            </div>

            <h1 className="text-balance text-5xl font-black tracking-[-0.03em] sm:text-6xl">
              Read less.
              <span className="block mt-1">
                Understand <span className="highlight-word">more.</span>
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-7 sm:text-lg" style={{ color: `${INK}99` }}>
              Drop in a PDF and get a workspace that already knows it — ask questions,
              build study notes, or take a quiz, all grounded in your own document.
            </p>

            <div
              style={{
                marginLeft: "auto",
                marginRight: "auto",
                marginTop: "48px",
                maxWidth: "420px",
                width: "100%",
                borderRadius: "32px",
                border: `2px solid ${dragActive ? MARKER : `${INK}1f`}`,
                padding: "12px",
                backgroundColor: "#ffffffb0",
                boxShadow: dragActive ? "0 0 0 6px rgba(244,197,66,0.35)" : "none",
                boxSizing: "border-box",
                transition: "all 0.15s ease",
              }}
            >
              {!file ? (
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    minHeight: "288px",
                    width: "100%",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    borderRadius: "26px",
                    border: `2px dashed ${INK}30`,
                    padding: "40px 32px",
                  }}
                >
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileSelect} />

                  <div style={{ marginBottom: "24px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "64px",
                        height: "64px",
                        borderRadius: "20px",
                        backgroundColor: MARKER,
                        boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                      }}
                    >
                      <Upload className="h-7 w-7" style={{ color: INK }} />
                    </div>
                  </div>

                  <div style={{ fontSize: "18px", fontWeight: 800 }}>Drop your PDF here</div>
                  <div style={{ marginTop: "4px", fontSize: "14px", color: `${INK}80` }}>
                    or click to browse your computer
                  </div>

                  <div
                    style={{
                      marginTop: "32px",
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      color: `${INK}55`,
                    }}
                  >
                    <span>PDF</span>
                    <span style={{ height: "4px", width: "4px", borderRadius: "999px", backgroundColor: `${INK}40` }} />
                    <span>Q&amp;A</span>
                    <span style={{ height: "4px", width: "4px", borderRadius: "999px", backgroundColor: `${INK}40` }} />
                    <span>Study mode</span>
                  </div>
                </label>
              ) : (
                <div style={{ borderRadius: "26px", padding: "28px", backgroundColor: PAPER_DIM, boxSizing: "border-box" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", textAlign: "left" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "48px",
                        height: "48px",
                        flexShrink: 0,
                        borderRadius: "12px",
                        backgroundColor: MARKER,
                      }}
                    >
                      <FileText className="h-5 w-5" style={{ color: INK }} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                      <div style={{ marginTop: "6px", fontSize: "12px", color: `${INK}80` }}>{fileSize} · PDF</div>
                    </div>

                    <button
                      onClick={() => setFile(null)}
                      className="focus-visible:outline focus-visible:outline-2"
                      style={{ borderRadius: "8px", padding: "8px", color: `${INK}80`, outlineColor: TEAL, background: "none", border: "none", cursor: "pointer" }}
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={startChat}
                    disabled={isUploading}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      marginTop: "28px",
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      borderRadius: "12px",
                      padding: "16px 20px",
                      fontSize: "14px",
                      fontWeight: 800,
                      backgroundColor: INK,
                      color: PAPER,
                      outlineColor: TEAL,
                      border: "none",
                      cursor: isUploading ? "not-allowed" : "pointer",
                      opacity: isUploading ? 0.6 : 1,
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {uploadSeconds < 6
                          ? "Reading document..."
                          : uploadSeconds < 20
                          ? "Still working — indexing your document..."
                          : "This can take a minute the first time..."}
                      </>
                    ) : (
                      <>
                        Enter workspace
                        <ArrowUp className="h-4 w-4 rotate-45" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: "28px",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {["Ask anything", "Exam prep", "Deep explanations", "Fast summaries"].map((item) => (
                <span
                  key={item}
                  style={{
                    borderRadius: "999px",
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    lineHeight: 1.4,
                    backgroundColor: "#ffffffa0",
                    color: `${INK}90`,
                    border: `1px solid ${INK}14`,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 flex w-max -translate-x-1/2 flex-col items-center gap-2 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: `${INK}40` }}>
            Built for focused learning
          </span>
          <Credit variant="light" />
        </div>
      </div>
    );
  }

  const sidebarBody = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "60px", padding: "0 16px", borderBottom: `1px solid ${INK}14` }}>
        <Logomark size={30} style={{ borderRadius: "9px" }} />
        <span style={{ fontSize: "14px", fontWeight: 800, flex: 1 }}>Learn with AI</span>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden focus-visible:outline focus-visible:outline-2"
          aria-label="Close sidebar"
          style={{ borderRadius: "8px", padding: "6px", color: `${INK}80`, outlineColor: TEAL, background: "none", border: "none", cursor: "pointer" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div style={{ padding: "12px" }}>
        <button
          onClick={() => {
            resetToUpload();
            setSidebarOpen(false);
          }}
          className="focus-visible:outline focus-visible:outline-2"
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: "10px",
            borderRadius: "10px",
            border: `1px solid ${INK}1f`,
            backgroundColor: "#ffffff",
            padding: "10px 12px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            outlineColor: TEAL,
          }}
        >
          <MessageSquarePlus style={{ width: "16px", height: "16px", color: TEAL, flexShrink: 0 }} />
          New chat
          <Plus style={{ width: "16px", height: "16px", color: `${INK}40`, marginLeft: "auto", flexShrink: 0 }} />
        </button>
      </div>

      <div style={{ padding: "0 12px", overflowY: "auto", flex: 1, minHeight: 0 }}>
        <div style={{ padding: "4px 8px 6px", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: `${INK}55` }}>
          {attachedFiles.length > 1 ? `${attachedFiles.length} Documents` : "Document"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {(attachedFiles.length ? attachedFiles : [file?.name || "Current document"]).map((name) => {
            const isDeleting = deletingFile === name;
            return (
              <div
                key={name}
                className="file-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  borderRadius: "10px",
                  padding: "10px 8px 10px 12px",
                  fontSize: "13px",
                  fontWeight: 600,
                  backgroundColor: MARKER_SOFT,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                <FileText style={{ width: "16px", height: "16px", color: TEAL, flexShrink: 0 }} />
                <span
                  title={name}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}
                >
                  {name}
                </span>
                <button
                  onClick={() => setConfirmDeleteName(name)}
                  disabled={isDeleting}
                  className="file-delete-btn focus-visible:outline focus-visible:outline-2"
                  title={`Remove ${name}`}
                  aria-label={`Remove ${name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    border: "none",
                    background: "none",
                    color: CORAL,
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    outlineColor: TEAL,
                  }}
                >
                  {isDeleting ? (
                    <Loader2 style={{ width: "13px", height: "13px" }} className="animate-spin" />
                  ) : (
                    <Trash2 style={{ width: "13px", height: "13px" }} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${INK}14`, padding: "14px 16px", fontSize: "11px", color: `${INK}70` }}>
        Answers are grounded in your uploaded document.
      </div>
    </>
  );

  const lastMessage = messages[messages.length - 1];
  const hasStreamingMessage = messages.some((message) => message.role === "assistant" && message.streaming);
  const showTypingDots = isTyping && !hasStreamingMessage && lastMessage?.role !== "assistant";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: PAPER, color: INK }}>
      <FontLoader />

      <ConfirmDeleteModal
        name={confirmDeleteName}
        onCancel={() => setConfirmDeleteName(null)}
        onConfirm={() => {
          const name = confirmDeleteName;
          setConfirmDeleteName(null);
          deleteFile(name);
        }}
      />

      <aside
        className="hidden lg:flex"
        style={{
          width: "260px",
          flexShrink: 0,
          flexDirection: "column",
          borderRight: `1px solid ${INK}14`,
          backgroundColor: PAPER_DIM,
        }}
      >
        {sidebarBody}
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(32,41,58,0.45)" }}
            aria-hidden="true"
          />
          <aside
            style={{
              position: "relative",
              width: "min(80vw, 300px)",
              display: "flex",
              flexDirection: "column",
              backgroundColor: PAPER_DIM,
              boxShadow: "4px 0 24px rgba(0,0,0,0.2)",
            }}
          >
            {sidebarBody}
          </aside>
        </div>
      )}

      <main style={{ position: "relative", display: "flex", minWidth: 0, flex: 1, flexDirection: "column" }}>
        <div
          className="lg:hidden"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            height: "52px",
            flexShrink: 0,
            padding: "0 12px",
            borderBottom: `1px solid ${INK}14`,
            backgroundColor: PAPER,
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="focus-visible:outline focus-visible:outline-2"
            aria-label="Open documents"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "8px", border: `1px solid ${INK}1f`, background: "#ffffff", color: INK, cursor: "pointer", outlineColor: TEAL }}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span style={{ fontSize: "13px", fontWeight: 700, color: `${INK}b0`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {attachedFiles.length > 1 ? `${attachedFiles.length} documents` : attachedFiles[0] || "Document"}
          </span>
        </div>
        <section style={{ flex: 1, overflowY: "auto" }} className="scrollbar-quiet">
          <div style={{ margin: "0 auto", width: "100%", maxWidth: "720px", padding: "40px 16px 180px" }}>
            {messages.length === 1 && messages[0].role === "assistant" && (
              <div style={{ marginBottom: "36px" }}>
                <div style={{ marginBottom: "24px", fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                  What do you want to <span className="highlight-word">learn?</span>
                </div>

                <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt.title}
                      onClick={() => sendMessage(null, prompt.text)}
                      className="focus-visible:outline focus-visible:outline-2"
                      style={{
                        textAlign: "left",
                        borderRadius: "12px",
                        border: `1px solid ${INK}1a`,
                        backgroundColor: "#ffffff",
                        padding: "14px 16px",
                        cursor: "pointer",
                        outlineColor: TEAL,
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 700 }}>{prompt.title}</div>
                      <div style={{ marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: `${INK}80` }}>{prompt.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              {messages.map((msg, idx) => (
                <div key={idx} className="group" style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "28px",
                      height: "28px",
                      flexShrink: 0,
                      borderRadius: "8px",
                      backgroundColor: msg.role === "user" ? TEAL : INK,
                      color: msg.role === "user" ? PAPER : MARKER,
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {msg.role === "user" ? "You" : <Sparkles style={{ width: "14px", height: "14px" }} />}
                  </div>

                  <div style={{ minWidth: 0, flex: 1, paddingTop: "3px" }}>
                    <div style={{ fontSize: "15px", lineHeight: 1.7, color: `${INK}e6` }}>
                      {msg.role === "user" ? msg.content : renderText(msg.content)}
                      {msg.role === "assistant" && msg.streaming && <span className="stream-cursor" />}
                    </div>

                    {msg.role === "assistant" && !msg.streaming && (
                      <div
                        className="opacity-0 group-hover:opacity-100"
                        style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "2px", transition: "opacity 0.15s ease" }}
                      >
                        <button
                          onClick={() => copyMessage(msg.content, idx)}
                          className="focus-visible:outline focus-visible:outline-2"
                          style={{ borderRadius: "6px", padding: "6px", color: `${INK}55`, outlineColor: TEAL, background: "none", border: "none", cursor: "pointer" }}
                          title="Copy"
                        >
                          {copiedIndex === idx ? <Check style={{ width: "14px", height: "14px", color: TEAL }} /> : <Copy style={{ width: "14px", height: "14px" }} />}
                        </button>
                        {idx === messages.length - 1 && (
                          <button
                            onClick={() => sendMessage(null, "Please regenerate your last answer with a clearer explanation.")}
                            className="focus-visible:outline focus-visible:outline-2"
                            style={{ borderRadius: "6px", padding: "6px", color: `${INK}55`, outlineColor: TEAL, background: "none", border: "none", cursor: "pointer" }}
                            title="Regenerate"
                          >
                            <RotateCcw style={{ width: "14px", height: "14px" }} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {showTypingDots && (
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "28px",
                      height: "28px",
                      flexShrink: 0,
                      borderRadius: "8px",
                      backgroundColor: INK,
                    }}
                  >
                    <Sparkles style={{ width: "14px", height: "14px", color: MARKER }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", paddingTop: "9px" }}>
                    <span className="animate-bounce" style={{ height: "6px", width: "6px", borderRadius: "999px", backgroundColor: `${INK}40`, animationDelay: "-0.2s" }} />
                    <span className="animate-bounce" style={{ height: "6px", width: "6px", borderRadius: "999px", backgroundColor: `${INK}40`, animationDelay: "-0.1s" }} />
                    <span className="animate-bounce" style={{ height: "6px", width: "6px", borderRadius: "999px", backgroundColor: `${INK}40` }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </section>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0 16px 20px",
            background: `linear-gradient(to top, ${PAPER} 55%, transparent)`,
            paddingTop: "60px",
            pointerEvents: "none",
          }}
        >
          <div style={{ margin: "0 auto", maxWidth: "720px", pointerEvents: "auto" }}>
            <form
              onSubmit={sendMessage}
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "6px",
                borderRadius: "26px",
                border: `1px solid ${INK}1f`,
                backgroundColor: "#ffffff",
                padding: "8px 8px 8px 8px",
                boxShadow: "0 8px 30px rgba(32,41,58,0.12)",
              }}
            >
              <label
                title="Upload a PDF"
                style={{
                  display: "flex",
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  color: `${INK}55`,
                  cursor: "pointer",
                }}
              >
                <Paperclip style={{ width: "16px", height: "16px" }} />
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0];
                    if (nextFile) uploadInChat(nextFile);
                    e.target.value = "";
                  }}
                />
              </label>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                rows={1}
                placeholder="Message Learn with AI..."
                disabled={isTyping}
                style={{
                  flex: 1,
                  resize: "none",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  maxHeight: "140px",
                  minHeight: "24px",
                  padding: "8px 0",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  color: INK,
                  opacity: isTyping ? 0.5 : 1,
                }}
              />

              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  display: "flex",
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: input.trim() && !isTyping ? "pointer" : "default",
                  backgroundColor: input.trim() && !isTyping ? INK : `${INK}14`,
                  color: input.trim() && !isTyping ? MARKER : `${INK}40`,
                  outlineColor: TEAL,
                }}
                aria-label="Send message"
              >
                {isTyping ? <Loader2 style={{ width: "16px", height: "16px" }} className="animate-spin" /> : <ArrowUp style={{ width: "16px", height: "16px" }} />}
              </button>
            </form>
            <div style={{ marginTop: "10px", textAlign: "center", fontSize: "11px", color: `${INK}55` }}>
              Learn with AI can make mistakes. Check important info.
            </div>
            <div style={{ marginTop: "6px" }}>
              <Credit variant="dim" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}