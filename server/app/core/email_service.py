import smtplib
from email.mime.text import MIMEText


def send_reset_email(to_email: str, code: str, smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str) -> None:
    msg = MIMEText(
        f"您的密码重置验证码为：{code}\n\n验证码 10 分钟内有效。\n如非本人操作，请忽略此邮件。",
        "plain",
        "utf-8",
    )
    msg["Subject"] = "【随礼记账本】密码重置验证码"
    msg["From"] = smtp_user
    msg["To"] = to_email

    with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [to_email], msg.as_string())
