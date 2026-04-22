"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type CopilotConversation = {
  sessionId: string;
  title: string;
  updatedAt: string;
};

const CONVERSATIONS_STORAGE_KEY = "axiom-copilot-conversations";
const ACTIVE_SESSION_STORAGE_KEY = "axiom-copilot-active-session";

const starterPrompts = [
  "Evaluate this model output for hallucination risk: Prompt: Summarize the refund policy. Output: We offer 60-day refunds with no questions asked. Expected: Refunds are available within 30 days of purchase.",
  "I changed my support prompt. What 5 regression tests should I add before shipping?",
  "Compare these two outputs and tell me which one is safer to ship for a customer support bot.",
];

function getCopilotApiBase() {
  return process.env.NEXT_PUBLIC_COPILOT_API_URL || "";
}

function formatConversationTime(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function conversationTitle(messages: CopilotMessage[], fallback = "New chat") {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) {
    return fallback;
  }

  return firstUserMessage.length > 44 ? `${firstUserMessage.slice(0, 44)}...` : firstUserMessage;
}

function normalizeConversations(conversations: CopilotConversation[]) {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function readStoredConversations() {
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CopilotConversation[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeConversations(parsed.filter((item) => item?.sessionId));
  } catch {
    return [];
  }
}

function writeStoredConversations(conversations: CopilotConversation[]) {
  window.localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(normalizeConversations(conversations)));
}

export function CopilotClient() {
  const [conversations, setConversations] = useState<CopilotConversation[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Connecting to copilot...");
  const [isSending, setIsSending] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const apiBase = useMemo(() => getCopilotApiBase().replace(/\/$/, ""), []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!apiBase) {
        setStatus("Set NEXT_PUBLIC_COPILOT_API_URL to your Cloudflare Worker URL to use Copilot.");
        return;
      }

      try {
        const storedConversations = readStoredConversations();
        const activeStoredSession = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (!cancelled) {
          setConversations(storedConversations);
        }

        let activeSession =
          activeStoredSession && storedConversations.some((conversation) => conversation.sessionId === activeStoredSession)
            ? activeStoredSession
            : storedConversations[0]?.sessionId ?? null;

        if (!activeSession) {
          const response = await fetch(`${apiBase}/api/session`, { method: "POST" });
          const data = (await response.json()) as { sessionId: string };
          activeSession = data.sessionId;
          const now = new Date().toISOString();
          const nextConversations = normalizeConversations([
            {
              sessionId: activeSession,
              title: "New chat",
              updatedAt: now,
            },
            ...storedConversations,
          ]);
          writeStoredConversations(nextConversations);
          window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSession);
          if (!cancelled) {
            setConversations(nextConversations);
          }
        }

        const response = await fetch(`${apiBase}/api/session/${activeSession}`);
        const data = (await response.json()) as { messages: CopilotMessage[] };
        if (!cancelled) {
          setSessionId(activeSession);
          setMessages(data.messages || []);
          setStatus("");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to connect to Copilot");
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  function persistConversation(session: string, nextMessages: CopilotMessage[], fallbackTitle = "New chat") {
    const nextConversation: CopilotConversation = {
      sessionId: session,
      title: conversationTitle(nextMessages, fallbackTitle),
      updatedAt: nextMessages.at(-1)?.createdAt || new Date().toISOString(),
    };

    const nextConversations = normalizeConversations([
      nextConversation,
      ...conversations.filter((conversation) => conversation.sessionId !== session),
    ]);
    setConversations(nextConversations);
    writeStoredConversations(nextConversations);
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session);
  }

  async function loadConversation(targetSessionId: string) {
    if (!apiBase) {
      return;
    }

    setStatus("Loading conversation...");
    try {
      const response = await fetch(`${apiBase}/api/session/${targetSessionId}`);
      const data = (await response.json()) as { messages: CopilotMessage[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load conversation");
      }
      setSessionId(targetSessionId);
      setMessages(data.messages || []);
      setStatus("");
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, targetSessionId);
      if (!data.messages?.length) {
        persistConversation(targetSessionId, [], "New chat");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load conversation");
    }
  }

  async function createConversation() {
    if (!apiBase || isCreatingConversation) {
      return;
    }

    setIsCreatingConversation(true);
    setStatus("Starting new chat...");
    try {
      const response = await fetch(`${apiBase}/api/session`, { method: "POST" });
      const data = (await response.json()) as { sessionId: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to create conversation");
      }

      const nextSessionId = data.sessionId;
      const nextConversations = normalizeConversations([
        {
          sessionId: nextSessionId,
          title: "New chat",
          updatedAt: new Date().toISOString(),
        },
        ...conversations,
      ]);

      setConversations(nextConversations);
      writeStoredConversations(nextConversations);
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextSessionId);
      setSessionId(nextSessionId);
      setMessages([]);
      setInput("");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create conversation");
    } finally {
      setIsCreatingConversation(false);
    }
  }

  async function deleteConversation(targetSessionId: string) {
    if (!apiBase || deletingSessionId) {
      return;
    }

    setDeletingSessionId(targetSessionId);
    setStatus("Deleting chat...");

    try {
      await fetch(`${apiBase}/api/session/${targetSessionId}`, { method: "DELETE" });

      const nextConversations = conversations.filter((conversation) => conversation.sessionId !== targetSessionId);
      setConversations(nextConversations);
      writeStoredConversations(nextConversations);

      if (sessionId !== targetSessionId) {
        setStatus("");
        return;
      }

      const nextSessionId = nextConversations[0]?.sessionId ?? null;

      if (nextSessionId) {
        window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextSessionId);
        await loadConversation(nextSessionId);
      } else {
        window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        setSessionId(null);
        setMessages([]);
        setInput("");
        await createConversation();
      }

      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete conversation");
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function sendMessage(message: string) {
    if (!sessionId || !apiBase) {
      return;
    }
    setIsSending(true);
    setStatus("Thinking...");
    try {
      const response = await fetch(`${apiBase}/api/session/${sessionId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      const data = (await response.json()) as { messages: CopilotMessage[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Copilot request failed");
      }
      const nextMessages = data.messages || [];
      setMessages(nextMessages);
      persistConversation(sessionId, nextMessages);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) {
      return;
    }
    setInput("");
    await sendMessage(message);
  }

  async function resetConversation() {
    if (!sessionId || !apiBase) {
      return;
    }
    try {
      await fetch(`${apiBase}/api/session/${sessionId}`, { method: "DELETE" });
      setMessages([]);
      persistConversation(sessionId, [], "New chat");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to reset conversation");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-ember/15 bg-[#fff8f4] p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.2em] text-ember/80">Cloudflare Copilot</p>
        <h2 className="mt-3 font-display text-4xl text-ink">Chat with an evaluation copilot running on a Worker.</h2>
        <p className="mt-3 max-w-3xl text-base text-slate-600">
          Ask for hallucination checks, regression test ideas, prompt critiques, or imported-output reviews. Each chat keeps its own Durable
          Object session memory, and recent conversations stay available from the sidebar. The default inference path is Llama 3.3 on Workers AI.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-black/5 bg-white/85 p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Chats</p>
              <h3 className="mt-2 font-display text-2xl text-ink">Recent chats</h3>
            </div>
            <button type="button" className="btn-primary text-sm" onClick={() => void createConversation()} disabled={!apiBase || isCreatingConversation}>
              {isCreatingConversation ? "Starting..." : "New chat"}
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {conversations.length ? (
              conversations.map((conversation) => {
                const isActive = conversation.sessionId === sessionId;
                return (
                  <div
                    key={conversation.sessionId}
                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-ember/30 bg-[#fff5ee] shadow-sm"
                        : "border-slate-100 bg-slate-50 hover:border-ember/20 hover:bg-[#fffaf6]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void loadConversation(conversation.sessionId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className={`truncate pr-2 text-sm font-medium ${isActive ? "text-ink" : "text-slate-700"}`}>
                            {conversation.title}
                          </p>
                          <span className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {formatConversationTime(conversation.updatedAt)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-full px-2 py-1 text-sm leading-none text-slate-400 transition hover:bg-white hover:text-rose-600"
                        onClick={() => void deleteConversation(conversation.sessionId)}
                        disabled={deletingSessionId === conversation.sessionId}
                        aria-label={`Delete chat ${conversation.title}`}
                        title="Delete chat"
                      >
                        {deletingSessionId === conversation.sessionId ? "…" : "×"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                No chats yet. Start one to save it here.
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quick Starts</p>
            <div className="mt-3 space-y-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="block w-full rounded-2xl border border-transparent bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-ember/20 hover:bg-[#fff8f4]"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="rounded-[28px] border border-black/5 bg-white/85 p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Conversation</p>
              <h3 className="mt-2 font-display text-2xl text-ink">
                {conversations.find((conversation) => conversation.sessionId === sessionId)?.title || "New chat"}
              </h3>
            </div>
            <button type="button" className="btn-secondary text-sm" onClick={() => void resetConversation()} disabled={!sessionId}>
              Reset memory
            </button>
          </div>

          <div className="mt-4 min-h-[420px] space-y-3 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
            {messages.length ? (
              messages.map((message, index) => (
                <div
                  key={`${message.createdAt}-${index}`}
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${
                    message.role === "assistant"
                      ? "bg-white text-slate-700"
                      : "ml-auto bg-ember text-white"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">{message.role}</p>
                  <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
                Start with a prompt, model output, or evaluation question.
              </div>
            )}
          </div>

          <form className="mt-4 space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <textarea
              className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste a prompt, output, expected answer, or ask what to test next..."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{status || "Copilot ready."}</p>
              <button className="btn-primary" type="submit" disabled={!input.trim() || isSending || !apiBase || !sessionId}>
                {isSending ? "Thinking..." : "Send to Copilot"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
