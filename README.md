# V360 Standalone Player Service (Railway Deployment)

This is a standalone, isolated microservice for self-hosting your V360 360° interactive diamond/jewelry viewer and media assets on **Railway.com**.

It runs completely in parallel with your existing ERP project without modifying any of your existing database schemas or services.

---

## Features

1. **Native V360 Player Support (`/vision360.html?d=STONE_ID`):**
   Full compatibility with official V360 iframe embeds and metadata format.
2. **Modern Responsive HTML5 Player (`/viewer.html?d=STONE_ID`):**
   Lightweight, mobile-friendly 360° canvas viewer with touch drag, pinch zoom, auto-rotation, and play/pause controls.
3. **Office PC Sync API (`POST /api/upload`):**
   Accepts automated scans uploaded directly from the office PC running the V360 scanner.
4. **Cloud Storage & CDN Support (Optional R2/S3):**
   Set `STORAGE_CDN_URL` to point to your Cloudflare R2 or S3 bucket for high-performance zero-egress asset hosting.

---

## Quick Railway Deployment Guide

1. Create a new service on Railway.com pointing to this directory (`v360_player_service`).
2. Railway will automatically detect the `Dockerfile` and build the service.
3. (Optional) Set Environment Variables:
   - `PORT`: `3000`
   - `STORAGE_CDN_URL`: `https://media.yourdomain.com` (If using Cloudflare R2 / AWS S3)
4. Your viewer will be available at:
   - `https://YOUR-APP.up.railway.app/viewer.html?d=STONE_ID`
   - `https://YOUR-APP.up.railway.app/vision360.html?d=STONE_ID`
