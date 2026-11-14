# PulseEvents project notes

- The root page connects the five imported HTML screens. `server.py` serves the website and its same-origin JSON API; run it with `python3 server.py` on port 5000.
- `db.py` uses Replit PostgreSQL through the runtime-provided `DATABASE_URL`. `schema.sql` is the database schema; apply development schema changes through Replit's database workflow, not at application startup. Replit Publish applies managed production schema changes.
- The API persists community events and booking requests. The five initial catalogue listings are sample fixtures and are inserted idempotently.
- Booking requests are scoped to a signed anonymous browser-session cookie. There is no account login, event moderation or cross-device account sync yet. Event listings are public.
- Checkout saves a request with payment required. No payment provider, valid admission ticket, QR validation, email delivery or wallet integration is connected. The backend stores only the attendee name and email; phone is not saved.
- Existing browser-only demo data is not migrated automatically. Bookmarks and the current checkout selection remain in that browser's local storage.
- The original screens load Tailwind CSS and fonts from external CDNs.
