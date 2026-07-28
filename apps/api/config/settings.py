from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    libreoffice_path: str = "soffice"
    upload_dir: str = "storage/uploads"
    result_dir: str = "storage/results"
    max_upload_mb: int = 20

    # Phase 1: Celery + Redis + preprocess
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    poppler_path: str | None = None
    import_dpi: int = 200
    job_ttl_seconds: int = 86400

    # Phase 2: vision / OCR
    use_vision: bool = True
    ocr_lang: str = "ch"
    scene_target_width: int = 794
    palette_k: int = 5
    enable_sam: bool = False
    enable_lama: bool = False

    # Phase 3: S3-compatible object storage (Tencent COS / Aliyun OSS / MinIO)
    s3_enabled: bool = False
    s3_endpoint_url: str | None = None
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "resume-scene"
    s3_region: str = "ap-guangzhou"
    s3_public_base_url: str | None = None
    s3_addressing_style: str = "virtual"
    # PutObject ACL=public-read so returned URLs work in <img src>.
    s3_acl_public_read: bool = True

    # LighthouseDB (MySQL) — when empty, uses local SQLite at SQLITE_DB_PATH
    # Example: mysql://root:PASSWORD@10.0.0.5:3306/recombyn
    database_url: str = ""
    sqlite_db_path: str = "storage/recombyn.db"
    # LangGraph short-term memory checkpointer (official BaseCheckpointSaver).
    # Empty → reuse DATABASE_URL (MySQL) via langgraph-checkpoint-mysql;
    # local/dev without MySQL → SqliteSaver at this path; last resort InMemorySaver.
    langgraph_checkpoint_url: str = ""
    langgraph_checkpoint_sqlite_path: str = "storage/langgraph_checkpoints.db"
    # LangGraph long-term memory Store (docs). Empty → same MySQL as DATABASE_URL;
    # else Sqlite at this path; last resort InMemoryStore.
    langgraph_store_url: str = ""
    langgraph_store_sqlite_path: str = "storage/langgraph_store.db"
    # LangChain SummarizationMiddleware (short-term memory docs).
    agent_summarize_enabled: bool = True
    agent_summarize_trigger_tokens: int = 4000
    agent_summarize_keep_messages: int = 20
    # Empty → LLM_DEFAULT_MODEL (cheaper than the main agent model when possible).
    agent_summarize_model: str = ""

    # Phase 5: table cells + SAM/LaMa models
    expand_table_cells: bool = True
    sam_checkpoint: str | None = None
    sam_model_type: str = "vit_t"
    sam_min_area_ratio: float = 0.02
    sam_max_regions: int = 8
    lama_use_sam_mask: bool = True

    # LLM — OpenAI-compatible (Doubao / DeepSeek / OpenRouter / …)
    llm_provider: str = "deepseek"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_default_model: str = "deepseek-reasoner"
    image_default_model: str = ""
    # Optional per-provider keys (preferred over LLM_API_KEY when set)
    doubao_api_key: str = ""
    deepseek_api_key: str = ""
    openrouter_api_key: str = ""
    qwen_api_key: str = ""
    moonshot_api_key: str = ""
    # Optional OpenRouter attribution headers (https://openrouter.ai/docs)
    openrouter_http_referer: str = ""
    openrouter_app_title: str = "recombyn"
    # Doubao Ark chat: model name or inference endpoint id (ep-xxxx).
    # Leave empty to hide that Doubao entry from the catalog.
    doubao_seed_model: str = ""
    doubao_pro_model: str = ""

    # Google OAuth — Client ID on web + API; secret only for popup auth-code exchange
    google_client_id: str = ""
    google_client_secret: str = ""

    # Token wallet — card-key redeem (no WeChat/Alipay membership)
    # HMAC-SHA256(plaintext, CARD_KEY_SALT); never store plaintext in DB.
    # Must be a strong random string (len>=24); do not use the .env.example placeholder.
    card_key_salt: str = ""
    # Dedicated password required when generating card keys in admin (not login password).
    card_key_ops_password: str = ""
    # Purchase channel: Xianyu shop link and/or author contact (WeChat/email).
    xianyu_shop_url: str = ""
    author_contact: str = ""
    # Hover QR images (URL or site path). Defaults to /qr/*.png in web public.
    xianyu_qr_url: str = "/qr/xianyu.png"
    wechat_qr_url: str = "/qr/wechat.png"

    # Tencent Cloud SES — email registration verification
    tencent_secret_id: str = ""
    tencent_secret_key: str = ""
    ses_region: str = "ap-hongkong"
    ses_from_email: str = ""
    ses_from_name: str = "recombyn"
    # Template ID from SES console (required for most accounts). Template var: {{code}}
    ses_template_id: int = 0

settings = Settings()
