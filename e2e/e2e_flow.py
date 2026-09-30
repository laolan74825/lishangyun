"""E2E：通过 nginx 走完整协作邀请流程。

前置：docker-compose 全套容器已启动（含 nginx 80 端口），且已跑过 e2e_seed.py。
用法（在仓库根目录）：
    server/.venv/Scripts/python.exe e2e/e2e_flow.py
"""
import json
from datetime import datetime, timedelta, timezone

import httpx

BASE = "http://localhost"
TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TZ)

results = []


def check(name, cond, extra=""):
    results.append((name, cond, extra))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


with httpx.Client(base_url=BASE, timeout=15, trust_env=False) as c:

    # 1. 登录两个用户
    r1 = c.post("/api/auth/login", json={
        "username": "e2e_owner", "password": "E2eOwner@123"})
    r2 = c.post("/api/auth/login", json={
        "username": "e2e_invitee", "password": "E2eInvitee@123"})
    check("两用户登录", r1.status_code == 200 and r2.status_code == 200,
          f"owner={r1.status_code} invitee={r2.status_code}")
    owner = {"Authorization": f"Bearer {r1.json()['access_token']}"}
    invitee = {"Authorization": f"Bearer {r2.json()['access_token']}"}

    # 2. owner 建礼簿
    r = c.post("/api/guestbooks/", headers=owner, json={
        "name": "E2E协作验证礼簿", "event_type": "wedding",
        "event_date": NOW.date().isoformat()})
    check("owner 创建礼簿", r.status_code in (200, 201), f"code={r.status_code}")
    gb_id = r.json()["id"]

    # 3. owner 精确搜索受邀人
    r = c.get("/api/collaboration/search", headers=owner,
              params={"keyword": "e2e_invitee@test.com"})
    check("搜索受邀人(邮箱)", r.status_code == 200 and r.json().get("id") == 2,
          r.text[:120])

    # 4. owner 发邀请（起止时间精确到分钟；开始时间须不早于当前时刻，故取 90 秒后）
    start = NOW + timedelta(seconds=90)
    end = NOW + timedelta(hours=2)
    r = c.post("/api/collaboration/invites", headers=owner, json={
        "invitee_keyword": "e2e_invitee@test.com",
        "guestbook_id": gb_id,
        "permissions": "record",
        "collaboration_start_at": iso(start),
        "collaboration_end_at": iso(end),
    })
    check("owner 发出邀请", r.status_code in (200, 201), f"code={r.status_code} {r.text[:200]}")
    body = r.json()
    invite_id, invite_code = body["id"], body["invite_code"]
    check("邀请返回 6 位明文码", isinstance(invite_code, str) and len(invite_code) == 6,
          f"code={invite_code}")

    # 5. 受邀人视角：待处理邀请（码应脱敏）
    r = c.get("/api/collaboration/invites/pending", headers=invitee)
    pend = [i for i in r.json() if i["id"] == invite_id]
    check("受邀人看到待处理邀请", r.status_code == 200 and len(pend) == 1)
    check("待处理列表不含明文邀请码", bool(pend) and "invite_code" not in pend[0])

    # 6. 受邀人接受邀请
    r = c.post("/api/collaboration/invites/accept", headers=invitee,
               json={"invite_id": invite_id, "invite_code": invite_code})
    check("受邀人凭码接受邀请", r.status_code == 200, r.text[:120])

    # 6.5 等待协作窗口开始（邀请开始时间设在当前 +90s）
    import time
    wait = (start - datetime.now(TZ)).total_seconds() + 3
    if wait > 0:
        print(f"等待协作窗口开始 {wait:.0f}s ...")
        time.sleep(wait)

    # 7. record 权限不含查看：读礼簿详情应 403（权限模型，非缺陷）
    r = c.get(f"/api/guestbooks/{gb_id}", headers=invitee)
    check("record 权限读礼簿详情 403", r.status_code == 403, f"code={r.status_code}")

    # 8. record 权限：可代录礼金
    r = c.post(f"/api/guestbooks/{gb_id}/proxy-records", headers=invitee, json={
        "records": [{"guest_name": "E2E宾客甲", "amount": 500,
                     "payment_method": "cash"}]})
    check("受邀人代录礼金 200", r.status_code == 200, r.text[:120])

    # 9. record 权限：对账只读端点应 403
    r = c.get(f"/api/guestbooks/{gb_id}/records", headers=invitee)
    check("record 权限访问对账 403", r.status_code == 403, f"code={r.status_code}")

    # 10. 受邀人（非授权人）撤销 → 404 不泄露邀请存在
    r = c.post(f"/api/collaboration/invites/{invite_id}/revoke", headers=invitee)
    check("受邀人撤销邀请被拒 404", r.status_code == 404, f"code={r.status_code}")

    # 11. owner 撤销邀请
    r = c.post(f"/api/collaboration/invites/{invite_id}/revoke", headers=owner)
    check("owner 撤销邀请 200", r.status_code == 200, r.text[:120])

    # 12. 撤销后受邀人访问应 403
    r = c.get(f"/api/guestbooks/{gb_id}", headers=invitee)
    check("撤销后受邀人访问 403", r.status_code == 403, f"code={r.status_code}")

    # 13. 操作日志存在
    r = c.get(f"/api/collaboration/invites/{invite_id}/logs", headers=owner)
    check("授权操作日志可查询", r.status_code == 200 and len(r.json()) >= 2,
          f"logs={len(r.json())}")

    # ===== 场景二：both 权限的正向验证 =====
    r = c.post("/api/guestbooks/", headers=owner, json={
        "name": "E2E协作验证礼簿2", "event_type": "birthday",
        "event_date": NOW.date().isoformat()})
    gb2 = r.json()["id"]
    start2 = NOW2 = datetime.now(TZ) + timedelta(seconds=90)
    end2 = NOW2 + timedelta(hours=1)
    r = c.post("/api/collaboration/invites", headers=owner, json={
        "invitee_keyword": "e2e_invitee@test.com", "guestbook_id": gb2,
        "permissions": "both",
        "collaboration_start_at": iso(start2),
        "collaboration_end_at": iso(end2)})
    check("owner 发 both 权限邀请", r.status_code in (200, 201), r.text[:120])
    iid2, icode2 = r.json()["id"], r.json()["invite_code"]
    r = c.post("/api/collaboration/invites/accept", headers=invitee,
               json={"invite_id": iid2, "invite_code": icode2})
    check("受邀人接受 both 邀请", r.status_code == 200, r.text[:120])
    wait2 = (start2 - datetime.now(TZ)).total_seconds() + 3
    if wait2 > 0:
        print(f"等待协作窗口开始 {wait2:.0f}s ...")
        time.sleep(wait2)
    r = c.get(f"/api/guestbooks/{gb2}", headers=invitee)
    check("both 权限读礼簿详情 200", r.status_code == 200, f"code={r.status_code}")
    r = c.get(f"/api/guestbooks/{gb2}/records", headers=invitee)
    check("both 权限读礼金列表 200", r.status_code == 200, f"code={r.status_code}")
    r = c.post(f"/api/collaboration/invites/{iid2}/revoke", headers=owner)
    check("owner 撤销 both 授权 200", r.status_code == 200, r.text[:120])
    r = c.get(f"/api/guestbooks/{gb2}", headers=invitee)
    check("撤销 both 后访问 403", r.status_code == 403, f"code={r.status_code}")

    # 15. 前端页面可达
    r = c.get("/")
    check("前端首页可达", r.status_code == 200 and "html" in r.headers.get("content-type", ""),
          f"code={r.status_code}")

fails = [n for n, ok, _ in results if not ok]
print("\n==== E2E 结果: %d/%d 通过 ====" % (len(results) - len(fails), len(results)))
if fails:
    print("FAILED:", fails)
    raise SystemExit(1)
