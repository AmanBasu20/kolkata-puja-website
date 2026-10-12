"""
Shared Guest Quota Manager for Kolkata Pujo Parikrama.
Enforces a 5-question limit per user across both AI providers (Gemini and Groq).
Uses SQLite with thread locks and WAL mode.
"""

import os
import time
import sqlite3
import hashlib
import hmac
import secrets
import ipaddress
import threading
try:
    from fastapi import Request
except ImportError:
    Request = object

DEFAULT_LIMIT = int(os.environ.get("GUEST_LIMIT", "5"))
DB_PATH = os.environ.get("QUOTA_DB_PATH", "web_guest_quota.db")
IP_SECRET = os.environ.get("QUOTA_IP_SECRET", "")


class QuotaManager:
    def __init__(self, db_path: str = DB_PATH, limit: int | None = None):
        if limit is None:
            try:
                limit = int(os.environ.get("GUEST_LIMIT", "5"))
            except Exception:
                limit = 5
        self.unlimited = (limit <= 0) or (limit >= 9999)
        self.limit = 9999 if self.unlimited else max(1, limit)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS usage (
                client_key TEXT PRIMARY KEY,
                used INTEGER NOT NULL,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL
            )"""
        )

        secret = IP_SECRET
        if not secret:
            row = self.db.execute("SELECT v FROM meta WHERE k='ip_secret'").fetchone()
            if row:
                secret = row[0]
            else:
                secret = secrets.token_hex(32)
                self.db.execute("INSERT INTO meta VALUES ('ip_secret', ?)", (secret,))
        self.secret = secret.encode("utf-8")

    def hash_ip(self, ip: str) -> str:
        """Hashes IP to preserve privacy while preventing spoofing."""
        try:
            addr = ipaddress.ip_address(ip)
            if addr.version == 6:
                ip_str = str(ipaddress.ip_network(f"{addr}/64", strict=False).network_address)
            else:
                ip_str = str(addr)
        except Exception:
            ip_str = ip
        return hmac.new(self.secret, ip_str.encode("utf-8"), hashlib.sha256).hexdigest()

    def make_client_key(self, session_id: str | None, client_ip: str) -> str:
        """Creates a composite key from session ID or hashed IP."""
        ip_hash = self.hash_ip(client_ip)
        if session_id and len(session_id.strip()) >= 8:
            clean_session = session_id.strip()
            return f"sess:{clean_session}:{ip_hash[:16]}"
        return f"ip:{ip_hash}"

    def get_used_and_remaining(self, client_key: str) -> tuple[int, int]:
        if self.unlimited:
            return 0, 9999
        with self.lock:
            row = self.db.execute("SELECT used FROM usage WHERE client_key=?", (client_key,)).fetchone()
            used = row[0] if row else 0
            remaining = max(0, self.limit - used)
            return used, remaining

    def reserve(self, client_key: str) -> tuple[bool, int]:
        """
        Attempts to reserve 1 question.
        Returns (is_allowed, remaining_questions).
        """
        if self.unlimited:
            return True, 9999

        now = int(time.time())
        with self.lock:
            row = self.db.execute("SELECT used FROM usage WHERE client_key=?", (client_key,)).fetchone()
            used = row[0] if row else 0
            if used >= self.limit:
                return False, 0

            new_used = used + 1
            if row:
                self.db.execute("UPDATE usage SET used=?, last_seen=? WHERE client_key=?", (new_used, now, client_key))
            else:
                self.db.execute("INSERT INTO usage VALUES (?, ?, ?, ?)", (client_key, new_used, now, now))

            remaining = max(0, self.limit - new_used)
            return True, remaining

    def refund(self, client_key: str) -> int:
        """Refunds 1 question if upstream model failed."""
        if self.unlimited:
            return 9999
        now = int(time.time())
        with self.lock:
            row = self.db.execute("SELECT used FROM usage WHERE client_key=?", (client_key,)).fetchone()
            if row:
                new_used = max(0, row[0] - 1)
                self.db.execute("UPDATE usage SET used=?, last_seen=? WHERE client_key=?", (new_used, now, client_key))
                return max(0, self.limit - new_used)
            return self.limit

    def reset(self, client_key: str | None = None):
        """Resets quota usage for testing."""
        with self.lock:
            if client_key:
                self.db.execute("DELETE FROM usage WHERE client_key=?", (client_key,))
            else:
                self.db.execute("DELETE FROM usage")

    def close(self):
        """Closes the underlying SQLite connection."""
        with self.lock:
            self.db.close()


def extract_client_ip(request: Request) -> str:
    """Extracts remote client IP, respecting trusted proxy headers."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[0]

    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"
