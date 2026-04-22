# PROMPTS

This file documents representative AI prompts used during development of Axiom and its Cloudflare Copilot.

## Product / Architecture

```text
Fastest path:

keep the frontend/product concept
move one core AI flow onto Cloudflare Workers
use Workers AI or an external LLM behind a Worker
add a chat-style interface for “evaluate my prompt/model output”
use Durable Objects or D1/KV for session memory/state
frame the app as an AI evaluation copilot
```

```text
make the copilot only be usable after login and have things like recent chats and new chats the way chatgpt does
```

```text
first lets make that landing page a bit more industry standard with a cool visual in the background and a regular scroll down frameowrk
```

## Evaluation Product Features

```text
wouldnt it make sense for people to be able to input their LLM's and get evaluations
```

```text
ok do those 5
```

Context for that request:
- extend dataset/import format to allow `model_output`
- add `imported run` creation API
- skip generation in worker for imported runs
- reuse the same evaluator pipeline
- surface run mode in UI

```text
alr do that
```

Context for that request:
- commit and push current changes
- restart backend
- improve run creation flow

## Dashboard / UX

```text
the design of the dashboard is too confusng, its hard to see what model ur looking at details for, make it more intuitive
```

```text
is it even useful to be able to see average score and latency across all models
```

```text
alright make the improvements
```

## Cloudflare Assignment Fit

```text
do that
```

Context for that request:
- make Workers AI the explicit default Copilot path
- use Llama 3.3 framing in config/docs/copy
- keep external providers only as fallback

## Notes

- Many implementation prompts were iterative UI or bug-fix requests during development.
- The entries above are the highest-signal prompts that materially shaped the Cloudflare AI app, imported-run evaluation flow, and dashboard/product architecture.
