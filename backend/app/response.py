from typing import Any
from fastapi.responses import JSONResponse


def ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 0, "data": data, "message": message}


def fail(message: str, code: int = 40001, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "data": None, "message": message})
