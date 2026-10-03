import smtplib
from email.mime.text import MIMEText


def _send_email(to_email: str, subject: str, body: str, smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email

    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_email], msg.as_string())


def send_verification_email(to_email: str, code: str, smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str) -> None:
    _send_email(
        to_email,
        "【礼云随笔】邮箱验证码",
        f"您的邮箱验证码为：{code}\n\n验证码 1 分钟内有效。\n如非本人操作，请忽略此邮件。",
        smtp_host, smtp_port, smtp_user, smtp_password,
    )


def send_reset_email(to_email: str, code: str, smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str) -> None:
    _send_email(
        to_email,
        "【礼云随笔】密码重置验证码",
        f"您的密码重置验证码为：{code}\n\n验证码 1 分钟内有效。\n如非本人操作，请忽略此邮件。",
        smtp_host, smtp_port, smtp_user, smtp_password,
    )
