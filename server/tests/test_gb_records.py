from sqlalchemy import select

from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.operation_log import OperationLog


def _create_guestbook(client, headers):
    resp = client.post("/api/guestbooks/", json={
        "name": "测试礼簿",
        "event_type": "wedding",
        "event_date": "2026-10-01",
    }, headers=headers)
    return resp.json()["id"]


def _create_record(client, headers, gb_id, guest_name="张三", amount=50000, payment_method="cash"):
    return client.post(f"/api/guestbooks/{gb_id}/records", json={
        "guest_name": guest_name,
        "amount": amount,
        "payment_method": payment_method,
    }, headers=headers)


class TestGbRecordCRUD:
    async def test_create_record(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)

        resp = _create_record(client, admin_headers, gb_id)
        assert resp.status_code == 200
        record_id = resp.json()
        assert isinstance(record_id, int)

    async def test_create_record_nonexistent_guestbook(self, client, admin_headers, db_session):
        resp = _create_record(client, admin_headers, 9999)
        assert resp.status_code == 404

    async def test_list_records(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        _create_record(client, admin_headers, gb_id, guest_name="张三")
        _create_record(client, admin_headers, gb_id, guest_name="李四")

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2

    async def test_get_recent_records(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        for i in range(10):
            _create_record(client, admin_headers, gb_id, guest_name=f"客人{i}")

        resp = client.get(f"/api/guestbooks/{gb_id}/records/recent?limit=3", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    async def test_update_record(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.put(f"/api/gb-records/{record_id}", json={
            "amount": 60000,
            "guest_name": "张三丰",
        }, headers=admin_headers)
        assert resp.status_code == 200

    async def test_delete_record_soft(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.delete(f"/api/gb-records/{record_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_list = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        assert resp_list.json()["pagination"]["total_count"] == 0

    async def test_update_record_with_remark_logs_note(self, client, admin_headers, db_session):
        from app.models.operation_log import OperationLog

        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.put(f"/api/gb-records/{record_id}", json={
            "amount": 60000,
            "remark": "金额录入错误，已核对修正",
        }, headers=admin_headers)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "UPDATE",
            )
        )
        log = result.scalar_one()
        assert log.note == "金额录入错误，已核对修正"

    async def test_delete_record_with_remark_logs_note(self, client, admin_headers, db_session):
        from app.models.operation_log import OperationLog

        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.delete(
            f"/api/gb-records/{record_id}?remark={'重复录入的记录'}",
            headers=admin_headers,
        )
        assert resp.status_code == 200

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "DELETE",
            )
        )
        log = result.scalar_one()
        assert log.note == "重复录入的记录"

    async def test_deleted_records_list_and_restore(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        keep_id = _create_record(client, admin_headers, gb_id, guest_name="保留").json()
        del_id = _create_record(client, admin_headers, gb_id, guest_name="误删").json()
        client.delete(f"/api/gb-records/{del_id}", headers=admin_headers)

        # 已删除列表：只包含软删除记录，且带删除时间
        resp = client.get(f"/api/guestbooks/{gb_id}/records/deleted", headers=admin_headers)
        assert resp.status_code == 200
        deleted = resp.json()
        assert [r["id"] for r in deleted] == [del_id]
        assert deleted[0]["guest_name"] == "误删"
        assert deleted[0]["deleted_at"] is not None

        # 正常列表不再包含该记录
        resp_list = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        ids = [r["id"] for r in resp_list.json()["items"]]
        assert del_id not in ids and keep_id in ids

        # 恢复：记录回到正常列表，并写入 RESTORE 日志（含备注）
        resp = client.post(
            f"/api/gb-records/{del_id}/restore?remark={'误删恢复'}",
            headers=admin_headers,
        )
        assert resp.status_code == 200

        resp_list = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        ids = [r["id"] for r in resp_list.json()["items"]]
        assert del_id in ids

        resp_deleted = client.get(f"/api/guestbooks/{gb_id}/records/deleted", headers=admin_headers)
        assert resp_deleted.json() == []

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == del_id,
                OperationLog.action_type == "RESTORE",
            )
        )
        log = result.scalar_one()
        assert log.note == "误删恢复"

    async def test_restore_not_deleted_fails(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.post(f"/api/gb-records/{record_id}/restore", headers=admin_headers)
        assert resp.status_code == 404


class TestGbRecordBatch:
    async def test_batch_create(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)

        resp = client.post(f"/api/guestbooks/{gb_id}/records/batch", json={
            "records": [
                {"guest_name": "张三", "amount": 50000, "payment_method": "cash"},
                {"guest_name": "李四", "amount": 30000, "payment_method": "wechat"},
                {"guest_name": "王五", "amount": 20000, "payment_method": "cash"},
            ],
        }, headers=admin_headers)
        assert resp.status_code == 200
        ids = resp.json()
        assert len(ids) == 3

        resp_list = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        assert resp_list.json()["pagination"]["total_count"] == 3


class TestGbRecordCheck:
    async def test_check_record(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.patch(f"/api/gb-records/{record_id}/check?checked=true", headers=admin_headers)
        assert resp.status_code == 200

    async def test_uncheck_record(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()
        client.patch(f"/api/gb-records/{record_id}/check?checked=true", headers=admin_headers)

        resp = client.patch(f"/api/gb-records/{record_id}/check?checked=false", headers=admin_headers)
        assert resp.status_code == 200

    async def test_batch_check(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        ids = []
        for _ in range(3):
            rid = _create_record(client, admin_headers, gb_id).json()
            ids.append(rid)

        resp = client.post("/api/gb-records/batch-check", json={
            "ids": ids,
            "checked": True,
        }, headers=admin_headers)
        assert resp.status_code == 200


class TestGbRecordSearch:
    async def test_search_by_guest_name(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        _create_record(client, admin_headers, gb_id, guest_name="张三")
        _create_record(client, admin_headers, gb_id, guest_name="李四")

        resp = client.get(f"/api/guestbooks/{gb_id}/records/search?q=张", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_check_duplicate(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        _create_record(client, admin_headers, gb_id, guest_name="张三")

        resp = client.get(f"/api/guestbooks/{gb_id}/records/duplicate?name=张三", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["has_duplicate"] is True

        resp2 = client.get(f"/api/guestbooks/{gb_id}/records/duplicate?name=不存在", headers=admin_headers)
        assert resp2.json()["has_duplicate"] is False

    async def test_find_by_phone(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "phone": "13800138000",
        }, headers=admin_headers)

        resp = client.get(f"/api/guestbooks/{gb_id}/records/phone?phone=13800138000", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["guest_name"] == "张三"


class TestGbRecordAccountSummary:
    async def test_account_summary(self, client, admin_headers, db_session):
        from app.models.payment_account import PaymentAccount
        acct = PaymentAccount(owner_id=1, name="现金", type="cash", daily_limit=20000000)
        db_session.add(acct)
        await db_session.commit()
        await db_session.refresh(acct)

        gb_id = _create_guestbook(client, admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "account_id": acct.id,
        }, headers=admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "李四",
            "amount": 30000,
            "payment_method": "cash",
            "account_id": acct.id,
        }, headers=admin_headers)

        resp = client.get(f"/api/guestbooks/{gb_id}/account-summary", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["record_count"] == 2
        assert data[0]["total_amount"] == 80000


class TestGbRecordAuditLog:
    async def test_create_writes_audit_log(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "CREATE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 1


class TestDataIsolation:
    async def test_user_cannot_see_other_records(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        _create_record(client, admin_headers, gb_id)

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=user_headers)
        assert resp.status_code == 403

    async def test_user_cannot_update_other_record(self, client, admin_headers, user_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.put(f"/api/gb-records/{record_id}", json={
            "amount": 99999,
        }, headers=user_headers)
        assert resp.status_code == 404


class TestAmountValidation:
    async def test_amount_below_minimum_rejected(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50,
            "payment_method": "cash",
        }, headers=admin_headers)
        assert resp.status_code == 422

    async def test_amount_above_maximum_rejected(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000001,
            "payment_method": "cash",
        }, headers=admin_headers)
        assert resp.status_code == 422
