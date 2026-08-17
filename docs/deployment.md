# Deployment Guide

Deepsiper Enthea can be deployed to bare metal Linux, macOS workstations, Docker containers, or Nix flakes.

## Docker Deployment

Build and run using the container image:

```bash
docker build -t 8b-is/deepsiper-enthea:latest .
docker run -p 3080:3080 \
  -e ENTHEAI_BASE_URL="http://host.docker.internal:8000/v1" \
  -v $(pwd)/workspaces:/app/workspaces \
  8b-is/deepsiper-enthea:latest
```

## Bare Metal Systemd Service

```ini
[Unit]
Description=Deepsiper Enthea Evaluation Harness
After=network.target

[Service]
Type=simple
User=enthea
WorkingDirectory=/opt/deepsiper-enthea
ExecStart=/usr/bin/pnpm dsh web --host 0.0.0.0 --port 3080
Restart=always
EnvironmentFile=/opt/deepsiper-enthea/.env

[Install]
WantedBy=multi-user.target
```
