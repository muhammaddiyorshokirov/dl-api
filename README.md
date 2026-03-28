# Smart Media Extractor API

Production-ready FastAPI service for extracting media links from YouTube, Instagram, TikTok, and other supported sources.

## Features

- FastAPI-based async API
- `yt-dlp` as the main universal extractor
- Smart routing by URL
- Instagram priority chain: `instaloader -> gallery-dl -> yt-dlp`
- TikTok priority chain: custom no-watermark provider -> `yt-dlp`
- Standardized JSON response for every supported platform
- Streaming proxy endpoint for hotlink-protected media
- SEO-friendly web UI with animated landing pages
- Release-friendly file logging

## Standard Response

`GET /extract` and `POST /extract` always return the same success shape:

```json
{
  "status": "success",
  "provider": "youtube",
  "metadata": {
    "title": "Video title",
    "author": "Channel name",
    "duration": "03:33",
    "thumbnail": "https://img.youtube.com/vi/.../maxresdefault.jpg",
    "description": "Short description..."
  },
  "media": {
    "video_mp4": [
      {
        "quality": "1080p",
        "url": "https://...",
        "size_bytes": 450892100,
        "extension": "mp4",
        "has_audio": false
      }
    ],
    "audio_only": [
      {
        "quality": "128kbps",
        "url": "https://...",
        "ext": "m4a",
        "size_bytes": 12500000
      }
    ],
    "images": [],
    "subtitles": [
      {
        "lang_code": "en",
        "language": "English",
        "url": "https://...",
        "format": "vtt"
      }
    ]
  },
  "config": {
    "proxy_required": true,
    "headers": {
      "User-Agent": "Mozilla/5.0...",
      "Referer": "https://www.youtube.com/"
    },
    "expires_at": 1711568647
  }
}
```

## Error Response

Release mode hides raw upstream extractor messages from clients.

```json
{
  "status": "error",
  "code": "media_not_found",
  "message": "Video topilmadi.",
  "provider": "instagram",
  "attempts": [],
  "details": {}
}
```

Full internal errors are written to `error.txt`.

## Endpoints

`GET /`

Animated web UI for end users. Users can paste a media URL and instantly see available quality options, audio-only files, subtitles, images, and release-friendly errors.

SEO landing pages are also available:

- `/youtube-video-downloader`
- `/instagram-downloader`
- `/tiktok-video-downloader`
- `/facebook-video-downloader`
- `/x-video-downloader`

SEO helper routes:

- `/sitemap.xml`
- `/robots.txt`

`GET /health`

Health check.

`GET /extract`

Query params:

- `url` required
- `include_raw` optional, default `false`

Example:

```bash
curl "http://127.0.0.1:8000/extract?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&include_raw=false"
```

`POST /extract`

Example:

```bash
curl -X POST "http://127.0.0.1:8000/extract" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://www.instagram.com/p/XXXXXXXXXXX/\",\"include_raw\":false}"
```

`GET /stream`

Proxy media through this server without saving the file to disk.

Examples:

```bash
curl -L "http://127.0.0.1:8000/stream?url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F1234567890&item_index=1" -o media.bin
```

```bash
curl -L "http://127.0.0.1:8000/stream?media_url=https%3A%2F%2Fcdn.example.com%2Fvideo.mp4&referer=https%3A%2F%2Fexample.com%2Fpost%2F1" -o media.bin
```

## Project Structure

- `app/main.py` FastAPI app, middleware, exception handlers
- `app/services/router.py` smart route selection and fallback chain
- `app/services/ytdlp_base.py` shared `yt-dlp` extraction logic
- `app/services/youtube_extractor.py` generic `yt-dlp` extractor
- `app/services/instagram_extractor.py` Instagram extractor chain
- `app/services/tiktok_extractor.py` TikTok extractor chain
- `app/services/response_mapper.py` standardized API mapping layer
- `app/services/stream_proxy.py` streaming proxy service
- `app/services/errors.py` error classification and public error shaping
- `app/logging_config.py` request and error file loggers

## Environment

Create `.env` from `.env.example`.

Important values:

- `DEBUG=false`
- `REQUEST_TIMEOUT_SECONDS=20`
- `TIKTOK_API_BASE=https://www.tikwm.com/api/`
- `INSTAGRAM_SESSIONFILE=` optional
- `INSTAGRAM_USERNAME=` optional
- `INSTAGRAM_PASSWORD=` optional
- `HTTP_USER_AGENT=` optional custom user agent

## Install

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run In Release Mode

Do not use `--reload` for release.

Windows PowerShell:

```powershell
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Linux/macOS:

```bash
./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Swagger UI:

`http://127.0.0.1:8000/docs`

Web UI:

`http://127.0.0.1:8000/`

## Logging

Two log files are created in the project root:

- `log.txt` every incoming request
- `error.txt` full internal extractor and server errors

This means clients only see clean public messages such as `Video topilmadi.`, while the full upstream error remains available on the server.

## Production Notes

- Some Instagram posts require authentication even when the URL itself is valid
- Signed CDN URLs may expire, so clients should use the response quickly
- `config.proxy_required=true` means the safer option is using `/stream`
- `DEBUG` should remain `false` in production

## Release Checklist

1. Create `.env`
2. Keep `DEBUG=false`
3. Install dependencies from `requirements.txt`
4. Start with `uvicorn app.main:app --host 0.0.0.0 --port 8000`
5. Verify `/health`
6. Verify logs are being written to `log.txt` and `error.txt`


---

## 📬 Contact & Connect

If you have any questions, feedback, or just want to say hi, feel free to reach out:

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/+QEtQD5HYHUUyM2Ey)
[![Email](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=icloud&logoColor=white)](mailto:muhammaddiyorshokirov72@email.com)

## ☕ Support the Project

If you find this project helpful and want to support its further development, you can buy me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/s17mj_09)

> **Ethereum Network:** `0x76b0c5ec2De0A7173bcf49839f331683dAe4E941`

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
<p align="center">
  Give a ⭐️ if this project helped you!
</p>
