import re

from app.orchestration.models import ExecutionPlan, Intent, ValidationResult
from app.schemas.dorje_ai import UploadedFileReference


class ResponseValidator:
    def validate(self, content: str, plan: ExecutionPlan, files: list[UploadedFileReference], source: str = "") -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []
        clean = content.strip()
        if len(clean) < 20:
            errors.append("response is empty or incomplete")
        if clean and clean[-1] not in ".!?)]}`":
            warnings.append("response may end mid-sentence")
        if files and re.search(r"\b(cannot|can't|unable to) (access|read|see).{0,30}\b(file|attachment|document)\b", clean, re.IGNORECASE):
            errors.append("response incorrectly claims supplied files are unavailable")
        if plan.intent == Intent.STATISTICS:
            source_numbers = self._numbers(f"{source} " + " ".join(item.content for item in files))
            response_numbers = self._numbers(clean)
            if source_numbers and not response_numbers.intersection(source_numbers):
                errors.append("statistics response does not reference source values")
            if source_numbers:
                invented = {number for number in response_numbers - source_numbers if abs(float(number)) > 1}
                if len(invented) > max(4, len(source_numbers)):
                    warnings.append("response contains many values not found in the source dataset")
        return ValidationResult(valid=not errors, errors=errors, warnings=warnings)

    @staticmethod
    def _numbers(content: str) -> set[str]:
        return set(re.findall(r"-?\d+(?:\.\d+)?", content))
