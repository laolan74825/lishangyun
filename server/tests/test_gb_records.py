from urllib.parse import quote

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

    async def test_create_record_active_is_unchecked(self, client, admin_headers, db_session):
        """收礼中录入的记录默认未对账"""
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        records = {r["id"]: r for r in resp.json()["items"]}
        assert records[record_id]["check_status"] == "unchecked"

    async def test_create_record_in_closing_auto_checked(self, client, admin_headers, db_session):
        """收尾中补录的记录无需对账，自动标记为已对账"""
        gb_id = _create_guestbook(client, admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)

        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        records = {r["id"]: r for r in resp.json()["items"]}
        assert records[record_id]["check_status"] == "checked"

        # 汇总统计中该笔计入已对账
        resp_summary = client.get(f"/api/guestbooks/{gb_id}/summary", headers=admin_headers)
        assert resp_summary.json()["checked_count"] == 1
        assert resp_summary.json()["unchecked_count"] == 0

    async def test_merged_guestbook_new_record_auto_linked(self, client, admin_headers, db_session):
        """已合并礼簿中补录的记录自动解析人员关联"""
        gb_id = _create_guestbook(client, admin_headers)
        person_id = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers).json()
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)

        # 补录同名新记录
        new_id = _create_record(client, admin_headers, gb_id, guest_name="张三").json()

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        records = {r["id"]: r for r in resp.json()["items"]}
        assert records[new_id]["person_id"] == person_id

    async def test_merged_guestbook_record_rename_relinks(self, client, admin_headers, db_session):
        """已合并礼簿中修改宾客姓名后自动重新解析人员关联"""
        gb_id = _create_guestbook(client, admin_headers)
        person_a = client.post("/api/persons/", json={"name": "张三"}, headers=admin_headers).json()
        person_b = client.post("/api/persons/", json={"name": "李四"}, headers=admin_headers).json()
        client.post(f"/api/guestbooks/{gb_id}/close", headers=admin_headers)

        record_id = _create_record(client, admin_headers, gb_id, guest_name="张三").json()
        client.post(f"/api/guestbooks/{gb_id}/merge-persons", headers=admin_headers)

        # 修正宾客姓名 → 自动重新关联
        client.put(f"/api/gb-records/{record_id}", json={"guest_name": "李四"}, headers=admin_headers)

        resp = client.get(f"/api/guestbooks/{gb_id}/records", headers=admin_headers)
        records = {r["id"]: r for r in resp.json()["items"]}
        assert records[record_id]["person_id"] == person_b

        # 未合并礼簿中修改姓名不会自动关联
        gb2 = _create_guestbook(client, admin_headers)
        rec2 = _create_record(client, admin_headers, gb2, guest_name="张三").json()
        client.put(f"/api/gb-records/{rec2}", json={"guest_name": "李四"}, headers=admin_headers)
        resp2 = client.get(f"/api/guestbooks/{gb2}/records", headers=admin_headers)
        records2 = {r["id"]: r for r in resp2.json()["items"]}
        assert records2[rec2]["person_id"] is None

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

    async def test_create_logs_operator_name(self, client, admin_headers, db_session):
        """创建记录时传入记账员，操作日志应记录记账员而非账号用户名"""
        gb_id = _create_guestbook(client, admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "operator_name": "收银员小王",
            "client_id": "terminal-1",
        }, headers=admin_headers)
        record_id = resp.json()

        record = await db_session.get(GbRecord, record_id)
        assert record.operator_name == "收银员小王"

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "CREATE",
            )
        )
        log = result.scalar_one()
        assert log.operator_name == "收银员小王"
        assert log.client_id == "terminal-1"

    async def test_update_logs_operator_name(self, client, admin_headers, db_session):
        """修改记录时传入记账员，操作日志应记录记账员"""
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.put(f"/api/gb-records/{record_id}", json={
            "amount": 60000,
            "operator_name": "收银员小李",
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
        assert log.operator_name == "收银员小李"

    async def test_update_falls_back_to_username(self, client, admin_headers, db_session):
        """未传记账员时，操作日志回退为账号用户名"""
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        client.put(f"/api/gb-records/{record_id}", json={"amount": 60000}, headers=admin_headers)

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "UPDATE",
            )
        )
        log = result.scalar_one()
        assert log.operator_name is not None and log.operator_name != ""

    async def test_delete_logs_operator_name(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()

        resp = client.delete(
            f"/api/gb-records/{record_id}?operator_name={quote('收银员小张')}", headers=admin_headers)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "DELETE",
            )
        )
        log = result.scalar_one()
        assert log.operator_name == "收银员小张"

    async def test_batch_writes_audit_logs_with_operator(self, client, admin_headers, db_session):
        """批量录入应为每条记录写操作日志，并记录记账员"""
        gb_id = _create_guestbook(client, admin_headers)
        resp = client.post(f"/api/guestbooks/{gb_id}/records/batch", json={
            "records": [
                {"guest_name": "张三", "amount": 50000, "payment_method": "cash"},
                {"guest_name": "李四", "amount": 30000, "payment_method": "cash"},
            ],
            "operator_name": "收银员小赵",
            "client_id": "terminal-2",
        }, headers=admin_headers)
        assert resp.status_code == 200
        ids = resp.json()
        assert len(ids) == 2

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id.in_(ids),
                OperationLog.action_type == "CREATE",
            )
        )
        logs = result.scalars().all()
        assert len(logs) == 2
        assert all(log.operator_name == "收银员小赵" for log in logs)

    async def test_restore_logs_operator_name(self, client, admin_headers, db_session):
        gb_id = _create_guestbook(client, admin_headers)
        record_id = _create_record(client, admin_headers, gb_id).json()
        client.delete(f"/api/gb-records/{record_id}", headers=admin_headers)

        resp = client.post(
            f"/api/gb-records/{record_id}/restore?operator_name={quote('收银员小孙')}",
            headers=admin_headers)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(OperationLog).where(
                OperationLog.target_table == "gb_records",
                OperationLog.target_id == record_id,
                OperationLog.action_type == "RESTORE",
            )
        )
        log = result.scalar_one()
        assert log.operator_name == "收银员小孙"


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
