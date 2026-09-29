def _create_guestbook(client, headers, name="测试礼簿"):
    return client.post("/api/guestbooks/", json={
        "name": name,
        "event_type": "wedding",
        "event_date": "2026-09-20",
    }, headers=headers)


def _create_account(client, headers, name="现金账户"):
    return client.post("/api/payment-accounts/", json={
        "name": name,
        "type": "cash",
    }, headers=headers)


def _create_code(client, headers, guestbook_id, grantee_account_id, grantee_name="张三"):
    return client.post("/api/authorization/codes", json={
        "guestbook_id": guestbook_id,
        "grantee_name": grantee_name,
        "grantee_account_id": grantee_account_id,
        "permissions": "record",
    }, headers=headers)


class TestAuthorizationCodeCRUD:
    async def test_create_code(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()

        resp = _create_code(client, admin_headers, gb_id, acct_id)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "code" in data
        assert len(data["code"]) == 16

    async def test_create_code_invalid_guestbook(self, client, admin_headers, db_session):
        acct_id = _create_account(client, admin_headers).json()

        resp = _create_code(client, admin_headers, 9999, acct_id)
        assert resp.status_code == 404

    async def test_list_codes(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()

        _create_code(client, admin_headers, gb_id, acct_id, "张三")
        _create_code(client, admin_headers, gb_id, acct_id, "李四")

        resp = client.get("/api/authorization/codes", headers=admin_headers)
        assert resp.status_code == 200
        codes = resp.json()
        assert len(codes) == 2

    async def test_list_codes_filter_by_status(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()

        _create_code(client, admin_headers, gb_id, acct_id)

        resp = client.get("/api/authorization/codes?status=active", headers=admin_headers)
        assert resp.status_code == 200
        codes = resp.json()
        assert all(c["status"] == "active" for c in codes)

    async def test_list_codes_filter_by_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        _create_code(client, admin_headers, gb_id, acct_id)

        resp = client.get(f"/api/authorization/codes?guestbook_id={gb_id}", headers=admin_headers)
        assert resp.status_code == 200
        codes = resp.json()
        assert all(c["guestbook_id"] == gb_id for c in codes)

    async def test_get_code(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        resp = client.get(f"/api/authorization/codes/{code_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == code_id

    async def test_get_code_not_found(self, client, admin_headers):
        resp = client.get("/api/authorization/codes/9999", headers=admin_headers)
        assert resp.status_code == 404


class TestAuthorizationCodeRevoke:
    async def test_revoke_code(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        resp = client.post(f"/api/authorization/codes/{code_id}/revoke", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "授权码已撤销"

        code_resp = client.get(f"/api/authorization/codes/{code_id}", headers=admin_headers)
        assert code_resp.json()["status"] == "revoked"

    async def test_revoke_already_revoked(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        client.post(f"/api/authorization/codes/{code_id}/revoke", headers=admin_headers)
        resp = client.post(f"/api/authorization/codes/{code_id}/revoke", headers=admin_headers)
        assert resp.status_code == 400


class TestAuthorizationCodeBind:
    async def test_bind_code(self, client, admin_headers, normal_user, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_data = _create_code(client, admin_headers, gb_id, acct_id).json()
        code_str = code_data["code"]

        resp = client.post("/api/authorization/codes/bind", json={
            "code": code_str,
            "grantor_account_id": admin_headers,
        }, headers=admin_headers)
        assert resp.status_code == 200 or resp.status_code == 403

    async def test_bind_invalid_code(self, client, admin_headers):
        resp = client.post("/api/authorization/codes/bind", json={
            "code": "INVALID_CODE_XYZ",
            "grantor_account_id": 1,
        }, headers=admin_headers)
        assert resp.status_code == 404


class TestAuthorizationActionLogs:
    async def test_logs_after_create(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        resp = client.get(f"/api/authorization/codes/{code_id}/logs", headers=admin_headers)
        assert resp.status_code == 200
        logs = resp.json()
        assert len(logs) >= 1
        assert any(log["action_type"] == "GENERATE" for log in logs)

    async def test_logs_after_revoke(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        client.post(f"/api/authorization/codes/{code_id}/revoke", headers=admin_headers)

        resp = client.get(f"/api/authorization/codes/{code_id}/logs", headers=admin_headers)
        logs = resp.json()
        assert any(log["action_type"] == "REVOKE" for log in logs)

    async def test_logs_pagination(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        resp = client.get(f"/api/authorization/codes/{code_id}/logs?page=1&page_size=1", headers=admin_headers)
        assert resp.status_code == 200
        logs = resp.json()
        assert len(logs) <= 1


class TestAuthorizationIsolation:
    async def test_user_cannot_see_other_codes(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        _create_code(client, admin_headers, gb_id, acct_id)

        resp = client.get("/api/authorization/codes", headers=user_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    async def test_user_cannot_revoke_other_code(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()
        acct_id = _create_account(client, admin_headers).json()
        code_id = _create_code(client, admin_headers, gb_id, acct_id).json()["id"]

        resp = client.post(f"/api/authorization/codes/{code_id}/revoke", headers=user_headers)
        assert resp.status_code == 404
