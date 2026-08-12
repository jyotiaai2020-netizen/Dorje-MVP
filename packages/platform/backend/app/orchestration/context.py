import re

from app.schemas.dorje_ai import ChatMessage, UploadedFileReference


class ContextManager:
    def history(self, messages: list[ChatMessage], limit: int = 6) -> str:
        return "\n".join(f"{item.role}: {item.content[:1600]}" for item in messages[-limit:]) or "None"

    def files(self, query: str, files: list[UploadedFileReference], limit: int = 5) -> list[UploadedFileReference]:
        terms = {term for term in re.findall(r"[a-z0-9]{3,}", query.lower()) if term not in {"the", "and", "this", "that", "with"}}
        ranked = sorted(files, key=lambda item: (not any(term in f"{item.name} {item.content[:3000]}".lower() for term in terms), item.name))
        return ranked[:limit]

    def file_text(self, query: str, files: list[UploadedFileReference]) -> str:
        sections: list[str] = []
        remaining = 30_000
        for item in self.files(query, files):
            if item.type.startswith("image/") or item.type == "video/mp4":
                sections.append(f"VISUAL FILE: {item.name} (observations supplied separately)")
                continue
            excerpt = item.content[: min(12_000, remaining)].strip()
            if excerpt:
                sections.append(f"FILE: {item.name}\n---\n{excerpt}\n---")
                remaining -= len(excerpt)
            if remaining <= 0:
                break
        return "\n\n".join(sections) or "None"
