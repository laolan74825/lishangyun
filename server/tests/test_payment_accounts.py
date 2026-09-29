from sqlalchemy import select

from app.models.payment_account import PaymentAccount


def _create_account(client, headers, name="现金账户", acct_type="cash"):
    return client.post("/api/payment-accounts/", json={
        "name": name,
        "type": acct_type,
    }, headers=headers)


class TestPaymentAccountCRUD:
    async def test_create_account(self, client, admin_headers, db_session):
        resp = _create_account(client, admin_headers)
        assert resp.status_code == 200
        account_id = resp.json()
        assert isinstance(account_id, int)

    async def test_list_accounts(self, client, admin_headers, db_session):
        _create_account(client, admin_headers, name="现金")
        _create_account(client, admin_headers, name="微信", acct_type="wechat")

        resp = client.get("/api/payment-accounts/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2

    async def test_list_accounts_filter_by_type(self, client, admin_headers, db_session):
        _create_account(client, admin_headers, name="现金", acct_type="cash")
        _create_account(client, admin_headers, name="微信", acct_type="wechat")

        resp = client.get("/api/payment-accounts/?type=cash", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 1
        assert data["items"][0]["type"] == "cash"

    async def test_get_account(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "现金账户"

    async def test_get_account_not_found(self, client, admin_headers):
        resp = client.get("/api/payment-accounts/9999", headers=admin_headers)
        assert resp.status_code == 404

    async def test_update_account(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.put(f"/api/payment-accounts/{account_id}", json={
            "name": "更新账户",
            "daily_limit": 10000000,
        }, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp_get.json()["name"] == "更新账户"
        assert resp_get.json()["daily_limit"] == 10000000

    async def test_delete_account_soft(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.delete(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp_get.status_code == 404


class TestReceivedToday:
    async def test_received_today_empty(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(
            f"/api/payment-accounts/{account_id}/received-today?date=2026-09-20",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["received"] == 0

    async def test_received_today_with_records(self, client, admin_headers, db_session):
        from datetime import date

        account_id = _create_account(client, admin_headers).json()

        gb_resp = client.post("/api/guestbooks/", json={
            "name": "测试礼簿",
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        gb_id = gb_resp.json()

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "account_id": account_id,
        }, headers=admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "李四",
            "amount": 30000,
            "payment_method": "cash",
            "account_id": account_id,
        }, headers=admin_headers)

        today = date.today().isoformat()
        resp = client.get(
            f"/api/payment-accounts/{account_id}/received-today?date={today}",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["received"] == 80000


class TestDataIsolation:
    async def test_user_cannot_see_other_accounts(self, client, admin_headers, user_headers, db_session):
        _create_account(client, admin_headers)

        resp = client.get("/api/payment-accounts/", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 0

    async def test_user_cannot_access_other_account(self, client, admin_headers, user_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(f"/api/payment-accounts/{account_id}", headers=user_headers)
        assert resp.status_code == 404


class TestRolePermissions:
    async def test_collaborator_can_create(self, client, collab_headers, db_session):
        resp = _create_account(client, collab_headers)
        assert resp.status_code == 200

    async def test_collaborator_cannot_delete(self, client, collab_headers, db_session):
        account_id = _create_account(client, collab_headers).json()

        resp = client.delete(f"/api/payment-accounts/{account_id}", headers=collab_headers)
        assert resp.status_code == 403
