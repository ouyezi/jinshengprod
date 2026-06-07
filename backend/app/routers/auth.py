from fastapi import APIRouter, Depends

from app.auth import authenticate_admin, create_access_token, require_admin
from app.response import fail, ok
from app.schemas import LoginRequest, TokenResponse

router = APIRouter()


@router.post("/login")
def login(body: LoginRequest):
    if not authenticate_admin(body.username, body.password):
        return fail("用户名或密码错误", status_code=401)
    token = create_access_token()
    return ok(TokenResponse(access_token=token).model_dump())


@router.get("/me")
def me(admin: str = Depends(require_admin)):
    return ok({"username": admin, "role": "admin"})
