"""全局异常处理：让故障原因对用户透明。

- 数据库连接层故障（服务未启动、网络中断、连接失效）→ 503 + 明确中文提示，
  与程序内部错误区分开，前端可据此给出「数据库没启动」级别的提示；
- 其余未处理异常 → 500 + 中性提示（细节只进日志，不外泄）。
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

logger = logging.getLogger(__name__)

DATABASE_UNAVAILABLE_DETAIL = "数据库连接失败，请确认数据库服务已启动后重试"
GENERIC_SERVER_ERROR_DETAIL = "服务器内部错误，请稍后重试"


def is_db_connectivity_error(exc: BaseException) -> bool:
    """判断异常是否属于数据库连接层故障。

    asyncpg 的 PostgresConnectionError 等底层连接错误大多会被 SQLAlchemy
    包装为 OperationalError（连不上、连接丢失）；InterfaceError 涵盖连接池
    层面失效（如 pool_pre_ping 探测失败）；DBAPIError.connection_invalidated
    标记连接已失效。
    另外 db 容器停止时，主机名解析失败会以原始 OSError（如 socket.gaierror、
    ConnectionRefusedError）直接到达——这类同样属于连接层故障。
    """
    if isinstance(exc, (OperationalError, InterfaceError)):
        return True
    if isinstance(exc, DBAPIError) and exc.connection_invalidated:
        return True
    if isinstance(exc, OSError):
        return True
    return False


async def _db_unavailable_response(request: Request, exc: BaseException) -> JSONResponse:
    logger.error(
        "数据库连接失败: %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": DATABASE_UNAVAILABLE_DETAIL},
    )


async def db_error_handler(request: Request, exc: DBAPIError) -> JSONResponse:
    if is_db_connectivity_error(exc):
        return await _db_unavailable_response(request, exc)
    return await unhandled_error_handler(request, exc)


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if is_db_connectivity_error(exc):
        return await _db_unavailable_response(request, exc)
    logger.exception("未处理的异常: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": GENERIC_SERVER_ERROR_DETAIL},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """注册顺序即优先级（Starlette 按异常类 MRO 就近匹配）：
    OperationalError / InterfaceError → 503；
    其他 DBAPIError → 看 connection_invalidated 再分流；
    兜底 Exception → 500。HTTPException / RequestValidationError
    有 FastAPI 自带的更具体处理器，不受影响。
    """
    app.add_exception_handler(OperationalError, db_error_handler)
    app.add_exception_handler(InterfaceError, db_error_handler)
    app.add_exception_handler(DBAPIError, db_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
