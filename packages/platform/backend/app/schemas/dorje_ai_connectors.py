from pydantic import BaseModel, EmailStr, Field


class ConnectorResponse(BaseModel):
    provider: str
    name: str
    status: str = "not_connected"
    account_email: str | None = None
    scopes: list[str] = Field(default_factory=list)
    connected_at: str | None = None


class PlaceholderConnectionResponse(BaseModel):
    provider: str
    status: str
    message: str


class GmailSendRequest(BaseModel):
    to: list[EmailStr] = Field(min_length=1, max_length=20)
    cc: list[EmailStr] = Field(default_factory=list, max_length=20)
    bcc: list[EmailStr] = Field(default_factory=list, max_length=20)
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1, max_length=100_000)
    html: bool = True
    attachments: list["EmailAttachment"] = Field(default_factory=list, max_length=10)


class EmailAttachment(BaseModel):
    filename: str = Field(min_length=1, max_length=180)
    content_type: str = Field(default="application/octet-stream", max_length=160)
    data_base64: str = Field(min_length=1)


class GmailSendResponse(BaseModel):
    success: bool
    message_id: str | None = None
    account_email: str


class EmailMessageListItem(BaseModel):
    provider: str = "gmail"
    message_id: str
    thread_id: str | None = None
    subject: str = ""
    sender: str = ""
    recipients: list[str] = Field(default_factory=list)
    received_at: str | None = None
    snippet: str = ""
    has_attachments: bool = False


class EmailAttachmentContent(BaseModel):
    attachment_id: str
    filename: str
    content_type: str = "application/octet-stream"
    size: int = 0
    text_preview: str = ""
    data_base64: str | None = None


class EmailMessageDetail(EmailMessageListItem):
    body_text: str = ""
    body_html: str = ""
    attachments: list[EmailAttachmentContent] = Field(default_factory=list)


class EmailSummaryResponse(BaseModel):
    provider: str
    message_id: str
    subject: str
    sender: str
    summary: str
    attachment_summaries: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


class EmailDocumentRequest(BaseModel):
    provider: str = Field(default="google-docs", max_length=80)
    title: str = Field(default="DorjeAI Email Summary", max_length=180)
    body: str = Field(min_length=1, max_length=200_000)
    mode: str = Field(default="create", pattern="^(create|rewrite|append)$")
    document_id: str | None = Field(default=None, max_length=180)


class EmailDocumentResponse(BaseModel):
    provider: str
    document_id: str
    title: str
    web_view_link: str = ""
    account_email: str | None = None
    attachment: EmailAttachment | None = None


class EmailReplyRequest(BaseModel):
    message_id: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1, max_length=100_000)
    subject: str | None = Field(default=None, max_length=998)
    attachments: list[EmailAttachment] = Field(default_factory=list, max_length=10)
    include_original_sender: bool = True


class EmailDraftRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=5000)
    tone: str = Field(default="Professional", max_length=100)
    recipient: str = Field(default="", max_length=500)
    context: str = Field(default="", max_length=20_000)


class EmailDraftResponse(BaseModel):
    subject: str
    body: str


class SocialDraftRequest(BaseModel):
    platform: str = Field(min_length=1, max_length=100)
    objective: str = Field(min_length=1, max_length=3000)
    audience: str = Field(default="", max_length=1000)
    tone: str = Field(default="Professional", max_length=100)
    key_points: str = Field(default="", max_length=5000)
    cta: str = Field(default="", max_length=1000)
    context: str = Field(default="", max_length=20_000)


class SocialDraftResponse(BaseModel):
    post: str
    hashtags: list[str]


class MediaDraftRequest(BaseModel):
    objective: str = Field(min_length=1, max_length=5000)
    audience: str = Field(default="", max_length=1000)
    platform: str = Field(default="LinkedIn", max_length=100)
    context: str = Field(default="", max_length=20_000)


class MediaDraftResponse(BaseModel):
    content: str


class WordDocumentRequest(BaseModel):
    filename: str = Field(default="dorje-ai-document.docx", max_length=180)
    title: str = Field(default="Dorje AI Document", max_length=300)
    body: str = Field(min_length=1, max_length=100_000)
    mode: str = Field(default="create", pattern="^(create|rewrite|append)$")
    document_id: str | None = Field(default=None, max_length=120)


class WordDocumentResponse(BaseModel):
    document_id: str
    filename: str
    content_type: str
    data_base64: str
    size: int
    text_preview: str
