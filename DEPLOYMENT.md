# Deployment Guide

This guide covers deploying the Lableit vision labeling platform using Docker
Compose.

> ## ⚠️ Lableit has NO authentication
>
> There is no login, no accounts, no admin approval, and no API tokens.
> **Every API route is open to anyone who can reach the port**, and all
> projects, media and annotations belong to one implicit local user.
>
> This is deliberate: Lableit is built to be downloaded and run locally for
> academic work. It is **not** built to be put on a public URL.
>
> **If you expose this stack to the internet, anyone who finds it can read,
> download, modify and delete all of your data.**
>
> Deploy it one of these ways only:
> - on your own machine or a lab machine, reachable from `localhost` only;
> - on a private network or VPN;
> - behind a reverse proxy that does the authentication itself (for example
>   HTTP basic auth, SSO, or an identity-aware proxy) in front of **both** the
>   web and API services.

## Architecture

The application consists of:
- **Web**: React SPA served by Nginx (port 80)
- **API**: Bun 1.3 + Fastify 5 backend (port 3001)
- **Worker**: Background job processor using BullMQ; runs with `WORKER_MODE=true` and does not start an HTTP listener
- **Inference**: FastAPI Python service (port 8001)
- **PostgreSQL**: Database
- **Redis**: Message queue and caching
- **MinIO**: Object storage (S3-compatible)

## Prerequisites

- Docker and Docker Compose
- Production server with at least 4GB RAM
- Domain name (optional)

## Quick Deploy

1. **Clone and prepare:**
```bash
git clone <repository-url>
cd lableit
```

2. **Set up environment:**
```bash
cp .env.production .env
# Edit .env with your production values
```

3. **Deploy:**
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

4. **Initialize database:**
```bash
# The api container runs migrations on every start (/start.sh). To run them by hand:
docker compose -f docker-compose.prod.yml exec api bunx prisma migrate deploy

# Create MinIO bucket (optional - auto-created on first use)
docker compose -f docker-compose.prod.yml exec api curl -f http://minio:9000
```

## Environment Variables

Critical variables to update in `.env`:

```bash
# Security
POSTGRES_PASSWORD=your_secure_db_password
S3_ACCESS_KEY=your_s3_access_key
S3_SECRET_KEY=your_s3_secret_key
INFERENCE_BATCH_TIMEOUT_MS=300000
ALLOWED_ORIGINS=              # optional: API CORS list, comma-separated, no spaces; only for cross-origin API calls

# Inference: facebook/sam3 is a gated Hugging Face model, so request access on
# its model page and use a token from the approved account
HF_TOKEN=hf_...

# Process roles
WORKER_MODE=false        # API service
# WORKER_MODE=true       # Worker service
```

The S3 variables above have no defaults in `docker-compose.prod.yml`; compose
refuses to start until they are set.

### Object storage must be reachable from browsers

The API returns presigned URLs built from `S3_ENDPOINT`, and users' browsers
load images and downloads from those URLs directly. `http://minio:9000` only
works inside the Docker network. In production, point `S3_ENDPOINT` at a public
MinIO host behind TLS (for example `https://storage.your-domain.com`), or use
S3 or Cloudflare R2.

### Access control: there is none

Lableit ships no authentication layer, so there is nothing to configure here and
no keys to set. Whoever reaches the API port has full access to every project,
asset, annotation and export in the database.

Keep the stack off the public internet:

- Bind the published ports to the loopback address so only the host can reach
  them, for example `127.0.0.1:3001:3001` instead of `3001:3001` in your compose
  overrides, and reach the app through an SSH tunnel or locally.
- Or put the whole stack on a private network or VPN.
- Or front it with a reverse proxy that authenticates users itself, covering
  **both** the web app and the API. Protecting only the web app is not enough:
  the API is a separate service and answers direct requests.

Note that the object-storage endpoint below must still be reachable by the
browsers you want to serve, so plan those two constraints together.

## SSL/HTTPS Setup

### Option 1: Using Nginx with Let's Encrypt

1. **Update nginx.conf in apps/web:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # ... rest of config
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

2. **Add certbot service to docker-compose.prod.yml:**
```yaml
certbot:
  image: certbot/certbot
  volumes:
    - ./letsencrypt:/etc/letsencrypt
    - ./web:/var/www/html
  command: certonly --webroot --webroot-path=/var/www/html --email your-email@domain.com --agree-tos --no-eff-email -d your-domain.com
```

### Option 2: Using Cloud Load Balancer

Configure SSL termination at your cloud provider (AWS ELB, GCP Load Balancer, etc.).

## Monitoring

### Health Checks

All services include built-in health checks:
- Web: `GET /`
- API: `GET /health` 
- Inference: `GET /health`

### Logs

View logs for all services:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

View logs for specific service:
```bash
docker compose -f docker-compose.prod.yml logs -f api
```

## Scaling

### Horizontal Scaling

Scale individual services:
```bash
# Scale API web/API processes
docker compose -f docker-compose.prod.yml up -d --scale api=3

# Scale background workers
docker compose -f docker-compose.prod.yml up -d --scale worker=2
```

### Resource Limits

Add resource constraints to docker-compose.prod.yml:
```yaml
api:
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

## Backup Strategy

### Database Backup

```bash
# Create backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U lableit lableit > backup.sql

# Restore backup
docker compose -f docker-compose.prod.yml exec -T postgres psql -U lableit lableit < backup.sql
```

### Object Storage Backup

For MinIO, backup the data volume:
```bash
docker run --rm -v lableit_minio_data:/data -v $(pwd):/backup alpine tar czf /backup/minio-backup.tar.gz -C /data .
```

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check PostgreSQL is running: `docker compose ps postgres`
   - Verify DATABASE_URL in .env
   - Check network connectivity between services

2. **MinIO connection failed**
   - Verify S3 credentials in .env
   - Check MinIO is accessible: `curl http://localhost:9000`

3. **Worker not processing jobs**
   - Check Redis connection: `docker compose exec redis redis-cli ping`
   - Verify worker logs: `docker compose logs worker`
   - Verify the worker service has `WORKER_MODE=true`
   - Verify the API service does not set `RUN_WORKER=true` in production unless you intentionally want embedded workers

### Performance Tuning

1. **Database**
   - Add connection pooling
   - Optimize queries
   - Consider read replicas

2. **Redis**
   - Enable persistence
   - Configure memory limits

3. **Nginx**
   - Enable gzip compression
   - Configure caching headers
   - Adjust worker processes

## Production Considerations

- **Security**: there is no authentication (see the warning at the top). Keep the
  stack local, on a VPN, or behind an authenticating proxy; regularly update
  dependencies and use strong database and storage passwords
- **Monitoring**: Set up alerting for service failures
- **Backups**: Automate regular database and storage backups
- **Scaling**: Monitor resource usage and scale as needed
- **Updates**: Use blue-green deployment for zero-downtime updates

## Cloud Deployment

The same setup works on cloud providers:

- **AWS**: Use ECS/EKS with RDS and ElastiCache
- **GCP**: Use GKE with Cloud SQL and Memorystore
- **Azure**: Use AKS with Azure Database and Redis Cache

Replace local services with managed equivalents and update connection strings accordingly.
