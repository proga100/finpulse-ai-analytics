# Deployment — finpulse.flance.info

VPS + Docker Compose + nginx reverse proxy, matching the pattern used by the other
`*.flance.info` apps. The browser talks only to the Next.js frontend; the backend and
Postgres stay on the docker network.

**Host ports used:** frontend `127.0.0.1:3012`, backend `127.0.0.1:8012` (health/debug only).
`8011` and `8013` are taken by other apps — do not reuse.

## 0. Prerequisites

- A DNS **A record**: `finpulse.flance.info → <VPS_IP>` (RunCloud VPS).
- Docker + Docker Compose, nginx, and certbot installed on the VPS.
- A Google **Gemini API key** (https://aistudio.google.com/apikey).

## 1. Clone

```bash
sudo git clone https://github.com/proga100/finpulse-ai-analytics.git /opt/finpulse
cd /opt/finpulse
```

## 2. Configure secrets

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```ini
GEMINI_API_KEY=<your key>
ANALYTICS_API_TOKEN=<random long string>   # e.g. openssl rand -hex 24
DATABASE_URL=postgresql://finpulse_ai_app:change_this_app_password@db:5432/finpulse
CORS_ORIGINS=["https://finpulse.flance.info"]
DEMO_CALL_LIMIT=5
```

> If you change the `finpulse_ai_app` password, change it in **both** `database/read_only_user.sql`
> and `DATABASE_URL`.

## 3. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -s localhost:8012/health           # {"status":"ok"}
curl -sI localhost:3012 | head -1       # HTTP/1.1 200 OK
```

The synthetic dataset loads automatically on first boot (schema → seed → read-only role).
First start takes a minute while Postgres ingests `database/finpulse_seed.sql`.

## 4. nginx + TLS

```bash
sudo cp deploy/nginx/finpulse.flance.info.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/finpulse.flance.info.conf /etc/nginx/sites-enabled/

sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d finpulse.flance.info

sudo nginx -t && sudo systemctl reload nginx
```

(If a `*.flance.info` wildcard cert already exists, skip certbot and point the `ssl_certificate`
lines at `/etc/letsencrypt/live/flance.info/` — see the commented block in the vhost.)

## 5. Verify

```bash
curl -s https://finpulse.flance.info/health
# open https://finpulse.flance.info and ask a question; confirm the chart streams in.
```

Confirm the demo gate: ask 5 questions → the popup appears on the 6th, and the composer disables.

## 6. Updates

```bash
cd /opt/finpulse && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Notes

- **Regenerate / resize data:** `python3 database/seed.py` (then recreate the db volume:
  `docker compose -f docker-compose.prod.yml down -v && ... up -d --build`).
- **Reset the in-memory demo counters:** `docker compose -f docker-compose.prod.yml restart backend`.
- Logs: `docker compose -f docker-compose.prod.yml logs -f backend`.
