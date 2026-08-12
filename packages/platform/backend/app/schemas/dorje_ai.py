from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class UploadedFileReference(BaseModel):
    name: str
    type: str
    content: str = ""
    stored_name: str | None = None
    source_label: str = "Uploaded from this device"


class ChartExportAsset(BaseModel):
    chart_id: str
    title: str
    image_data_url: str
    dataset: "StructuredTable | None" = None
    validation_status: str = "unknown"
    source_row_count: int = 0
    source_columns: List[str] = Field(default_factory=list)
    exact_source_rows: List[List[str]] = Field(default_factory=list)


class DorjeChatRequest(BaseModel):
    message: str
    conversation_id: str = "default"
    model: str | None = None
    mode: str = "Fast Chat"
    context: str = ""
    history: List[ChatMessage] = Field(default_factory=list)
    files: List[UploadedFileReference] = Field(default_factory=list)
    image_preferences: List[str] = Field(default_factory=list)
    image_model: str = "tiny-sd"
    image_width: int = Field(default=512, ge=256, le=1024)
    image_height: int = Field(default=512, ge=256, le=1024)
    chart_assets: List[ChartExportAsset] = Field(default_factory=list)


class DorjeChatResponse(BaseModel):
    reply: str


class DorjeReportResponse(BaseModel):
    report: str


class DorjeImagePromptResponse(BaseModel):
    prompt: str


class TableConversionRequest(BaseModel):
    content: str = Field(min_length=1, max_length=50_000)


class StructuredTable(BaseModel):
    title: str = "DorjeAI Data"
    columns: List[str]
    rows: List[List[str]]
    explanation: str = ""
    model_used: str = "DorjeAI"
    dataset_id: Optional[str] = None
    source_columns: List[str] = Field(default_factory=list)
    aggregation_method: str = "none"
    filters_applied: List[str] = Field(default_factory=list)
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    source_message_id: Optional[str] = None
    source_file_id: Optional[str] = None
    validation_status: str = "pending"
    locked: bool = False


class AnalyticsRequest(BaseModel):
    message: str = Field(min_length=1, max_length=50_000)
    conversation_id: str = "default"
    source_message_id: str = ""
    files: List[UploadedFileReference] = Field(default_factory=list)
    dataset: StructuredTable | None = None


class ChartAsset(BaseModel):
    chart_id: str
    title: str
    chart_type: str
    dataset_id: str
    source_label: str
    source_message_id: str = ""
    x_axis_field: str
    y_axis_fields: List[str]
    grouping_field: str = ""
    aggregation_method: str = "none"
    statistical_method: str = "descriptive"
    generated_at: str
    model_used: str = "Deterministic analytics engine"
    library_used: str = "SciPy + Pillow + SVG"
    image_data_url: str
    png_url: str
    svg_url: str
    csv_url: str
    metadata_url: str
    interpretation: str = ""
    validation_status: str = "passed"
    source_row_count: int
    source_columns: List[str]
    exact_source_rows: List[List[str]]
    source_data_hash: str


class AnalyticsResponse(BaseModel):
    dataset: StructuredTable
    chart: ChartAsset
    statistics: dict = Field(default_factory=dict)
    validation: dict = Field(default_factory=dict)
