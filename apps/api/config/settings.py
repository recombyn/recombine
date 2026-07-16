from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:3000"]
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

    # Phase 3: S3-compatible object storage
    s3_enabled: bool = False
    s3_endpoint_url: str | None = None
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "resume-scene"
    s3_region: str = "us-east-1"
    s3_public_base_url: str | None = None
    s3_addressing_style: str = "virtual"

    # Phase 5: table cells + SAM/LaMa models
    expand_table_cells: bool = True
    sam_checkpoint: str | None = None
    sam_model_type: str = "vit_t"
    sam_min_area_ratio: float = 0.02
    sam_max_regions: int = 8
    lama_use_sam_mask: bool = True

    # LLM — domestic OpenAI-compatible (Doubao / DeepSeek / Qwen / Moonshot)
    llm_provider: str = "doubao"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_default_model: str = "doubao-seed-1-6-251015"
    image_default_model: str = ""
    # Optional per-provider keys (used when LLM_API_KEY is empty)
    doubao_api_key: str = ""
    deepseek_api_key: str = ""
    qwen_api_key: str = ""
    moonshot_api_key: str = ""

    # Google ID-token login (GIS) — same Client ID on web + API
    google_client_id: str = ""


settings = Settings()
