"""从 api 容器日志捞取最新 Mock 短信验证码（开发联调用）。

用法：
    # 1. 先触发发送（注册页点发送验证码，或调用接口）
    curl -X POST http://localhost/api/auth/password-reset/request-phone \
         -H "Content-Type: application/json" -d '{"phone": "13900009999"}'

    # 2. 取码（脚本只输出验证码本身，便于复制/脚本引用）
    python e2e/get_sms_code.py 13900009999

可选参数：
    --container <name>  api 容器名（默认 lishangyun-api-1）
    --lines N           扫描最近多少行日志（默认 500）
    --log-file <path>   不连 docker，改扫本地日志文件（本地 uvicorn 场景）

说明：
- 仅 Mock 模式（system_settings.sms_mode = mock）有效，真实短信模式没有日志可查。
- 取不到时退出码 1；取到时退出码 0 并只向 stdout 打印验证码。
- 如果本地是 uvicorn 直接跑（8001），验证码直接打在启动终端里，本脚本也可省略。
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_CONTAINER = "lishangyun-api-1"
DEFAULT_LINES = 500

# 匹配 app.core.sms 的 Mock 日志行：
# INFO:app.core.sms:【Mock短信】向 13900009999 发送验证码 985843（未真实发送）
LOG_PATTERN = re.compile(r"【Mock短信】向\s*(\S+)\s*发送验证码\s*(\d+)")

DOCKER_CANDIDATES = [
    r"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
    r"C:\Program Files\Docker\Docker\resources\bin\docker",
    "docker",
]


def find_docker() -> str:
    for candidate in DOCKER_CANDIDATES:
        if candidate == "docker":
            return candidate  # 交给 PATH 解析
        if Path(candidate).exists():
            return candidate
    return "docker"


def read_container_logs(container: str, lines: int) -> list[str]:
    docker = find_docker()
    proc = subprocess.run(
        [docker, "logs", container, "--tail", str(lines)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        sys.stderr.write(
            f"读取容器日志失败（docker logs {container}）：\n{proc.stderr.strip()}\n"
        )
        sys.exit(2)
    # 合并 stdout/stderr：uvicorn 访问日志与 Mock 短信可能分处两路
    return (proc.stdout + "\n" + proc.stderr).splitlines()


def read_local_log(path: str, lines: int) -> list[str]:
    log_path = Path(path)
    if not log_path.exists():
        sys.stderr.write(f"日志文件不存在：{log_path}\n")
        sys.exit(2)
    # 大文件只扫尾部
    with log_path.open("r", encoding="utf-8", errors="replace") as f:
        return f.readlines()[-lines:]


def main() -> None:
    parser = argparse.ArgumentParser(description="从 api 日志取最新 Mock 短信验证码")
    parser.add_argument("phone", help="手机号（如 13900009999）")
    parser.add_argument("--container", default=DEFAULT_CONTAINER, help=f"api 容器名（默认 {DEFAULT_CONTAINER}）")
    parser.add_argument("--lines", type=int, default=DEFAULT_LINES, help=f"扫描日志行数（默认 {DEFAULT_LINES}）")
    parser.add_argument("--log-file", help="扫描本地日志文件而非 docker 容器")
    args = parser.parse_args()

    if args.log_file:
        lines = read_local_log(args.log_file, args.lines)
    else:
        lines = read_container_logs(args.container, args.lines)

    latest_code: str | None = None
    for line in lines:
        m = LOG_PATTERN.search(line)
        if m and m.group(1) == args.phone:
            latest_code = m.group(2)

    if latest_code is None:
        sys.stderr.write(
            f"未找到手机号 {args.phone} 的 Mock 短信记录。"
            "请确认已触发发送、容器名正确，或加大 --lines。\n"
        )
        sys.exit(1)

    print(latest_code)


if __name__ == "__main__":
    main()
