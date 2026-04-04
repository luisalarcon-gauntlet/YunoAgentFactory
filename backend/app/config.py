from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str  # Required — must be set via DATABASE_URL env var
    openclaw_ws_url: str = "ws://openclaw:18789"
    openclaw_auth_token: str = ""
    openclaw_workspace_path: str = "/openclaw-workspace"

    model_config = {"env_file": ".env"}


settings = Settings()
