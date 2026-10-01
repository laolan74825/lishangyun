"""数据库连接故障 → 503 的全局异常处理验证。"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

from app.database import get_db
from app.main import app


@pytest.fixture()
def failing_db_client():
    """把 get_db 依赖替换为抛出指定异常的版本，测试后恢复原覆盖。

    注意：conftest 在导入期设置的全局 get_db 覆盖必须原样恢复，
    不能用 clear()——否则会波及同进程中后续运行的所有测试文件。
    """
    original_override = app.dependency_overrides.get(get_db)

    def _make(exc: BaseException) -> TestClient:
        async def _gen():
            raise exc
            yield  # pragma: no cover - 让 FastAPI 把它识别为依赖生成器

        app.dependency_overrides[get_db] = _gen
        # raise_server_exceptions=False 才能拿到处理器生成的 500 响应而非重新抛出
        return TestClient(app, raise_server_exceptions=False)

    yield _make
    if original_override is not None:
        app.dependency_overrides[get_db] = original_override
    else:
        app.dependency_overrides.pop(get_db, None)


class Test数据库连接故障返回503:
    def test_operational_error_返回503和明确提示(self, failing_db_client):
        exc = OperationalError("SELECT 1", {}, Exception("connection refused"))
        client = failing_db_client(exc)
        r = client.get("/api/auth/status")
        assert r.status_code == 503
        assert "数据库连接失败" in r.json()["detail"]

    def test_interface_error_返回503(self, failing_db_client):
        exc = InterfaceError("SELECT 1", {}, Exception("pool checkout failed"))
        client = failing_db_client(exc)
        r = client.get("/api/auth/status")
        assert r.status_code == 503
        assert "数据库连接失败" in r.json()["detail"]

    def test_connection_invalidated的dbapi_error_返回503(self, failing_db_client):
        exc = DBAPIError(
            "SELECT 1", {}, Exception("connection lost"),
            connection_invalidated=True,
        )
        client = failing_db_client(exc)
        r = client.get("/api/auth/status")
        assert r.status_code == 503

    def test普通dbapi_error_不当作连接故障(self, failing_db_client):
        exc = DBAPIError("SELECT bad", {}, Exception("syntax error"))
        client = failing_db_client(exc)
        r = client.get("/api/auth/status")
        assert r.status_code == 500
        assert r.json()["detail"] == "服务器内部错误，请稍后重试"

    def test其他异常_返回500中性提示(self, failing_db_client):
        client = failing_db_client(RuntimeError("unexpected bug"))
        r = client.get("/api/auth/status")
        assert r.status_code == 500
        assert r.json()["detail"] == "服务器内部错误，请稍后重试"
        assert "unexpected bug" not in r.text  # 内部信息不外泄

    def test底层socket错误_返回503(self, failing_db_client):
        """db 容器停止时主机名无法解析，原始 socket.gaierror 会直接到达。"""
        import socket
        client = failing_db_client(socket.gaierror(-2, "Name or service not known"))
        r = client.get("/api/auth/status")
        assert r.status_code == 503
        assert "数据库连接失败" in r.json()["detail"]
