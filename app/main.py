from __future__ import annotations

from contextlib import asynccontextmanager
from functools import lru_cache
from time import perf_counter

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import PROJECT_ROOT, get_settings
from app.logging_config import get_error_logger, get_request_logger
from app.schemas import ErrorResponse, ExtractRequest, StandardizedExtractResponse
from app.site_content import build_home_context, build_platform_context, get_platform_page, list_platform_pages
from app.services.errors import ExtractorError, StreamProxyError, build_error_response
from app.services.response_mapper import map_extraction_result
from app.services.router import SmartRouter
from app.services.stream_proxy import StreamProxyService


settings = get_settings()
request_logger = get_request_logger()
error_logger = get_error_logger()
templates = Jinja2Templates(directory=str(PROJECT_ROOT / "app" / "templates"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Bitta umumiy async client streaming va proxy ishlarini yengillashtiradi.
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=settings.request_timeout_seconds,
            read=None,
            write=settings.request_timeout_seconds,
            pool=settings.request_timeout_seconds,
        ),
        follow_redirects=True,
    )
    yield
    await app.state.http_client.aclose()


app = FastAPI(
    title=settings.app_name,
    version="0.3.0",
    summary="yt-dlp asosidagi aqlli media extractor API",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=str(PROJECT_ROOT / "app" / "static")), name="static")


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started_at = perf_counter()
    client_host = request.client.host if request.client else "-"
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        request_logger.info(
            'method="%s" path="%s" query="%s" status=%s duration_ms=%s client="%s"',
            request.method,
            request.url.path,
            request.url.query,
            500,
            duration_ms,
            client_host,
        )
        raise

    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    request_logger.info(
        'method="%s" path="%s" query="%s" status=%s duration_ms=%s client="%s"',
        request.method,
        request.url.path,
        request.url.query,
        response.status_code,
        duration_ms,
        client_host,
    )
    return response


@lru_cache(maxsize=1)
def get_router() -> SmartRouter:
    return SmartRouter()


@lru_cache(maxsize=1)
def get_stream_proxy() -> StreamProxyService:
    return StreamProxyService(get_router())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


@app.get("/", response_class=HTMLResponse, include_in_schema=False, name="home_page")
async def home_page(request: Request) -> HTMLResponse:
    context = {"request": request, **build_home_context(request)}
    return templates.TemplateResponse(request=request, name="home.html", context=context)


@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
async def robots_txt(request: Request) -> PlainTextResponse:
    sitemap_url = str(request.url_for("sitemap_xml"))
    body = f"User-agent: *\nAllow: /\nSitemap: {sitemap_url}\n"
    return PlainTextResponse(body)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> RedirectResponse:
    return RedirectResponse(url="/static/favicon.svg", status_code=307)


@app.get("/sitemap.xml", response_class=Response, include_in_schema=False, name="sitemap_xml")
async def sitemap_xml(request: Request) -> Response:
    urls = [str(request.url_for("home_page"))]
    urls.extend(str(request.url_for("platform_page", page_slug=page.slug)) for page in list_platform_pages())

    xml_items = "\n".join(f"  <url><loc>{url}</loc></url>" for url in urls)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{xml_items}\n"
        "</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")


@app.exception_handler(ExtractorError)
async def extractor_error_handler(request: Request, exc: ExtractorError) -> JSONResponse:
    error_logger.error(
        'ExtractorError | method="%s" path="%s" provider="%s" code="%s" message="%s" attempts=%s details=%s',
        request.method,
        request.url.path,
        exc.provider,
        exc.code,
        str(exc),
        [attempt.model_dump() for attempt in exc.attempts],
        exc.details,
    )
    payload = build_error_response(exc)
    return JSONResponse(status_code=exc.http_status, content=payload.model_dump())


@app.exception_handler(StreamProxyError)
async def stream_proxy_error_handler(request: Request, exc: StreamProxyError) -> JSONResponse:
    error_logger.error(
        'StreamProxyError | method="%s" path="%s" message="%s" details=%s',
        request.method,
        request.url.path,
        str(exc),
        exc.details,
    )
    payload = build_error_response(exc)
    return JSONResponse(status_code=exc.http_status, content=payload.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    error_logger.error(
        'ValidationError | method="%s" path="%s" issues=%s',
        request.method,
        request.url.path,
        exc.errors(),
    )
    payload = ErrorResponse(
        code="validation_error",
        message="So'rov parametrlari noto'g'ri.",
        details={"issues": exc.errors()},
    )
    return JSONResponse(status_code=422, content=payload.model_dump())


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    error_logger.exception(
        'UnhandledError | method="%s" path="%s" query="%s"',
        request.method,
        request.url.path,
        request.url.query,
    )
    payload = ErrorResponse(
        code="internal_server_error",
        message="Kutilmagan ichki xatolik yuz berdi.",
        details={"reason": str(exc)} if settings.debug else {},
    )
    return JSONResponse(status_code=500, content=payload.model_dump())


@app.post(
    "/extract",
    response_model=StandardizedExtractResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
async def extract_media(payload: ExtractRequest) -> StandardizedExtractResponse:
    return await _run_extract(payload.url, payload.include_raw)


@app.get(
    "/extract",
    response_model=StandardizedExtractResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
async def extract_media_get(
    url: str = Query(..., min_length=5),
    include_raw: bool = Query(default=False),
) -> StandardizedExtractResponse:
    return await _run_extract(url, include_raw)


@app.get(
    "/stream",
    name="stream_media",
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
)
async def stream_media(
    request: Request,
    url: str | None = Query(default=None, min_length=5),
    media_url: str | None = Query(default=None, min_length=5),
    item_index: int = Query(default=1, ge=1),
    include_raw: bool = Query(default=False),
    referer: str | None = Query(default=None),
):
    # Proxy stream faylni diskka saqlamasdan foydalanuvchiga uzatadi.
    stream = await get_stream_proxy().open_stream(
        client=request.app.state.http_client,
        source_url=url,
        media_url=media_url,
        item_index=item_index,
        include_raw=include_raw,
        referer=referer,
        request_range=request.headers.get("range"),
    )
    return StreamingResponse(
        stream.iterator,
        media_type=stream.media_type,
        status_code=stream.status_code,
        headers=stream.headers,
        background=stream.background,
    )


async def _run_extract(url: str, include_raw: bool) -> StandardizedExtractResponse:
    result = await get_router().extract(url, include_raw=include_raw)
    return map_extraction_result(result)


@app.get("/{page_slug}", response_class=HTMLResponse, include_in_schema=False, name="platform_page")
async def platform_page(request: Request, page_slug: str) -> HTMLResponse:
    page = get_platform_page(page_slug)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    context = {"request": request, **build_platform_context(request, page)}
    return templates.TemplateResponse(request=request, name="platform.html", context=context)
