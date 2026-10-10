"""阿里云短信发送（标准库实现 POP RPC 签名，免装 SDK）+ Mock 模式。

配置项（数据库 system_settings 表）：
- sms_mode: "mock" | "aliyun"。缺省视为未配置，调用方应报错。
  mock 模式不发真实短信，验证码写入服务端日志（docker logs api），供开发联调。
- sms_access_key_id / sms_access_key_secret_enc: 阿里云 AccessKey（Secret 加密存储）
- sms_sign_name: 短信签名（如「礼尚云」）
- sms_template_code: 模板 CODE（如 SMS_123456789），模板须含 ${code} 变量
"""

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from urllib.parse import quote, urlencode
from urllib.request import urlopen

logger = logging.getLogger(__name__)

SMS_ENDPOINT = "https://dysmsapi.aliyuncs.com/"
SMS_API_VERSION = "2017-05-25"


class SmsSendError(Exception):
    """短信发送失败（网络错误 or 阿里云返回业务错误）。"""


def _percent_encode(value: str) -> str:
    """阿里云要求的 URL 编码：保留 ~*() 不编码，空格编码为 %20。"""
    return quote(value, safe="~*()").replace("+", "%20").replace("%7E", "~")


def _signed_params(secret: str, params: dict[str, str]) -> str:
    """按 POP RPC 规则签名：StringToSign = GET&%2F&canonicalized_query_string。"""
    canonical = "&".join(
        f"{_percent_encode(k)}={_percent_encode(params[k])}" for k in sorted(params)
    )
    string_to_sign = f"GET&%2F&{_percent_encode(canonical)}"
    digest = hmac.new(
        (secret + "&").encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def send_sms(
    phone: str,
    code: str,
    access_key_id: str,
    access_key_secret: str,
    sign_name: str,
    template_code: str,
    timeout: float = 10.0,
) -> None:
    """调用阿里云 SendSms 发送验证码。失败抛 SmsSendError。"""
    params = {
        "AccessKeyId": access_key_id,
        "Action": "SendSms",
        "Format": "JSON",
        "PhoneNumbers": phone,
        "RegionId": "cn-hangzhou",
        "SignName": sign_name,
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": str(uuid.uuid4()),
        "SignatureVersion": "1.0",
        "TemplateCode": template_code,
        "TemplateParam": json.dumps({"code": code}),
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "Version": SMS_API_VERSION,
    }
    params["Signature"] = _signed_params(access_key_secret, params)
    url = f"{SMS_ENDPOINT}?{urlencode(params)}"

    try:
        with urlopen(url, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise SmsSendError(f"短信网关请求失败: {exc}") from exc

    if body.get("Code") != "OK":
        raise SmsSendError(f"短信发送被拒: {body.get('Code')} {body.get('Message')}")


def send_sms_or_mock(
    phone: str,
    code: str,
    mode: str,
    access_key_id: str | None = None,
    access_key_secret: str | None = None,
    sign_name: str | None = None,
    template_code: str | None = None,
) -> None:
    """按模式发送：mock 只记日志；aliyun 走真实网关并校验配置齐全。"""
    if mode == "mock":
        logger.info("【Mock短信】向 %s 发送验证码 %s（未真实发送）", phone, code)
        return
    if not all([access_key_id, access_key_secret, sign_name, template_code]):
        raise SmsSendError("短信服务配置不完整（缺少 AccessKey/签名/模板）")
    send_sms(phone, code, access_key_id, access_key_secret, sign_name, template_code)
