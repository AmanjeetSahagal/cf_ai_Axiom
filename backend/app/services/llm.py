import json
import time
from time import perf_counter

import httpx

from app.core.config import settings

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_PROVIDER_RETRIES = 3
BASE_RETRY_DELAY_SECONDS = 1.0


class LLMProviderError(RuntimeError):
    pass


def _gemini_headers() -> dict[str, str]:
    if not settings.gemini_api_key:
        raise LLMProviderError("GEMINI_API_KEY is not configured")
    return {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.gemini_api_key,
    }


def _extract_text(response_json: dict) -> str:
    candidates = response_json.get("candidates", [])
    if not candidates:
        raise LLMProviderError(f"Gemini returned no candidates: {response_json}")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(texts).strip()


def _usage_tokens(response_json: dict) -> tuple[int, int]:
    usage = response_json.get("usageMetadata", {})
    return int(usage.get("promptTokenCount", 0)), int(usage.get("candidatesTokenCount", 0))


def _post_with_retries(path: str, payload: dict) -> dict:
    last_error: Exception | None = None
    for attempt in range(MAX_PROVIDER_RETRIES + 1):
        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{GEMINI_API_BASE}/{path}",
                    headers=_gemini_headers(),
                    json=payload,
                )
            if response.status_code < 400:
                return response.json()
            if response.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_PROVIDER_RETRIES:
                time.sleep(BASE_RETRY_DELAY_SECONDS * (2**attempt))
                continue
            raise LLMProviderError(f"Gemini request failed: {response.text}")
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_error = exc
            if attempt < MAX_PROVIDER_RETRIES:
                time.sleep(BASE_RETRY_DELAY_SECONDS * (2**attempt))
                continue
            raise LLMProviderError(f"Gemini request failed after retries: {exc}") from exc

    raise LLMProviderError(f"Gemini request failed after retries: {last_error}")


def call_model(system_prompt: str, user_prompt: str, model: str) -> tuple[str, int, int, int]:
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
    }
    start = perf_counter()
    response_json = _post_with_retries(f"models/{model}:generateContent", payload)
    text = _extract_text(response_json)
    prompt_tokens, output_tokens = _usage_tokens(response_json)
    latency_ms = int((perf_counter() - start) * 1000)
    return text, latency_ms, prompt_tokens, output_tokens


def embed_text(text: str) -> list[float]:
    payload = {"content": {"parts": [{"text": text}]}}
    response_json = _post_with_retries(
        f"models/{settings.gemini_embedding_model}:embedContent",
        payload,
    )
    return response_json.get("embedding", {}).get("values", [])


def judge_response(prompt: str, output: str, expected: str | None, model: str) -> tuple[dict, int, int]:
    rubric = (
        "You are an LLM evaluator. Return strict JSON only with keys "
        'score, hallucination, reason. score must be an integer 1-5. '
        "hallucination must be true or false. reason must be concise."
    )
    payload = {
        "system_instruction": {"parts": [{"text": rubric}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Prompt:\n{prompt}\n\n"
                            f"Model output:\n{output}\n\n"
                            f"Expected output:\n{expected or 'None provided'}\n\n"
                            "Evaluate correctness, groundedness, and hallucination risk."
                        )
                    }
                ],
            }
        ],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    start = perf_counter()
    response_json = _post_with_retries(f"models/{model}:generateContent", payload)
    prompt_tokens, output_tokens = _usage_tokens(response_json)
    latency_ms = int((perf_counter() - start) * 1000)
    _ = latency_ms
    return json.loads(_extract_text(response_json)), prompt_tokens, output_tokens
