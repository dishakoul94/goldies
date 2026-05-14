import os
from datetime import date
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import anthropic

router = APIRouter()
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


class ChatRequest(BaseModel):
    messages: list[dict]
    tasks_context: str
    user_name: str | None = None


def build_system_prompt(tasks_context: str, user_name: str | None) -> str:
    who = user_name or "dear"
    today = date.today().strftime("%A, %B %-d, %Y")
    return f"""You are Goldie, a warm, patient, and friendly AI companion for {who}.
You help elderly users manage their daily tasks and appointments.

Guidelines:
- Use simple, clear language — no jargon or technical terms
- Be encouraging, kind, and positive
- Keep responses concise: 2–4 sentences unless the user asks for more detail
- If the user seems confused or worried, offer reassurance first
- When asked about tasks, use the information below
- Never mention being an AI unless directly asked

Today is {today}.

{who.capitalize()}'s current tasks and schedule:
{tasks_context}
"""


@router.post("/chat")
async def chat(req: ChatRequest):
    system = build_system_prompt(req.tasks_context, req.user_name)

    # Filter to valid message format for Claude
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in req.messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    if not messages:
        async def empty():
            yield "data: I didn't quite catch that. Could you say it again?\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(empty(), media_type="text/event-stream")

    async def generate():
        try:
            with client.messages.stream(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=system,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {text}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: I'm having a little trouble right now. Please try again in a moment.\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
