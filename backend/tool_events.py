import os
from typing import Any

import aiohttp
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "http://localhost:8000")


async def emit_tool_event(
    room_name: str,
    tool: str,
    status: str,
    message: str,
    **extra: Any,
) -> None:
    if not room_name:
        return

    payload: dict[str, Any] = {
        "tool": tool,
        "status": status,
        "message": message,
        **extra,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/api/tools/emit",
                json={"room_name": room_name, **payload},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as response:
                await response.read()
    except Exception:
        pass
