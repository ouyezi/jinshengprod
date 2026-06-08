from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AdminAccount

security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def authenticate_admin(db: Session, username: str, password: str) -> Optional[AdminAccount]:
    account = db.query(AdminAccount).filter(AdminAccount.username == username).first()
    if account is None:
        return None
    if not _verify_password(password, account.password_hash):
        return None
    return account


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": username, "role": "admin", "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def change_password(db: Session, username: str, old: str, new: str) -> bool:
    account = authenticate_admin(db, username, old)
    if account is None:
        return False
    account.password_hash = _hash_password(new)
    account.updated_at = datetime.utcnow()
    db.add(account)
    db.commit()
    return True


def require_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access only")
        return payload.get("sub", "")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired token") from exc
