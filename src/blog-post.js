/**
 * Hydrate /blog/:slug from /api/blog/post (+ admin draft preview)
 */
(function () {
  var LOCALE = document.documentElement.lang || "en";
  var root = document.documentElement;
  var slug = root.getAttribute("data-blog-slug") || "";
  var params = new URLSearchParams(window.location.search || "");
  if (!slug) slug = String(params.get("slug") || "").trim();
  var previewDraft = params.get("preview") === "draft";
  var DRAFT_KEY = "nabad_blog_draft:" + slug + ":" + LOCALE;

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(LOCALE.indexOf("ar") === 0 ? "ar" : "en", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  function setText(sel, value) {
    var el = document.querySelector(sel);
    if (!el || value == null || value === "") return;
    el.textContent = value;
  }

  function setHtml(sel, value) {
    var el = document.querySelector(sel);
    if (!el || value == null || value === "") return;
    el.innerHTML = value;
  }

  function setMeta(name, content, isProperty) {
    if (!content) return;
    var sel = isProperty ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var el = document.querySelector(sel);
    if (el) el.setAttribute("content", content);
  }

  function applyPost(post) {
    if (!post || !post.content) return;
    var c = post.content;
    var title = c.hero?.title || c.seo?.title || slug;
    var desc = c.hero?.lead || c.seo?.description || "";
    document.title = (c.seo?.title || title) + " — NabadAi Blog";
    setMeta("description", c.seo?.description || desc);
    setMeta("og:title", title, true);
    setMeta("og:description", desc, true);
    if (c.hero?.coverImageUrl) setMeta("og:image", c.hero.coverImageUrl, true);

    setText("[data-blog='hero.title']", c.hero?.title || title);
    setText("[data-blog='hero.lead']", c.hero?.lead || "");
    setText("[data-blog='meta.date']", fmtDate(post.publishedAt));
    setText("[data-blog='author.name']", c.author?.name || "NabadAi");
    setHtml("[data-blog='body.html']", c.body?.html || "");

    var cover = document.querySelector("[data-blog='hero.cover']");
    if (cover && c.hero?.coverImageUrl) {
      cover.src = c.hero.coverImageUrl;
      cover.alt = c.hero.coverImageAlt || title;
      cover.hidden = false;
    } else if (cover) {
      cover.hidden = true;
    }

    var cta = document.querySelector("[data-blog='cta']");
    if (cta && c.cta?.href) {
      cta.href = c.cta.href;
      cta.textContent = c.cta.label || "Try NabadAi";
      cta.hidden = false;
    }

    var tagsEl = document.querySelector("[data-blog='tags']");
    if (tagsEl && Array.isArray(c.tags) && c.tags.length) {
      tagsEl.innerHTML = c.tags.map(function (t) {
        return '<span class="blogTag">' + escapeHtml(t) + "</span>";
      }).join("");
      tagsEl.hidden = false;
    }
  }

  function readDraftFromStorage() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.content ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function applyDraftPayload(payload) {
    if (!payload || !payload.content) return;
    applyPost({
      content: payload.content,
      publishedAt: payload.publishedAt || null,
    });
    document.body.classList.add("blogDraftPreview");
  }

  if (previewDraft) {
    window.addEventListener("message", function (ev) {
      if (!ev.data || ev.data.type !== "nabad-blog-draft") return;
      applyDraftPayload(ev.data.payload || {});
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(ev.data.payload || {}));
      } catch (e) { /* ignore */ }
    });
    var stored = readDraftFromStorage();
    if (stored) applyDraftPayload(stored);
    return;
  }

  if (!slug) return;

  fetch(
    "/api/blog/post?slug=" + encodeURIComponent(slug) + "&locale=" + encodeURIComponent(LOCALE),
    { credentials: "omit" },
  )
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.post) applyPost(data.post);
    })
    .catch(function () { /* keep static shell */ });
})();
