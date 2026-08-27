/**
 * Hydrate /blog index from /api/blog/posts
 */
(function () {
  var LOCALE = document.documentElement.lang || "en";
  var grid = document.getElementById("blogPostGrid");
  var empty = document.getElementById("blogEmptyState");
  if (!grid) return;

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(LOCALE.indexOf("ar") === 0 ? "ar" : "en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function postHref(slug) {
    return LOCALE.indexOf("ar") === 0 ? "/ar/blog/" + encodeURIComponent(slug) : "/blog/" + encodeURIComponent(slug);
  }

  function renderPosts(posts) {
    if (!posts || !posts.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = posts.map(function (p) {
      var cover = p.coverImageUrl
        ? '<img class="blogCardCover" src="' + escapeHtml(p.coverImageUrl) + '" alt="' + escapeHtml(p.coverImageAlt || p.title) + '" loading="lazy" />'
        : '<div class="blogCardCover blogCardCover--placeholder" aria-hidden="true"></div>';
      var tags = (p.tags || []).slice(0, 3).map(function (t) {
        return '<span class="blogTag">' + escapeHtml(t) + "</span>";
      }).join("");
      return (
        '<article class="blogCard">' +
        '<a class="blogCardLink" href="' + postHref(p.slug) + '">' +
        cover +
        '<div class="blogCardBody">' +
        (tags ? '<div class="blogCardTags">' + tags + "</div>" : "") +
        "<h2>" + escapeHtml(p.title) + "</h2>" +
        "<p>" + escapeHtml(p.excerpt) + "</p>" +
        '<time class="blogCardDate" datetime="' + escapeHtml(p.publishedAt || "") + '">' + escapeHtml(fmtDate(p.publishedAt)) + "</time>" +
        "</div></a></article>"
      );
    }).join("");
  }

  fetch("/api/blog/posts?locale=" + encodeURIComponent(LOCALE) + "&limit=24", { credentials: "omit" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) renderPosts(data.posts || []);
      else if (empty) empty.hidden = false;
    })
    .catch(function () {
      if (empty) empty.hidden = false;
    });
})();
