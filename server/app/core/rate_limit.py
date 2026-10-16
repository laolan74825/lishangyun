"""登录防爆破与找回密码防枚举：内存滑动窗口限流。

同一键在 login_lock_minutes 窗口内连续失败 login_max_attempts 次后，
临时锁定至窗口结束；成功后计数清零。
单实例部署足够；锁内只操作内存字典，不跨越 await，线程锁开销可忽略。
"""
import threading
import time

from app.config import settings


def _now() -> float:
    return time.monotonic()


class _LoginAttemptStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        # username -> (连续失败次数, 最后一次失败时间戳)
        self._attempts: dict[str, tuple[int, float]] = {}

    def is_locked(self, username: str) -> bool:
        with self._lock:
            entry = self._attempts.get(username)
            if entry is None:
                return False
            count, last = entry
            if count < settings.login_max_attempts:
                return False
            if _now() - last >= settings.login_lock_minutes * 60:
                del self._attempts[username]
                return False
            return True

    def remaining_minutes(self, username: str) -> int:
        with self._lock:
            entry = self._attempts.get(username)
            if entry is None:
                return 0
            remaining = settings.login_lock_minutes * 60 - (_now() - entry[1])
            return max(1, int(remaining // 60) + 1)

    def record_failure(self, username: str) -> None:
        with self._lock:
            count, last = self._attempts.get(username, (0, 0.0))
            window = settings.login_lock_minutes * 60
            count = count + 1 if (_now() - last) < window else 1
            self._attempts[username] = (count, _now())

    def record_success(self, username: str) -> None:
        with self._lock:
            self._attempts.pop(username, None)


login_attempts = _LoginAttemptStore()

# 找回密码 email-hint 端点的防枚举限流：以客户端 IP 为键。
# 攻击者枚举用户名时会轮换用户名，按用户名限流无效；按 IP 限流才能挡住批量探测。
email_hint_attempts = _LoginAttemptStore()
