"""PostgreSQL access for the PulseEvents API."""

from __future__ import annotations

import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row


SEED_EVENTS = [
    {
        "id": "sample-tech-summit-2026",
        "name": "Tech Summit 2026",
        "venue": "Bengaluru Convention Centre",
        "date": date(2026, 11, 15),
        "price": 499,
        "category": "tech",
        "category_label": "Technology & AI",
        "description": "Keynote speakers on frontier artificial intelligence, developer tracks and hardware showcase.",
        "capacity": 1500,
    },
    {
        "id": "sample-college-fest-euphoria",
        "name": "College Fest Euphoria",
        "venue": "Delhi University Campus",
        "date": date(2026, 12, 20),
        "price": 199,
        "category": "campus",
        "category_label": "Campus Life",
        "description": "A campus gathering with live music, student performances and food stalls.",
        "capacity": 4000,
    },
    {
        "id": "sample-global-fintech-forum",
        "name": "Global Fintech Forum",
        "venue": "Jio World Centre, Mumbai",
        "date": date(2026, 11, 28),
        "price": 799,
        "category": "tech",
        "category_label": "Finance & Web3",
        "description": "A gathering for the people building the future of finance.",
        "capacity": 1200,
    },
    {
        "id": "sample-neon-music-festival",
        "name": "Neon Music Festival",
        "venue": "Vagator Hilltop Arena, Goa",
        "date": date(2026, 12, 5),
        "price": 399,
        "category": "music",
        "category_label": "Music & Cultural Fest",
        "description": "A night of electronic music beneath the open sky.",
        "capacity": 3500,
    },
    {
        "id": "sample-design-ux-conclave",
        "name": "Design & UX Conclave",
        "venue": "Bengaluru International Centre",
        "date": date(2026, 12, 12),
        "price": 349,
        "category": "design",
        "category_label": "Design & UX",
        "description": "A curated day for designers, researchers and creative founders.",
        "capacity": 800,
    },
]


def connect() -> psycopg.Connection:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured.")
    return psycopg.connect(database_url, connect_timeout=5, row_factory=dict_row)


def seed_sample_events() -> None:
    """Insert the demo catalogue without replacing user-edited records."""
    query = """
        INSERT INTO events
            (id, name, venue, event_date, price, category, category_label,
             description, capacity, is_sample)
        VALUES
            (%(id)s, %(name)s, %(venue)s, %(date)s, %(price)s, %(category)s,
             %(category_label)s, %(description)s, %(capacity)s, TRUE)
        ON CONFLICT (id) DO NOTHING
    """
    with connect() as connection:
        connection.cursor().executemany(query, SEED_EVENTS)


def _event_record(row: dict[str, Any]) -> dict[str, Any]:
    event_date = row["event_date"]
    return {
        "id": row["id"],
        "name": row["name"],
        "venue": row["venue"],
        "date": event_date.strftime("%d %b %Y") if event_date else "",
        "price": int(row["price"]),
        "category": row["category"],
        "categoryLabel": row["category_label"],
        "description": row["description"],
        "capacity": int(row["capacity"]),
        "image": "",
        "isSample": bool(row["is_sample"]),
    }


def list_events() -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, venue, event_date, price, category,
                   category_label, description, capacity, is_sample
            FROM events
            ORDER BY event_date ASC, created_at ASC
            LIMIT 250
            """
        ).fetchall()
    return [_event_record(row) for row in rows]


def get_event(event_id: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT id, name, venue, event_date, price, category,
                   category_label, description, capacity, is_sample
            FROM events
            WHERE id = %s
            """,
            (event_id,),
        ).fetchone()
    return _event_record(row) if row else None


def create_event(event: dict[str, Any], session_hash: str) -> dict[str, Any]:
    with connect() as connection:
        duplicate = connection.execute(
            """
            SELECT id FROM events
            WHERE LOWER(name) = LOWER(%s) AND event_date = %s AND LOWER(venue) = LOWER(%s)
            LIMIT 1
            """,
            (event["name"], event["date"], event["venue"]),
        ).fetchone()
        if duplicate:
            raise ValueError("An event with that name, venue and date already exists.")

        row = connection.execute(
            """
            INSERT INTO events
                (id, name, venue, event_date, price, category, category_label,
                 description, capacity, is_sample, creator_session_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, %s)
            RETURNING id, name, venue, event_date, price, category,
                      category_label, description, capacity, is_sample
            """,
            (
                str(uuid4()),
                event["name"],
                event["venue"],
                event["date"],
                event["price"],
                event["category"],
                event["category_label"],
                event["description"],
                event["capacity"],
                session_hash,
            ),
        ).fetchone()
    return _event_record(row)


def _price_for_tier(event: dict[str, Any], tier: str) -> int:
    base = event["price"]
    if event["id"] == "sample-tech-summit-2026":
        return {"standard": 499, "student": 199, "vip": 1299}[tier]
    if tier == "student":
        return max(49, int(Decimal(base) * Decimal("0.4") + Decimal("0.5")))
    if tier == "vip":
        return int(Decimal(base) * Decimal("2.6") + Decimal("0.5"))
    return base


def create_booking(
    booking: dict[str, Any], session_hash: str
) -> dict[str, Any]:
    event = get_event(booking["event_id"])
    if not event:
        raise LookupError("That event is no longer available.")

    tier = booking["tier"]
    unit_price = _price_for_tier(event, tier)
    quantity = booking["quantity"]
    subtotal = unit_price * quantity
    fee = int(subtotal * 0.09018 + 0.5)
    booking_id = f"PE-{uuid4().hex[:16].upper()}"
    tier_names = {
        "standard": "Standard Delegate",
        "student": "Student & Early Bird",
        "vip": "VIP All-Access",
    }
    with connect() as connection:
        row = connection.execute(
            """
            INSERT INTO bookings
                (id, event_id, session_hash, attendee_name, attendee_email,
                 tier, tier_name, quantity, unit_price, subtotal,
                 service_fee, total, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'payment_required')
            RETURNING id, attendee_name, attendee_email, tier, tier_name,
                      quantity, unit_price, subtotal, service_fee, total,
                      status, created_at
            """,
            (
                booking_id,
                event["id"],
                session_hash,
                booking["attendee_name"],
                booking["attendee_email"],
                tier,
                tier_names[tier],
                quantity,
                unit_price,
                subtotal,
                fee,
                subtotal + fee,
            ),
        ).fetchone()
    return {
        "id": row["id"],
        "eventId": event["id"],
        "event": event["name"],
        "name": event["name"],
        "date": event["date"],
        "venue": event["venue"],
        "image": "",
        "category": event["category"],
        "attendeeName": row["attendee_name"],
        "attendeeEmail": row["attendee_email"],
        "tier": row["tier"],
        "tierName": row["tier_name"],
        "quantity": int(row["quantity"]),
        "unitPrice": int(row["unit_price"]),
        "subtotal": int(row["subtotal"]),
        "fee": int(row["service_fee"]),
        "total": int(row["total"]),
        "status": row["status"],
        "createdAt": row["created_at"].isoformat(),
    }


def list_bookings(session_hash: str) -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT b.id, b.attendee_name, b.attendee_email, b.tier,
                   b.tier_name, b.quantity, b.unit_price, b.subtotal,
                   b.service_fee, b.total, b.status, b.created_at,
                   e.id AS event_id, e.name AS event_name, e.event_date,
                   e.venue, e.category
            FROM bookings AS b
            JOIN events AS e ON e.id = b.event_id
            WHERE b.session_hash = %s
            ORDER BY b.created_at DESC
            LIMIT 100
            """,
            (session_hash,),
        ).fetchall()
    result = []
    for row in rows:
        result.append(
            {
                "id": row["id"],
                "eventId": row["event_id"],
                "event": row["event_name"],
                "name": row["event_name"],
                "date": row["event_date"].strftime("%d %b %Y"),
                "venue": row["venue"],
                "image": "",
                "category": row["category"],
                "attendeeName": row["attendee_name"],
                "attendeeEmail": row["attendee_email"],
                "tier": row["tier"],
                "tierName": row["tier_name"],
                "quantity": int(row["quantity"]),
                "unitPrice": int(row["unit_price"]),
                "subtotal": int(row["subtotal"]),
                "fee": int(row["service_fee"]),
                "total": int(row["total"]),
                "status": row["status"],
                "createdAt": row["created_at"].isoformat(),
            }
        )
    return result


def subscribe(email: str) -> bool:
    with connect() as connection:
        row = connection.execute(
            """
            INSERT INTO newsletter_subscribers (email)
            VALUES (%s)
            ON CONFLICT (email) DO NOTHING
            RETURNING email
            """,
            (email,),
        ).fetchone()
    return row is not None


def health_check() -> None:
    with connect() as connection:
        connection.execute("SELECT 1").fetchone()
