"""
Async MCP Client for Kolkata Pujo Parikrama.
Connects to the Streamable HTTP FastMCP endpoint on Render.
Handles JSON-RPC initialize, tools/list, and tools/call.
"""

import os
import json
import logging
import asyncio
import httpx

logger = logging.getLogger("mcp_client")
DEFAULT_MCP_URL = "https://kolkata-puja-mcp-server2.onrender.com/mcp"

class AsyncMcpClient:
    def __init__(self, url: str | None = None, token: str | None = None):
        self.url = (url or os.environ.get("MCP_SERVER_URL") or DEFAULT_MCP_URL).strip()
        self.token = (token or os.environ.get("MCP_SERVER_TOKEN") or "").strip()
        self.session_id: str | None = None
        self.tools: list[dict] = []
        self.lock = asyncio.Lock()
        self.ready = False
        self._next_id = 1

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        return headers

    async def ensure_ready(self, client: httpx.AsyncClient):
        if self.ready:
            return

        async with self.lock:
            if self.ready:
                return

            init_payload = {
                "jsonrpc": "2.0",
                "id": self._next_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "pujo-parikrama-web", "version": "1.0"},
                },
            }
            self._next_id += 1

            logger.info("Initializing MCP connection to %s", self.url)
            resp = await client.post(
                self.url,
                json=init_payload,
                headers=self._headers(),
                timeout=httpx.Timeout(45.0, connect=20.0),
            )
            resp.raise_for_status()

            # Capture Mcp-Session-Id header if returned
            session_hdr = resp.headers.get("mcp-session-id")
            if session_hdr:
                self.session_id = session_hdr.strip()

            # Send initialized notification
            notif_payload = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
            }
            try:
                await client.post(
                    self.url,
                    json=notif_payload,
                    headers=self._headers(),
                    timeout=httpx.Timeout(10.0),
                )
            except Exception as e:
                logger.warning("MCP notification warning: %s", e)

            # Fetch tools/list
            list_payload = {
                "jsonrpc": "2.0",
                "id": self._next_id,
                "method": "tools/list",
                "params": {},
            }
            self._next_id += 1

            list_resp = await client.post(
                self.url,
                json=list_payload,
                headers=self._headers(),
                timeout=httpx.Timeout(30.0),
            )
            list_resp.raise_for_status()

            result = self._parse_jsonrpc_result(list_resp.text)
            self.tools = result.get("tools", [])
            self.ready = True
            logger.info("MCP ready: %d tools loaded", len(self.tools))

    def _parse_jsonrpc_result(self, raw_text: str) -> dict:
        """Parses plain JSON or SSE data streams from FastMCP."""
        raw_text = raw_text.strip()
        if "data:" in raw_text:
            # SSE stream (lines might begin with event: or data:)
            for line in raw_text.splitlines():
                line = line.strip()
                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    if data_str and data_str != "[DONE]":
                        parsed = json.loads(data_str)
                        if "result" in parsed:
                            return parsed["result"]
                        if "error" in parsed:
                            raise RuntimeError(f"MCP error: {parsed['error']}")
        # Plain JSON
        parsed = json.loads(raw_text)
        if "result" in parsed:
            return parsed["result"]
        if "error" in parsed:
            raise RuntimeError(f"MCP error: {parsed['error']}")
        return parsed

    async def get_tools(self) -> list[dict]:
        """Returns the list of available MCP tools."""
        async with httpx.AsyncClient() as client:
            try:
                await self.ensure_ready(client)
                return self.tools
            except Exception as e:
                logger.error("Failed to fetch MCP tools: %s", e)
                return self.tools  # Return cached if available

    async def call_tool(self, name: str, arguments: dict) -> str:
        """Calls an MCP tool and returns formatted text."""
        async with httpx.AsyncClient() as client:
            await self.ensure_ready(client)

            call_payload = {
                "jsonrpc": "2.0",
                "id": self._next_id,
                "method": "tools/call",
                "params": {
                    "name": name,
                    "arguments": arguments,
                },
            }
            self._next_id += 1

            try:
                resp = await client.post(
                    self.url,
                    json=call_payload,
                    headers=self._headers(),
                    timeout=httpx.Timeout(60.0),
                )
                if resp.status_code == 404:
                    logger.warning("MCP session expired (404). Reconnecting...")
                    self.ready = False
                    self.session_id = None
                    await self.ensure_ready(client)
                    resp = await client.post(
                        self.url,
                        json=call_payload,
                        headers=self._headers(),
                        timeout=httpx.Timeout(60.0),
                    )
                resp.raise_for_status()
            except Exception as e:
                logger.error("Error communicating with MCP server: %s", e)
                raise

            result = self._parse_jsonrpc_result(resp.text)
            content = result.get("content", [])
            out_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    out_parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    out_parts.append(item)

            if out_parts:
                return "\n".join(out_parts)

            if "structuredContent" in result:
                return json.dumps(result["structuredContent"], ensure_ascii=False)
            return json.dumps(result, ensure_ascii=False)

# Singleton client instance
mcp_client = AsyncMcpClient()
