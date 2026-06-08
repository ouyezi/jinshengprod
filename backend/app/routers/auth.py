from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import authenticate_admin, change_password, create_access_token, require_admin
from app.database import get_db
from app.response import fail, ok
from app.schemas import ChangePasswordRequest, LoginRequest, TokenResponse

router = APIRouter()


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    account = authenticate_admin(db, body.username, body.password)
    if account is None:
        return fail("用户名或密码错误", status_code=401)
    token = create_access_token(account.username)
    return ok(TokenResponse(access_token=token).model_dump())


@router.get("/me")
def me(admin: str = Depends(require_admin)):
    return ok({"username": admin, "role": "admin"})


@router.post("/change-password")
def update_password(
    body: ChangePasswordRequest,
    admin: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not change_password(db, admin, body.old_password, body.new_password):
        return fail("旧密码错误", status_code=400)
    return ok(message="密码修改成功")
