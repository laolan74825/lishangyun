"""逐文件运行 pytest，每个文件独立子进程 + 超时，汇总结果到文件。"""
import glob
import subprocess

PY = r"D:\web\GiftRegistry\server\.venv\Scripts\python.exe"
FILES = sorted(glob.glob(r"tests\test_*.py"))
TIMEOUT = 90

with open("per_file_results.txt", "w", encoding="utf-8") as out:
    for f in FILES:
        try:
            proc = subprocess.run(
                [PY, "-m", "pytest", f, "-q", "--tb=line", "-rf"],
                capture_output=True, timeout=TIMEOUT,
                cwd=r"D:\web\GiftRegistry\server",
                encoding="utf-8", errors="replace",
            )
            text = (proc.stdout or "") + (proc.stderr or "")
            status = "OK"
        except subprocess.TimeoutExpired as e:
            text = ((e.stdout or "") if isinstance(e.stdout, str) else "") + \
                   ((e.stderr or "") if isinstance(e.stderr, str) else "")
            text += "\n(timeout: process killed)"
            status = "TIMEOUT"
        out.write(f"\n{'='*70}\n### {f}  [{status}]\n{'='*70}\n")
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("FAILED") or s.startswith("ERROR") or \
               " passed" in s or " failed" in s or " error" in s:
                out.write(line + "\n")
        out.flush()
        print(f"{f}: {status}", flush=True)

print("done")
