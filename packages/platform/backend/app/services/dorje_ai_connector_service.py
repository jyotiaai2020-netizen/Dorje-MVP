import json

from langchain_ollama import ChatOllama

from app.core.config import settings
from app.services.ollama_client import ollama_client_options
from app.schemas.dorje_ai_connectors import (
    EmailDraftRequest,
    MediaDraftRequest,
    SocialDraftRequest,
)


class DorjeAIConnectorService:
    def __init__(self) -> None:
        self.llm = ChatOllama(
            model=settings.OLLAMA_CHAT_MODEL,
            **ollama_client_options(),
            reasoning=False,
            temperature=0.3,
            num_predict=700,
            keep_alive=settings.OLLAMA_KEEP_ALIVE,
        )

    def email_draft(self, request: EmailDraftRequest) -> dict[str, str]:
        prompt = f"""Draft an email as valid JSON with exactly two string fields: subject and body.
Tone: {request.tone}
Recipient: {request.recipient or 'Not specified'}
Goal: {request.goal}
Context: {request.context[:6000] or 'None'}
Do not claim the email was sent. Return JSON only."""
        fallback = {
            "subject": f"Follow-up: {request.goal[:70]}",
            "body": f"Hello,\n\n{request.goal}\n\nBest regards,\nLotus & Dorje",
        }
        return self._json_response(prompt, fallback)

    def social_draft(self, request: SocialDraftRequest) -> dict:
        prompt = f"""Create a {request.platform} post as valid JSON with fields post (string)
and hashtags (array of short strings without #).
Objective: {request.objective}
Audience: {request.audience}
Tone: {request.tone}
Key points: {request.key_points}
CTA: {request.cta}
Context: {request.context[:5000]}
Do not claim it was published. Return JSON only."""
        fallback = {
            "post": f"{request.objective}\n\n{request.key_points}\n\n{request.cta}".strip(),
            "hashtags": ["AI", "DataStrategy", "DigitalTransformation"],
        }
        result = self._json_response(prompt, fallback)
        hashtags = result.get("hashtags", fallback["hashtags"])
        result["hashtags"] = hashtags if isinstance(hashtags, list) else fallback["hashtags"]
        return result

    def media_draft(self, kind: str, request: MediaDraftRequest) -> str:
        instructions = {
            "image-prompt": "Write one detailed image-generation prompt plus concise alt text.",
            "carousel": "Create an 8-slide carousel outline with a hook, slide copy, and final CTA.",
            "video-script": "Create a 60-second video script with scenes, voiceover, and on-screen text.",
            "captions": "Create 5 caption options with CTA and a compact hashtag pack.",
        }
        prompt = f"""{instructions[kind]}
Platform: {request.platform}
Audience: {request.audience}
Objective: {request.objective}
Context: {request.context[:6000] or 'None'}
Be concise. This is copy only; never claim media was generated or published."""
        try:
            response = self.llm.invoke(prompt)
            return str(response.content)
        except Exception:
            return f"{instructions[kind]}\n\nObjective: {request.objective}\nAudience: {request.audience or 'General audience'}"

    def _json_response(self, prompt: str, fallback: dict) -> dict:
        try:
            response = self.llm.invoke(prompt)
            content = str(response.content).strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0]
            parsed = json.loads(content)
            return parsed if isinstance(parsed, dict) else fallback
        except Exception:
            return fallback
