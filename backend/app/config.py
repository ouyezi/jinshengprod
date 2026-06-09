from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./promotion.db"
    secret_key: str = "jinsheng-promotion-secret-key-change-in-prod"
    admin_username: str = "admin"
    admin_password: str = "dongfu123"
    access_token_expire_minutes: int = 480
    submission_log_dir: str = "logs/submissions"

    class Config:
        env_file = ".env"


settings = Settings()
