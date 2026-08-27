/**
 * Admin Blog CMS UI (imported from app.js).
 */

function blogSiteOrigin() {
  const host = window.location.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return "https://www.nabadai.com";
}

function blogAuthHeaders() {
  const token = window.__NABAD_ADMIN_TOKEN__;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function blogAdminFetchOverview(locale = "en") {
  const r = await fetch(`/api/admin/blog?overview=1&locale=${encodeURIComponent(locale)}`, {
    headers: { ...blogAuthHeaders() },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Could not load blog overview.");
  return data;
}

export async function blogAdminFetchPost(slug, locale = "en") {
  const r = await fetch(
    `/api/admin/blog?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`,
    { headers: { ...blogAuthHeaders() } },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Could not load blog post.");
  return data;
}

export async function blogAdminAction({ action, slug, locale, content, publish }) {
  const r = await fetch("/api/admin/blog", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...blogAuthHeaders() },
    body: JSON.stringify({ action, slug, locale, content, publish }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Blog action failed.");
  return data;
}

export async function blogAdminDelete(slug, locale = "en") {
  const r = await fetch(
    `/api/admin/blog?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`,
    { method: "DELETE", headers: { ...blogAuthHeaders() } },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Could not delete post.");
  return data;
}

function readBlogFormContent() {
  const tagsRaw = document.getElementById("blogTags")?.value || "";
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  return {
    seo: {
      title: document.getElementById("blogSeoTitle")?.value || "",
      description: document.getElementById("blogSeoDescription")?.value || "",
    },
    hero: {
      title: document.getElementById("blogHeroTitle")?.value || "",
      lead: document.getElementById("blogHeroLead")?.value || "",
      coverImageUrl: document.getElementById("blogCoverUrl")?.value || "",
      coverImageAlt: document.getElementById("blogCoverAlt")?.value || "",
    },
    body: { html: document.getElementById("blogBodyHtml")?.value || "" },
    author: { name: document.getElementById("blogAuthorName")?.value || "NabadAi", avatarUrl: "" },
    tags,
    cta: {
      label: document.getElementById("blogCtaLabel")?.value || "Try NabadAi",
      href: document.getElementById("blogCtaHref")?.value || "/app/",
    },
  };
}

function fillBlogForm(content = {}) {
  const c = content || {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };
  set("blogSeoTitle", c.seo?.title);
  set("blogSeoDescription", c.seo?.description);
  set("blogHeroTitle", c.hero?.title);
  set("blogHeroLead", c.hero?.lead);
  set("blogCoverUrl", c.hero?.coverImageUrl);
  set("blogCoverAlt", c.hero?.coverImageAlt);
  set("blogBodyHtml", c.body?.html);
  set("blogAuthorName", c.author?.name || "NabadAi");
  set("blogTags", Array.isArray(c.tags) ? c.tags.join(", ") : "");
  set("blogCtaLabel", c.cta?.label);
  set("blogCtaHref", c.cta?.href);
}

function blogPreviewUrl(slug, locale, draft = true) {
  const origin = blogSiteOrigin();
  // Use blog-post?slug= for draft preview — works with cleanUrls and before /blog/:slug rewrite is live.
  const page = locale === "ar" ? "/ar/blog-post" : "/blog-post";
  const qs = new URLSearchParams({ slug: slug || "preview-slug" });
  if (draft) qs.set("preview", "draft");
  return `${origin}${page}?${qs.toString()}`;
}

function pushBlogDraftPreview(slug, locale, content) {
  const payload = { slug, locale, content, savedAt: Date.now() };
  const origin = blogSiteOrigin();
  const frame = document.getElementById("blogPreviewFrame");
  const msg = { type: "nabad-blog-draft", payload };
  let attempts = 0;
  const send = () => {
    attempts += 1;
    try {
      if (frame?.contentWindow) frame.contentWindow.postMessage(msg, origin);
    } catch { /* ignore */ }
    if (attempts < 8) setTimeout(send, 250);
  };
  send();
}

export async function loadBlogViewData(state) {
  if (state.blogScreen === "editor" && state.blogSlug) {
    return blogAdminFetchPost(state.blogSlug, state.blogLocale || "en");
  }
  return blogAdminFetchOverview(state.blogLocale || "en");
}

export function renderBlogHub(data, ctx) {
  const { state, els, escapeHtml, adminPageStack, fmtDateCompact } = ctx;
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  const locale = data?.locale || state.blogLocale || "en";

  const rows = posts.length
    ? posts.map((p) => {
        const status = p.hasDraftChanges
          ? `<span class="mkStatusPill mkStatusPill--draft">Draft</span>`
          : p.published
            ? `<span class="mkStatusPill mkStatusPill--live">Published</span>`
            : `<span class="mkStatusPill">Draft only</span>`;
        return `<tr class="rowClickable" data-blog-open="${escapeHtml(p.slug)}">
          <td><strong>${escapeHtml(p.title)}</strong><div class="cellMuted">/${locale === "ar" ? "ar/" : ""}blog/${escapeHtml(p.slug)}</div></td>
          <td>${status}</td>
          <td class="dateCell">${escapeHtml(fmtDateCompact(p.publishedAt || p.updatedAt))}</td>
          <td><button type="button" class="btnGhost btnSm" data-blog-open="${escapeHtml(p.slug)}">Edit</button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="cellMuted">No posts yet — create your first article.</td></tr>`;

  els.panels.blog.innerHTML = adminPageStack(`
    <div class="mkStoreHub">
      <div class="mkStoreHubHead">
        <p class="cellMuted mkStoreHubLead">Write articles in <strong>Draft</strong>, preview locally or on the site, then <strong>Publish</strong> to /blog.</p>
        <div class="mkThemePreviewActions">
          <select id="blogLocaleSelect" class="marketingFieldInput" style="width:auto">
            <option value="en"${locale === "en" ? " selected" : ""}>English</option>
            <option value="ar"${locale === "ar" ? " selected" : ""}>Arabic</option>
          </select>
          <button type="button" class="btnPrimary btnSm" id="btnBlogNew">New article</button>
          <a class="btnGhost btnSm" href="${blogSiteOrigin()}${locale === "ar" ? "/ar/blog" : "/blog"}" target="_blank" rel="noopener">View blog ↗</a>
        </div>
      </div>
      <div class="tableWrap">
        <table class="dataTable mkPagesTable">
          <thead><tr><th>Article</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `, { plain: true });
}

export function renderBlogEditor(data, ctx) {
  const { state, els, escapeHtml, adminPageStack } = ctx;
  const slug = data?.slug || state.blogSlug || "";
  const locale = data?.locale || state.blogLocale || "en";
  const content = data?.content || {};
  state.blogLoadedContent = content;

  els.panels.blog.innerHTML = adminPageStack(`
    <div class="blogAdminEditor">
      <div class="mkStoreHubHead">
        <button type="button" class="btnGhost btnSm" id="btnBlogBack">← All articles</button>
        <div class="mkThemePreviewActions">
          <span class="cellMuted">/${locale === "ar" ? "ar/" : ""}blog/${escapeHtml(slug)}</span>
          ${data?.hasDraftChanges ? `<span class="mkStatusPill mkStatusPill--draft">Unsaved draft</span>` : ""}
          ${data?.published ? `<span class="mkStatusPill mkStatusPill--live">Live</span>` : ""}
        </div>
      </div>
      <div class="blogAdminGrid">
        <div class="blogAdminForm">
          <label class="field marketingField"><span>Slug</span><input id="blogSlug" class="marketingFieldInput" value="${escapeHtml(slug)}" ${slug ? "readonly" : ""} placeholder="how-to-hum-to-song" /></label>
          <label class="field marketingField"><span>SEO title</span><input id="blogSeoTitle" class="marketingFieldInput" /></label>
          <label class="field marketingField"><span>SEO description</span><textarea id="blogSeoDescription" class="marketingFieldInput" rows="2"></textarea></label>
          <label class="field marketingField"><span>Headline</span><input id="blogHeroTitle" class="marketingFieldInput" /></label>
          <label class="field marketingField"><span>Lead paragraph</span><textarea id="blogHeroLead" class="marketingFieldInput" rows="3"></textarea></label>
          <label class="field marketingField"><span>Cover image URL</span><input id="blogCoverUrl" class="marketingFieldInput" placeholder="/assets/..." /></label>
          <label class="field marketingField"><span>Cover alt text</span><input id="blogCoverAlt" class="marketingFieldInput" /></label>
          <label class="field marketingField"><span>Tags (comma separated)</span><input id="blogTags" class="marketingFieldInput" placeholder="arabic, guides" /></label>
          <label class="field marketingField"><span>Author</span><input id="blogAuthorName" class="marketingFieldInput" /></label>
          <label class="field marketingField"><span>Body HTML</span><textarea id="blogBodyHtml" class="marketingFieldInput blogBodyEditor" rows="16" placeholder="<p>Your article...</p>"></textarea></label>
          <label class="field marketingField"><span>CTA label</span><input id="blogCtaLabel" class="marketingFieldInput" /></label>
          <label class="field marketingField"><span>CTA link</span><input id="blogCtaHref" class="marketingFieldInput" /></label>
          <div class="mkThemePreviewActions" style="margin-top:12px">
            <button type="button" class="btnPrimary" id="btnBlogSaveDraft">Save draft</button>
            <button type="button" class="btnGhost" id="btnBlogPublish">Publish</button>
            <button type="button" class="btnGhost" id="btnBlogDiscard">Discard draft</button>
            ${slug ? `<button type="button" class="btnGhost blogDeleteBtn" id="btnBlogDelete">Delete</button>` : ""}
          </div>
        </div>
        <div class="blogAdminPreview">
          <div class="mkThemePreviewHead"><span class="mkThemeBadge">Preview</span></div>
          <iframe id="blogPreviewFrame" class="mkThemePreviewFrame blogPreviewFrame" title="Blog preview" src="${blogPreviewUrl(slug || "preview-slug", locale)}"></iframe>
          <p class="cellMuted">Preview updates after Save draft. Uses ${escapeHtml(blogSiteOrigin())}.</p>
        </div>
      </div>
    </div>
  `, { plain: true });

  fillBlogForm(content);

  const frame = document.getElementById("blogPreviewFrame");
  if (frame) {
    frame.addEventListener("load", () => {
      pushBlogDraftPreview(slug, locale, readBlogFormContent());
    });
  }
}

export function renderBlogView(data, ctx) {
  const { state } = ctx;
  if (state.blogScreen === "editor") renderBlogEditor(data, ctx);
  else renderBlogHub(data, ctx);
}

export function bindBlogEvents(ctx) {
  const { state, invalidateViewCache, loadView, showError } = ctx;
  const panel = ctx.els.panels.blog;
  if (!panel || panel.dataset.blogBound) return;
  panel.dataset.blogBound = "1";

  panel.addEventListener("click", async (ev) => {
    const openSlug = ev.target.closest("[data-blog-open]")?.getAttribute("data-blog-open");
    if (openSlug) {
      state.blogScreen = "editor";
      state.blogSlug = openSlug;
      invalidateViewCache("blog");
      void loadView({ force: true });
      return;
    }
    if (ev.target.closest("#btnBlogNew")) {
      state.blogScreen = "editor";
      state.blogSlug = "";
      invalidateViewCache("blog");
      void loadView({ force: true });
      return;
    }
    if (ev.target.closest("#btnBlogBack")) {
      state.blogScreen = "hub";
      state.blogSlug = "";
      invalidateViewCache("blog");
      void loadView({ force: true });
      return;
    }
    if (ev.target.closest("#btnBlogSaveDraft")) {
      try {
        const slugInput = document.getElementById("blogSlug")?.value?.trim();
        const slug = slugInput || state.blogSlug;
        const locale = state.blogLocale || "en";
        const content = readBlogFormContent();
        const action = state.blogSlug ? "draft" : "create";
        const result = await blogAdminAction({ action, slug, locale, content });
        if (action === "create") {
          state.blogSlug = result.slug;
          state.blogScreen = "editor";
        }
        pushBlogDraftPreview(result.slug || slug, locale, content);
        invalidateViewCache("blog");
        void loadView({ force: true });
      } catch (e) {
        showError(e?.message || String(e));
      }
      return;
    }
    if (ev.target.closest("#btnBlogPublish")) {
      try {
        const slug = document.getElementById("blogSlug")?.value?.trim() || state.blogSlug;
        const locale = state.blogLocale || "en";
        const content = readBlogFormContent();
        await blogAdminAction({ action: "publish", slug, locale, content });
        invalidateViewCache("blog");
        void loadView({ force: true });
      } catch (e) {
        showError(e?.message || String(e));
      }
      return;
    }
    if (ev.target.closest("#btnBlogDiscard")) {
      try {
        const slug = state.blogSlug;
        if (!slug) return;
        await blogAdminAction({ action: "discard", slug, locale: state.blogLocale || "en" });
        invalidateViewCache("blog");
        void loadView({ force: true });
      } catch (e) {
        showError(e?.message || String(e));
      }
      return;
    }
    if (ev.target.closest("#btnBlogDelete")) {
      if (!confirm("Delete this article permanently?")) return;
      try {
        await blogAdminDelete(state.blogSlug, state.blogLocale || "en");
        state.blogScreen = "hub";
        state.blogSlug = "";
        invalidateViewCache("blog");
        void loadView({ force: true });
      } catch (e) {
        showError(e?.message || String(e));
      }
    }
  });

  panel.addEventListener("change", (ev) => {
    if (ev.target.id === "blogLocaleSelect") {
      state.blogLocale = ev.target.value || "en";
      state.blogScreen = "hub";
      state.blogSlug = "";
      invalidateViewCache("blog");
      void loadView({ force: true });
    }
  });
}

export function setBlogAdminToken(token) {
  window.__NABAD_ADMIN_TOKEN__ = token || "";
}
