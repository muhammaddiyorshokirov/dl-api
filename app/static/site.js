function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Noma'lum";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatExpires(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("uz-UZ");
}

function safeHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) ? url : "#";
}

function buildMediaUrl(url, proxyRequired, referer) {
  const targetUrl = safeHttpUrl(url);
  if (targetUrl === "#") {
    return "#";
  }

  if (!proxyRequired) {
    return targetUrl;
  }

  const params = new URLSearchParams({ media_url: targetUrl });
  if (referer) {
    params.set("referer", referer);
  }
  return `/stream?${params.toString()}`;
}

function prettifyProvider(provider) {
  const normalized = String(provider || "generic").toLowerCase();
  if (normalized === "youtube") {
    return "YouTube";
  }
  if (normalized === "instagram") {
    return "Instagram";
  }
  if (normalized === "tiktok") {
    return "TikTok";
  }
  if (normalized === "x") {
    return "X";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function numericQuality(quality) {
  const match = String(quality || "").match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function renderOptionCard(item, proxyRequired, referer, typeLabel) {
  const href = buildMediaUrl(item.url, proxyRequired, referer);
  const size = formatBytes(item.size_bytes);
  const extension = escapeHtml(item.extension || item.ext || "unknown");
  const quality = escapeHtml(item.quality || "Auto");
  const hasAudio = item.has_audio === false ? "Video-only" : "Audio bilan";
  const attrs = proxyRequired
    ? 'download rel="noopener noreferrer"'
    : 'target="_blank" rel="noopener noreferrer"';

  return `
    <article class="option-card">
      <h4>${quality}</h4>
      <div class="option-meta">
        <span>${typeLabel}</span>
        <span>${extension}</span>
        <span>${size}</span>
        ${item.has_audio === undefined ? "" : `<span>${hasAudio}</span>`}
      </div>
      <a class="download-link" href="${href}" ${attrs}>Yuklab olish</a>
    </article>
  `;
}

function renderSubtitleCard(track, proxyRequired, referer) {
  const href = buildMediaUrl(track.url, proxyRequired, referer);
  const attrs = proxyRequired
    ? 'download rel="noopener noreferrer"'
    : 'target="_blank" rel="noopener noreferrer"';

  return `
    <article class="option-card">
      <h4>${escapeHtml(track.language || track.lang_code || "Subtitle")}</h4>
      <div class="option-meta">
        <span>${escapeHtml(track.lang_code || "-")}</span>
        <span>${escapeHtml(track.format || "vtt")}</span>
      </div>
      <a class="download-link" href="${href}" ${attrs}>Subtitle ochish</a>
    </article>
  `;
}

function renderImageCard(url, index, proxyRequired, referer) {
  const href = buildMediaUrl(url, proxyRequired, referer);
  return `
    <article class="image-card">
      <img src="${href}" alt="Media image ${index}" loading="lazy">
      <div class="image-card__footer">
        <a class="download-link" href="${href}" download rel="noopener noreferrer">Rasmni olish</a>
      </div>
    </article>
  `;
}

function renderMediaBlock(title, note, content) {
  return `
    <section class="media-block">
      <div class="media-block-header">
        <h3>${title}</h3>
        <p class="option-note">${note}</p>
      </div>
      ${content}
    </section>
  `;
}

function renderSuccess(data) {
  const proxyRequired = Boolean(data?.config?.proxy_required);
  const referer = data?.config?.headers?.Referer || data?.config?.headers?.referer || "";
  const metadata = data?.metadata || {};
  const media = data?.media || {};
  const provider = prettifyProvider(data?.provider);
  const expiresAt = formatExpires(data?.config?.expires_at);
  const thumbnailUrl = metadata.thumbnail ? buildMediaUrl(metadata.thumbnail, proxyRequired, referer) : "";

  const videoFormats = [...(media.video_mp4 || [])].sort((left, right) => numericQuality(right.quality) - numericQuality(left.quality));
  const audioFormats = [...(media.audio_only || [])];
  const subtitles = [...(media.subtitles || [])];
  const images = [...(media.images || [])];

  const videoHtml = videoFormats.length
    ? `<div class="option-grid">${videoFormats.map((item) => renderOptionCard(item, proxyRequired, referer, "Video")).join("")}</div>`
    : '<p class="option-note">Bu media uchun video variant topilmadi.</p>';

  const audioHtml = audioFormats.length
    ? `<div class="option-grid">${audioFormats.map((item) => renderOptionCard(item, proxyRequired, referer, "Audio")).join("")}</div>`
    : '<p class="option-note">Audio-only format mavjud emas.</p>';

  const subtitleHtml = subtitles.length
    ? `<div class="option-grid">${subtitles.map((track) => renderSubtitleCard(track, proxyRequired, referer)).join("")}</div>`
    : '<p class="option-note">Subtitle topilmadi.</p>';

  const imageHtml = images.length
    ? `<div class="image-grid">${images.map((url, index) => renderImageCard(url, index + 1, proxyRequired, referer)).join("")}</div>`
    : '<p class="option-note">Rasm formatidagi media topilmadi.</p>';

  return `
    <div class="results-layout">
      <section class="result-meta">
        <div class="thumbnail-frame">
          ${
            thumbnailUrl
              ? `<img src="${thumbnailUrl}" alt="${escapeHtml(metadata.title || provider)}" loading="lazy">`
              : '<div class="thumbnail-empty">Thumbnail mavjud emas</div>'
          }
        </div>
        <div class="meta-stack">
          <div class="status-row">
            <span class="status-pill is-provider">${provider}</span>
            ${proxyRequired ? '<span class="status-pill is-proxy">Proxy stream tayyor</span>' : ""}
            ${expiresAt ? `<span class="status-pill">Amal muddati: ${escapeHtml(expiresAt)}</span>` : ""}
          </div>
          <h2>${escapeHtml(metadata.title || "Nomi mavjud emas")}</h2>
          <ul class="meta-list">
            ${metadata.author ? `<li>Muallif: ${escapeHtml(metadata.author)}</li>` : ""}
            ${metadata.duration ? `<li>Davomiylik: ${escapeHtml(metadata.duration)}</li>` : ""}
          </ul>
          ${metadata.description ? `<p class="meta-copy">${escapeHtml(metadata.description)}</p>` : '<p class="meta-copy">Qisqacha tavsif mavjud emas.</p>'}
        </div>
      </section>

      <div class="media-sections">
        ${renderMediaBlock("Video sifatlari", "Mavjud MP4 formatlar", videoHtml)}
        ${renderMediaBlock("Audio-only", "Faqat audio variantlar", audioHtml)}
        ${renderMediaBlock("Subtitles", "Mavjud subtitle fayllari", subtitleHtml)}
        ${renderMediaBlock("Rasmlar", "Post ichidagi rasm yoki carousel elementlari", imageHtml)}
      </div>
    </div>
  `;
}

function renderError(error) {
  const message = escapeHtml(error?.message || "Xatolik yuz berdi.");
  const code = escapeHtml(error?.code || "unknown_error");
  return `
    <article class="error-card">
      <span class="eyebrow">Xatolik</span>
      <h2>${message}</h2>
      <p>Media ajratib bo'lmadi. Havolani tekshirib qayta urinib ko'ring yoki boshqa platforma sahifasidan urinib ko'ring.</p>
      <span class="error-code">Code: ${code}</span>
    </article>
  `;
}

function initRevealAnimations() {
  const nodes = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  nodes.forEach((node) => observer.observe(node));
}

function initExtractorApp(root) {
  const form = root.querySelector("[data-extract-form]");
  const input = root.querySelector("[data-url-input]");
  const submitButton = root.querySelector("[data-submit]");
  const fillExample = root.querySelector("[data-fill-example]");
  const emptyState = root.querySelector("[data-state-empty]");
  const loadingState = root.querySelector("[data-state-loading]");
  const errorState = root.querySelector("[data-state-error]");
  const successState = root.querySelector("[data-state-success]");

  if (!form || !input || !submitButton || !emptyState || !loadingState || !errorState || !successState) {
    return;
  }

  const showState = (state) => {
    emptyState.hidden = state !== "empty";
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    successState.hidden = state !== "success";
  };

  const syncUrlState = (url) => {
    const current = new URL(window.location.href);
    if (url) {
      current.searchParams.set("url", url);
    } else {
      current.searchParams.delete("url");
    }
    window.history.replaceState({}, "", current);
  };

  fillExample?.addEventListener("click", () => {
    input.value = root.dataset.exampleUrl || "";
    input.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) {
      errorState.innerHTML = renderError({ code: "validation_error", message: "Media havolasini kiriting." });
      showState("error");
      return;
    }

    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.textContent = "Tekshirilmoqda...";
    showState("loading");
    syncUrlState(url);

    try {
      const response = await fetch("/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, include_raw: false }),
      });

      const payload = await response.json();
      if (!response.ok || payload.status === "error") {
        errorState.innerHTML = renderError(payload);
        showState("error");
        return;
      }

      successState.innerHTML = renderSuccess(payload);
      showState("success");
    } catch (error) {
      errorState.innerHTML = renderError({
        code: "network_error",
        message: "Tarmoq bilan bog'liq xatolik yuz berdi.",
      });
      showState("error");
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.textContent = "Yuklab olish";
    }
  });

  const sharedUrl = new URL(window.location.href).searchParams.get("url");
  if (sharedUrl) {
    input.value = sharedUrl;
    window.requestAnimationFrame(() => form.requestSubmit());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initRevealAnimations();
  document.querySelectorAll("[data-extractor-app]").forEach((root) => initExtractorApp(root));
});
