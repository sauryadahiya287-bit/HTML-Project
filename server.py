"""PulseEvents static site and same-origin PostgreSQL API."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from datetime import date, datetime
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import db


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "5000"))
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
COOKIE_NAME = "pulse_session"
MAX_BODY_BYTES = 16_384
RATE_LIMIT_WINDOW_SECONDS = 3600
RATE_LIMITS = {"events": 5, "bookings": 10, "subscriptions": 5}
rate_lock = threading.Lock()
write_attempts: dict[tuple[str, str], list[float]] = {}


def parse_event_date(value: object) -> date:
    raw = str(value or "").strip()
    for pattern in ("%d %b %Y", "%Y-%m-%d", "%b %d, %Y"):
        try:
            return date.fromisoformat(raw) if pattern == "%Y-%m-%d" else datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    raise ValueError("Enter the date as “12 Dec 2026” or choose a valid date.")


def require_text(body: dict, key: str, label: str, max_length: int) -> str:
    value = body.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{label} is required.")
    value = " ".join(value.split())
    if not value or len(value) > max_length:
        raise ValueError(f"{label} must be between 1 and {max_length} characters.")
    return value


def limited(session_hash: str, action: str) -> bool:
    now = time.monotonic()
    key = (session_hash, action)
    with rate_lock:
        recent = [timestamp for timestamp in write_attempts.get(key, []) if now - timestamp < RATE_LIMIT_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMITS[action]:
            write_attempts[key] = recent
            return True
        recent.append(now)
        write_attempts[key] = recent
    return False


class PulseHandler(SimpleHTTPRequestHandler):
    server_version = "PulseEvents/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "no-cache")
        if self.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        super().end_headers()

    def _new_session(self) -> tuple[str, str]:
        token = secrets.token_urlsafe(32)
        signature = hmac.new(SESSION_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()
        cookie_value = f"{token}.{signature}"
        digest = hashlib.sha256(f"{SESSION_SECRET}:{token}".encode()).hexdigest()
        return digest, cookie_value

    def _session(self) -> str:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            cookie = SimpleCookie()
        morsel = cookie.get(COOKIE_NAME)
        if morsel:
            token, separator, signature = morsel.value.rpartition(".")
            expected = hmac.new(SESSION_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()
            if separator and token and hmac.compare_digest(signature, expected):
                return hashlib.sha256(f"{SESSION_SECRET}:{token}".encode()).hexdigest()
        session_hash, cookie_value = self._new_session()
        self.session_cookie = cookie_value
        return session_hash

    def _set_session_cookie(self) -> None:
        value = getattr(self, "session_cookie", None)
        if not value:
            return
        secure = self.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https"
        flags = "Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000"
        if secure:
            flags += "; Secure"
        self.send_header("Set-Cookie", f"{COOKIE_NAME}={value}; {flags}")

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_session_cookie()
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError as error:
            raise ValueError("Invalid request size.") from error
        if length < 1 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is empty or too large.")
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Send valid JSON data.") from error
        if not isinstance(value, dict):
            raise ValueError("Send a JSON object.")
        return value

    def _same_origin(self) -> bool:
        site = self.headers.get("Sec-Fetch-Site", "").lower()
        if site and site not in ("same-origin", "same-site", "none"):
            return False
        origin = self.headers.get("Origin")
        if not origin:
            return True
        origin_host = urlparse(origin).netloc.lower()
        forwarded_host = self.headers.get("X-Forwarded-Host", "").split(",")[0].strip().lower()
        request_host = forwarded_host or self.headers.get("Host", "").lower()
        return bool(origin_host and request_host and origin_host == request_host)

    def _limited(self, session_hash: str, action: str) -> bool:
        if limited(session_hash, action):
            self._json(429, {"error": "Too many requests. Please wait and try again."})
            return True
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return super().do_GET()
        if path == "/api/health":
            try:
                db.health_check()
                return self._json(200, {"ok": True, "database": "connected"})
            except Exception as error:
                print(f"Database health check failed: {type(error).__name__}")
                return self._json(503, {"ok": False, "error": "Database is unavailable."})

        session_hash = self._session()
        try:
            if path == "/api/events":
                return self._json(200, {"events": db.list_events()})
            if path == "/api/bookings":
                return self._json(200, {"bookings": db.list_bookings(session_hash)})
        except Exception as error:
            print(f"GET {path} failed: {type(error).__name__}")
            return self._json(503, {"error": "The database could not complete this request. Try again shortly."})
        return self._json(404, {"error": "API route not found."})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return self._json(404, {"error": "Route not found."})
        if not self._same_origin():
            return self._json(403, {"error": "Cross-site requests are not allowed."})

        session_hash = self._session()
        try:
            body = self._body()
            if path == "/api/events":
                if self._limited(session_hash, "events"):
                    return
                name = require_text(body, "name", "Event name", 140)
                venue = require_text(body, "venue", "Venue", 180)
                description = str(body.get("description") or "").strip()
                if len(description) > 1000:
                    raise ValueError("Event description must be 1,000 characters or fewer.")
                category = body.get("category", "community")
                if category not in ("tech", "campus", "music", "design", "community"):
                    raise ValueError("Choose a supported event category.")
                try:
                    price = int(body.get("price"))
                    capacity = int(body.get("capacity", 1500))
                except (TypeError, ValueError) as error:
                    raise ValueError("Enter a valid ticket price and capacity.") from error
                if isinstance(body.get("price"), bool) or price < 0 or price > 10_000_000:
                    raise ValueError("Ticket price must be between ₹0 and ₹10,000,000.")
                if isinstance(body.get("capacity", 1500), bool) or not 1 <= capacity <= 500_000:
                    raise ValueError("Capacity must be between 1 and 500,000.")
                event = db.create_event(
                    {
                        "name": name,
                        "venue": venue,
                        "date": parse_event_date(body.get("date")),
                        "price": price,
                        "category": category,
                        "category_label": require_text(body, "categoryLabel", "Category", 60),
                        "description": description or "A new experience from the PulseEvents community.",
                        "capacity": capacity,
                    },
                    session_hash,
                )
                return self._json(201, {"event": event})

            if path == "/api/bookings":
                if self._limited(session_hash, "bookings"):
                    return
                event_id = require_text(body, "eventId", "Event", 80)
                name = require_text(body, "attendeeName", "Attendee name", 120)
                email = require_text(body, "attendeeEmail", "Email", 254).lower()
                if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                    raise ValueError("Enter a valid email address.")
                tier = body.get("tier")
                if tier not in ("standard", "student", "vip"):
                    raise ValueError("Choose a valid ticket tier.")
                quantity = body.get("quantity")
                if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 5:
                    raise ValueError("Choose between 1 and 5 tickets.")
                booking = db.create_booking(
                    {
                        "event_id": event_id,
                        "attendee_name": name,
                        "attendee_email": email,
                        "tier": tier,
                        "quantity": quantity,
                    },
                    session_hash,
                )
                return self._json(201, {"booking": booking})

            if path == "/api/subscriptions":
                if self._limited(session_hash, "subscriptions"):
                    return
                email = require_text(body, "email", "Email", 254).lower()
                if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                    raise ValueError("Enter a valid email address.")
                created = db.subscribe(email)
                return self._json(201 if created else 200, {"subscribed": True})
        except ValueError as error:
            return self._json(400, {"error": str(error)})
        except LookupError as error:
            return self._json(404, {"error": str(error)})
        except Exception as error:
            print(f"POST {path} failed: {type(error).__name__}")
            return self._json(503, {"error": "The database could not save this request. Try again shortly."})
        return self._json(404, {"error": "API route not found."})


def main() -> None:
    if not SESSION_SECRET:
        raise RuntimeError("SESSION_SECRET is required to protect visitor sessions.")
    try:
        db.health_check()
        db.seed_sample_events()
    except Exception as error:
        raise RuntimeError(f"Database setup failed: {type(error).__name__}") from None

    server = ThreadingHTTPServer(("0.0.0.0", PORT), PulseHandler)
    print(f"PulseEvents is serving on port {PORT}; PostgreSQL is connected.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
