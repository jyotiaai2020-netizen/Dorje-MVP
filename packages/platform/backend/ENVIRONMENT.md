# Environment variables

## Local development

1. Copy `backend/.env.example` to `backend/.env`.
2. Replace `SECRET_KEY` with a long random value. One option is:

   ```bash
   openssl rand -hex 32
   ```

3. Keep the default SQLite URL for local testing:

   ```env
   DATABASE_URL=sqlite:///./lotus.db
   ```

4. Copy `frontend/.env.example` to `frontend/.env.local` and set the browser-visible API URL:

   ```env
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
   ```

Restart both development servers after changing environment files. Values prefixed
with `NEXT_PUBLIC_` are included in browser code and must never contain secrets.

Apply database migrations before starting the API:

```bash
cd backend
alembic upgrade head
```

The repository's existing `lotus.db` predates Alembic but already contains the
baseline schema. Preserve it by running `alembic stamp 20260701_0001` once. New
databases should always use `alembic upgrade head`.

## Cloud deployment with PostgreSQL

Set these values in the hosting provider's secret/environment settings rather than
committing a production `.env` file:

```env
DATABASE_URL=postgresql+psycopg://lotus_user:password@database-host:5432/lotus
SECRET_KEY=a-long-random-production-secret
APP_ENV=production
APP_DEBUG=false
FRONTEND_URL=https://app.example.com
ACCESS_TOKEN_EXPIRE_MINUTES=60
OLLAMA_BASE_URL=https://your-ollama-service.example.com
OLLAMA_CHAT_MODEL=qwen3:8b
OLLAMA_FAST_MODEL=qwen3:8b
OLLAMA_DEEP_MODEL=qwen3:8b
OLLAMA_FAST_NUM_CTX=4096
OLLAMA_FAST_NUM_PREDICT=512
OLLAMA_FAST_THINKING=false
OLLAMA_DEEP_NUM_CTX=8192
OLLAMA_DEEP_NUM_PREDICT=3072
OLLAMA_DEEP_THINKING=true
OLLAMA_REPORT_MODEL=qwen3:8b
OLLAMA_KEEP_ALIVE=15m
```

Set the frontend deployment variable separately:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

The existing requirements include the Psycopg PostgreSQL driver. For production,
use a managed PostgreSQL instance, require TLS according to the provider's
connection instructions, and run schema migrations instead of relying on automatic
table creation.

## Ollama models and streaming

Install both workload-specific models before starting the API:

```bash
ollama pull qwen3:8b
```

Kamal uses a concise Qwen path for application assistance. DorjeAI Workspace
uses separate Fast Chat and Deep Analysis profiles: Fast Chat is optimized for
low-latency responses, while Deep Analysis uses `OLLAMA_DEEP_MODEL`, a larger
context window, and `OLLAMA_DEEP_THINKING=true` when supported by the installed
Ollama/LangChain stack. Fast Chat uses a bounded 512-token output profile by default. Deep Analysis uses
a larger 3,072-token output profile by default. Context budgets still protect
input size. Reports use the report model profile. Startup warms the chat model without blocking API startup. Verify
model availability with:

```bash
curl http://127.0.0.1:8000/api/v1/health/ai
```

## Optional local image generation

DorjeAI uses `segmind/SSD-1B` for optional local text-to-image generation. It is a
distilled 1.3-billion-parameter SDXL-family model under Apache-2.0. The pipeline is
loaded only when Generate Image is first used, at which point Hugging Face downloads
the model weights into its local cache. Expect a multi-gigabyte first download.

The required libraries are included in `requirements.txt`. To install only this
optional stack into an existing environment:

```bash
pip install "pypdf>=6,<7" "diffusers>=0.36,<1" "accelerate>=1,<2" \
  "transformers==4.57.1" "huggingface-hub==0.36.2"
```

Configure resolution and inference cost with:

```env
IMAGE_MODEL_ID=segmind/SSD-1B
IMAGE_TEST_MODEL_ID=segmind/tiny-sd
IMAGE_SIZE=512
IMAGE_INFERENCE_STEPS=8
WHISPER_MODEL=tiny
MAX_AUDIO_UPLOAD_MB=25
MAX_UPLOAD_MB=10
```

### Local voice and lightweight image testing

DorjeAI supports local microphone transcription through OpenAI Whisper Tiny and a
sub-3 GB image option through `segmind/tiny-sd`. The frontend image selector can
switch between Tiny-SD and the existing SSD-1B pipeline. Generated prompts are
enhanced before either image model receives them.

```bash
pip install -U openai-whisper
python -c "import whisper; whisper.load_model('tiny')"
python -c "from huggingface_hub import snapshot_download; snapshot_download('segmind/tiny-sd')"
```

FLUX.1-schnell is intentionally not installed in this setup: no complete FLUX.1
runtime, including its transformer, text encoders, and VAE, fits the 3 GB model
storage limit.

## Gmail OAuth connector

Create one Google Cloud Web OAuth client for Dorje AI, enable the Gmail API, and
register this local callback exactly:

```text
http://localhost:3000/api/oauth/google/callback
```

Get the client ID and secret from Google Cloud Console:

1. Create or select the shared DorjeAI Google Cloud project.
2. Open **APIs & Services → Library** and enable **Gmail API**.
3. Configure **Google Auth Platform → Branding/Audience/Data Access** with the
   application name, support address, privacy policy, and the Gmail send/compose scopes.
4. Open **Clients**, create an **OAuth client ID**, and choose **Web application**.
5. Add the callback above under **Authorized redirect URIs**.
6. Copy the generated client ID and client secret into the server environment below.

This is one global application credential shared by the deployment. End users do not
provide client IDs, client secrets, or Google passwords. Each registered DorjeAI user
clicks **Connect Gmail**, signs in on Google, and grants a separate per-user authorization.
The resulting tokens are encrypted and associated with that DorjeAI user and tenant.
While the Google consent screen is in Testing mode, add permitted Google accounts as
test users. Public availability may require Google verification for Gmail scopes.

Configure server-only values in `backend/.env`:

```env
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-web-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
TOKEN_ENCRYPTION_KEY=your-fernet-key
```

Generate the encryption key once and keep it in the deployment secret manager:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Do not rotate this key without first re-encrypting stored connector tokens. Apply
the connector schema with `alembic upgrade head`. Gmail requests send/compose,
read-only or modify access, calendar events, Drive read, and identity scopes needed
to display the connected address and support confirmed inbox-summary and attachment
reply workflows. Access and refresh tokens are encrypted in `user_connectors`;
OAuth state is single-use and expires after ten minutes. No OAuth credential is
returned to the frontend.

Apple Silicon uses MPS, NVIDIA systems use CUDA, and other systems fall back to CPU.
CPU image generation will be substantially slower. Generated images should not be
treated as factual depictions, and the model has known limitations with faces and
legible text.
