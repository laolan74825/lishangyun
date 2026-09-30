def _create_guestbook(client, headers, name="测试礼簿"):
    return client.post("/api/guestbooks/", json={
        "name": name,
        "event_type": "wedding",
        "event_date": "2026-09-20",
    }, headers=headers)


class TestTerminalSettingsCRUD:
    async def test_get_settings_not_found(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        resp = client.get(
            f"/api/terminal-settings/?guestbook_id={gb_id}&client_id=terminal-1",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json() is None

    async def test_save_and_get_settings(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        cash_id = client.post("/api/payment-accounts/", json={
            "name": "现金", "type": "cash",
        }, headers=admin_headers).json()
        wechat_id = client.post("/api/payment-accounts/", json={
            "name": "微信", "type": "wechat",
        }, headers=admin_headers).json()

        resp = client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={
                "client_id": "terminal-1",
                "operator_name": "收银员A",
                "default_cash_account": cash_id,
                "default_wechat_account": wechat_id,
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "已保存"

        resp_get = client.get(
            f"/api/terminal-settings/?guestbook_id={gb_id}&client_id=terminal-1",
            headers=admin_headers,
        )
        assert resp_get.status_code == 200
        data = resp_get.json()
        assert data["operator_name"] == "收银员A"
        assert data["default_cash_account"] == cash_id
        assert data["default_wechat_account"] == wechat_id

    async def test_update_existing_settings(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]
        acct_id = client.post("/api/payment-accounts/", json={
            "name": "现金", "type": "cash",
        }, headers=admin_headers).json()

        client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={"client_id": "t1", "operator_name": "A"},
            headers=admin_headers,
        )

        resp = client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={"client_id": "t1", "operator_name": "B", "default_cash_account": acct_id},
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp_get = client.get(
            f"/api/terminal-settings/?guestbook_id={gb_id}&client_id=t1",
            headers=admin_headers,
        )
        assert resp_get.json()["operator_name"] == "B"
        assert resp_get.json()["default_cash_account"] == acct_id

    async def test_multiple_terminals_same_guestbook(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers).json()["id"]

        client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={"client_id": "t1", "operator_name": "收银员A"},
            headers=admin_headers,
        )
        client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={"client_id": "t2", "operator_name": "收银员B"},
            headers=admin_headers,
        )

        resp1 = client.get(
            f"/api/terminal-settings/?guestbook_id={gb_id}&client_id=t1",
            headers=admin_headers,
        )
        resp2 = client.get(
            f"/api/terminal-settings/?guestbook_id={gb_id}&client_id=t2",
            headers=admin_headers,
        )
        assert resp1.json()["operator_name"] == "收银员A"
        assert resp2.json()["operator_name"] == "收银员B"


class TestTerminalSettingsPermissions:
    async def test_collaborator_can_save(self, client, collab_headers, db_session):
        gb_id = _create_guestbook(client, collab_headers).json()["id"]

        resp = client.put(
            f"/api/terminal-settings/?guestbook_id={gb_id}",
            json={"client_id": "t1", "operator_name": "协作人"},
            headers=collab_headers,
        )
        assert resp.status_code == 200
