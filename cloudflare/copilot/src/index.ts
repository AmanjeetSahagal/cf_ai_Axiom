export interface Env {
  COPILOT_SESSION: DurableObjectNamespace;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  CORS_ORIGIN?: string;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

function json(data: unknown, init: ResponseInit = {}, origin = "*") {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders(origin),
      ...(init.headers || {}),
    },
  });
}

function systemPrompt() {
  return [
    "You are Axiom Copilot, an evaluation assistant for LLM products.",
    "Help the user evaluate prompts, model outputs, and regressions.",
    "When useful, structure your answer into:",
    "1. What looks good",
    "2. Risks or failure modes",
    "3. Suggested next evaluation step",
    "Keep answers concise, concrete, and product-oriented.",
  ].join("\n");
}

async function runWorkersAI(env: Env, messages: Array<{ role: string; content: string }>) {
  if (!env.AI) {
    return null;
  }
  const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
    max_tokens: 700,
  });
  if (response && typeof response === "object" && "response" in response && typeof response.response === "string") {
    return response.response;
  }
  return null;
}

async function runOpenAI(env: Env, messages: Array<{ role: string; content: string }>) {
  if (!env.OPENAI_API_KEY) {
    return null;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }
  const data = await response.json<{
    choices?: Array<{ message?: { content?: string } }>;
  }>();
  return data.choices?.[0]?.message?.content ?? null;
}

async function runGemini(env: Env, messages: Array<{ role: string; content: string }>) {
  if (!env.GEMINI_API_KEY) {
    return null;
  }
  const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const transcript = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt()}\n\nConversation so far:\n${transcript}\n\nLatest user request:\n${latestUser}`,
              },
            ],
          },
        ],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }
  const data = await response.json<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }>();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || null;
}

async function generateReply(env: Env, history: ChatMessage[]) {
  const messages = [
    { role: "system", content: systemPrompt() },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];

  const workersAiReply = await runWorkersAI(env, messages);
  if (workersAiReply) {
    return workersAiReply;
  }

  const openAiReply = await runOpenAI(env, messages);
  if (openAiReply) {
    return openAiReply;
  }

  const geminiReply = await runGemini(env, messages);
  if (geminiReply) {
    return geminiReply;
  }

  const latestPrompt = history[history.length - 1]?.content ?? "";
  return [
    "Axiom Copilot is running without its Workers AI binding or an external provider secret.",
    "The default model path is Llama 3.3 on Workers AI, with external providers only as fallback.",
    "",
    "Your latest request was:",
    latestPrompt,
    "",
    "Suggested next step:",
    "Attach the `AI` binding in Wrangler or add an external provider secret, then paste a prompt, model output, and expected answer.",
  ].join("\n");
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = env.CORS_ORIGIN || "*";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/session" && request.method === "POST") {
      const id = env.COPILOT_SESSION.newUniqueId();
      return json({ sessionId: id.toString() }, {}, origin);
    }

    const match = url.pathname.match(/^\/api\/session\/([^/]+)(\/chat)?$/);
    if (!match) {
      return json({ error: "Not found" }, { status: 404 }, origin);
    }

    const sessionId = match[1];
    const session = env.COPILOT_SESSION.get(env.COPILOT_SESSION.idFromString(sessionId));
    return session.fetch(request);
  },
};

export class CopilotSession {
  constructor(readonly ctx: DurableObjectState, readonly env: Env) {}

  async fetch(request: Request) {
    const origin = this.env.CORS_ORIGIN || "*";
    const url = new URL(request.url);
    const path = url.pathname;
    const messages = ((await this.ctx.storage.get<ChatMessage[]>("messages")) || []).slice(-30);

    if (request.method === "GET" && /\/api\/session\/[^/]+$/.test(path)) {
      return json({ messages }, {}, origin);
    }

    if (request.method === "DELETE" && /\/api\/session\/[^/]+$/.test(path)) {
      await this.ctx.storage.put("messages", []);
      return json({ ok: true }, {}, origin);
    }

    if (request.method === "POST" && /\/api\/session\/[^/]+\/chat$/.test(path)) {
      const body = await request.json<{ message?: string }>();
      const message = body.message?.trim();
      if (!message) {
        return json({ error: "Message is required" }, { status: 400 }, origin);
      }

      const nextMessages = [
        ...messages,
        { role: "user", content: message, createdAt: new Date().toISOString() } as ChatMessage,
      ];
      const reply = await generateReply(this.env, nextMessages);
      const updatedMessages = [
        ...nextMessages,
        { role: "assistant", content: reply, createdAt: new Date().toISOString() } as ChatMessage,
      ];
      await this.ctx.storage.put("messages", updatedMessages);
      return json({ messages: updatedMessages }, {}, origin);
    }

    return json({ error: "Not found" }, { status: 404 }, origin);
  }
}
