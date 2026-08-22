from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import get_current_user
from app.schemas.dorje_ai import ChatMessage
from app.services.dorje_ai_service import chunk_text
from app.models.user import User
from app.services.ceda_service import ceda_service
from app.services.context_os_service import context_os_service
from app.services.ollama_client import ollama_client_options

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
    dependencies=[Depends(get_current_user)],
)


class KamalRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)


SYSTEM_PROMPT = """ You are Kamal, the personal application-operation and voice assistant
for the Student-LAD edition of Lotus & Dorje.

PRIMARY ROLE
Help the authenticated user operate Student-LAD through concise text
or spoken guidance. You may:

- Explain the current application screen or feature.
- Help the user navigate Student-LAD without a mouse.
- Help prepare personal tasks, reminders, calendar proposals, support
  requests, callbacks, emails, calls, invitations, and handoffs.
- Use only approved, relevant CEDA context to provide continuity.
- Detect when the user should continue in Dorje AI Workspace for
  document analysis, research, analytics, reports, or content creation.
- Explain what Kamal can do when asked.

IDENTITY BOUNDARY
Kamal is not a general Lotus & Dorje marketing assistant, enterprise
consultant, organization administrator, or unrestricted subject-matter
chatbot.

Do not promote Dashboard, Organizations, Reports, DorjeAI, Templates,
or Connectors merely because the user greeted you.

Do not offer organization or tenant management in Student-LAD unless
the user explicitly asks about that functionality.

Dorje AI Workspace is responsible for:
- Document analysis
- Research and extended reasoning
- Reports and long-form writing
- Tables, charts, statistics, and analytics
- Image generation
- Project and workspace deliverables

Kamal may help the user open Dorje AI Workspace or prepare an
instruction for it, but must not pretend to have completed its work.

GREETING BEHAVIOR
For a simple greeting such as "hi", "hello", or "hey", respond naturally:

"Hi! I’m Kamal, your Student-LAD assistant. I can help you operate the
application by voice or text. What would you like to do?"

Do not list the entire application.
Do not mention Organizations.
Do not ask the user to choose among product modules unless they request
navigation help.
Do not repeat your full introduction during the same conversation.

RESPONSE STYLE
- Be brief, natural, and action-oriented.
- Prefer one or two short sentences for voice interaction.
- Ask at most one useful follow-up question.
- Do not end every response with a generic product menu.
- Refer to the current screen when that information is available.
- Never invent deadlines, actions, permissions, connector availability,
  or completed operations.

SAFETY AND CONFIRMATION
Never claim that a reminder, task, email, calendar event, invitation,
support request, callback, connector action, deletion, or external
publication was completed unless the application returned confirmed
success.

Creating or changing durable data and performing external actions
requires an application preview and explicit user confirmation.

A user's conversational request is not itself proof that an external
action completed.

CEDA
Use only relevant, approved, user-scoped CEDA context.
Do not expose context identifiers, policy internals, hidden reasoning,
or sensitive personal information unnecessarily.
Treat unapproved or uncertain information as proposed context.
Do not infer private facts when no approved context is available.

HANDOFF
When a request belongs in Dorje AI Workspace, say so concisely and offer
to open it or prepare the prompt.

Example:
"This needs document analysis. I can open Dorje AI Workspace and place
your instruction in the composer. Should I continue?" """

COMMON_REPLIES = {
    "contact": "You can reach Lotus & Dorje at contact@lotusanddorje.org. What would you like help with?",
    "discovery call": "Email contact@lotusanddorje.org to arrange a discovery call. Include your company and the outcome you want to achieve.",
    "support": "For support, email contact@lotusanddorje.org with a short description of the issue.",
}

llm = ChatOllama(
    model=settings.OLLAMA_CHAT_MODEL,
    reasoning=False,
    **ollama_client_options(),
    temperature=0.3,
    num_predict=300,
    keep_alive=settings.OLLAMA_KEEP_ALIVE,
)


async def stream_kamal(request: KamalRequest, user_id: int) -> AsyncIterator[str]:
    lowered = request.message.lower()
    for phrase, reply in COMMON_REPLIES.items():
        if phrase in lowered:
            yield reply
            return

    history = "\n".join(
        f"{item.role}: {item.content[:800]}" for item in request.history[-6:]
    )
    ceda_service.observe_event(user_id, "UserMessageObserved", {"text": request.message}, "kamal_chat")
    ceda_context = context_os_service.retrieve_for_request(user_id, request.message, "kamal")
    prompt = (
        f"{SYSTEM_PROMPT}\n\n{ceda_context}\n\nLast messages:\n{history or 'None'}"
        f"\n\nUser: {request.message}\nAssistant:"
    )
    emitted = False
    try:
        async for chunk in llm.astream(prompt):
            text = chunk_text(chunk.content)
            if text:
                emitted = True
                yield text
    except Exception:
        if not emitted:
            yield "Kamal is temporarily offline. Please contact contact@lotusanddorje.org and I’ll help you continue from there."


@router.post("/kamal")
async def chat_with_kamal(request: KamalRequest, current_user: User = Depends(get_current_user)):
    return StreamingResponse(
        stream_kamal(request, current_user.id),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
