import json
import os
from datetime import date
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import anthropic

router = APIRouter()
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

TASK_TOOLS = [
    {
        "name": "create_external_task",
        "description": (
            "Create a calendar appointment or external event for the user. "
            "Use when the user mentions a specific date and time for an appointment, "
            "doctor visit, meeting, or any scheduled event. "
            "Only call this if the user clearly intends to schedule something new."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short title, e.g. 'Doctor appointment'"},
                "dateTime": {
                    "type": "string",
                    "description": "ISO-8601 datetime string, e.g. '2025-05-16T14:00:00'. Resolve relative terms like 'Friday' using today's date from the system prompt.",
                },
                "earlyReminderDays": {
                    "type": "integer",
                    "description": "Days before to send early reminder. Default 1.",
                    "default": 1,
                },
                "dayOfReminder": {
                    "type": "boolean",
                    "description": "Send reminder on the morning of the appointment. Default true.",
                    "default": True,
                },
                "notes": {"type": "string", "description": "Optional notes the user mentioned."},
            },
            "required": ["title", "dateTime"],
        },
    },
    {
        "name": "create_internal_task",
        "description": (
            "Create a to-do or recurring reminder. Use when the user wants to be reminded "
            "to do something on a specific date or recurring schedule. "
            "Do NOT use for time-specific appointments — use create_external_task instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short title, e.g. 'Take blood pressure medication'"},
                "nextDueDate": {"type": "string", "description": "First due date in YYYY-MM-DD format."},
                "intervalDays": {
                    "type": "integer",
                    "description": "Repeat interval in days. 0 = one-time, 1 = daily, 7 = weekly.",
                    "default": 0,
                },
                "notes": {"type": "string"},
            },
            "required": ["title", "nextDueDate"],
        },
    },
    {
        "name": "create_interday_task",
        "description": (
            "Create a daily routine task with no fixed calendar date (e.g. morning walk, evening stretches). "
            "Use when the user wants a recurring daily habit tied to a time of day."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "group": {
                    "type": "string",
                    "enum": ["morning", "afternoon", "evening", "none"],
                    "default": "none",
                },
                "canDefer": {"type": "boolean", "default": True},
                "activeDays": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 0, "maximum": 6},
                    "description": "0=Sun…6=Sat. Empty = every day.",
                },
                "timeSlot": {
                    "type": "string",
                    "description": "24h time string 'HH:MM', only if user gave a specific time.",
                },
                "notes": {"type": "string"},
            },
            "required": ["title", "group"],
        },
    },
    {
        "name": "delete_task",
        "description": (
            "Delete (remove) an existing task or appointment. "
            "Use when the user wants to cancel, remove, or delete something from their schedule. "
            "Match the title exactly as it appears in their tasks list."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the task to delete, as shown in the user's schedule.",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "edit_external_task",
        "description": (
            "Edit an existing calendar appointment or external event. "
            "Use when the user wants to reschedule, rename, or change details of an existing appointment. "
            "Only provide fields that should change — omit fields that stay the same."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Current title of the task to edit, as shown in the schedule."},
                "newTitle": {"type": "string", "description": "New title if the user is renaming it."},
                "newDateTime": {
                    "type": "string",
                    "description": "New ISO-8601 datetime if rescheduling, e.g. '2025-06-10T10:00:00'.",
                },
                "newEarlyReminderDays": {"type": "integer"},
                "newDayOfReminder": {"type": "boolean"},
                "newNotes": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "edit_internal_task",
        "description": (
            "Edit an existing to-do or recurring reminder. "
            "Use when the user wants to push the due date, rename it, or change its recurrence. "
            "Only provide fields that should change."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Current title of the task to edit."},
                "newTitle": {"type": "string"},
                "newNextDueDate": {"type": "string", "description": "New due date in YYYY-MM-DD format."},
                "newIntervalDays": {"type": "integer", "description": "New repeat interval. 0 = one-time, 7 = weekly."},
                "newNotes": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "edit_interday_task",
        "description": (
            "Edit an existing daily routine task. "
            "Use when the user wants to change the time, group, or active days of a daily habit. "
            "Only provide fields that should change."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Current title of the task to edit."},
                "newTitle": {"type": "string"},
                "newGroup": {"type": "string", "enum": ["morning", "afternoon", "evening", "none"]},
                "newCanDefer": {"type": "boolean"},
                "newActiveDays": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 0, "maximum": 6},
                    "description": "0=Sun…6=Sat. Empty = every day.",
                },
                "newTimeSlot": {"type": "string", "description": "24h time 'HH:MM'."},
                "newNotes": {"type": "string"},
            },
            "required": ["title"],
        },
    },
]


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
            tool_use_block = None
            tool_input_buffer = ""
            task_action = None

            with client.messages.stream(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=system,
                messages=messages,
                tools=TASK_TOOLS,
                tool_choice={"type": "auto"},
            ) as stream:
                for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            tool_use_block = {"name": event.content_block.name}
                            tool_input_buffer = ""

                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            yield f"data: {event.delta.text}\n\n"
                        elif event.delta.type == "input_json_delta":
                            tool_input_buffer += event.delta.partial_json

                    elif event.type == "content_block_stop":
                        if tool_use_block is not None:
                            try:
                                tool_input = json.loads(tool_input_buffer)
                            except json.JSONDecodeError:
                                tool_input = {}
                            tool_name = tool_use_block["name"]
                            task_action = {"tool": tool_name, "input": tool_input}
                            payload = json.dumps(task_action)
                            if tool_name == "delete_task":
                                sse_event = "task_delete"
                            elif tool_name.startswith("edit_"):
                                sse_event = "task_edit"
                            else:
                                sse_event = "task_create"
                            yield f"event: {sse_event}\ndata: {payload}\n\n"
                            tool_use_block = None
                            tool_input_buffer = ""

            if task_action is not None:
                tool_name = task_action["tool"]
                title = task_action["input"].get("title", "your task")
                if tool_name == "delete_task":
                    yield f'data: Done! I\'ve removed "{title}" from your schedule.\n\n'
                elif tool_name.startswith("edit_"):
                    display = task_action["input"].get("newTitle") or title
                    yield f'data: Done! I\'ve updated "{display}" for you.\n\n'
                else:
                    yield f'data: Done! I\'ve added "{title}" to your schedule.\n\n'

            yield "data: [DONE]\n\n"
        except Exception:
            yield "data: I'm having a little trouble right now. Please try again in a moment.\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
