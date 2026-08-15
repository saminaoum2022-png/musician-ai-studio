/**
 * Hydrate marketing pages from /api/marketing/content (CMS with HTML fallbacks).
 */
(function () {
  var PAGE = document.documentElement.getAttribute("data-marketing-page") || "home";
  var LOCALE = document.documentElement.lang || "en";
  var DRAFT_KEY = "nabad_marketing_draft:" + PAGE + ":" + LOCALE;

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

  function setAttr(sel, attr, value) {
    var el = document.querySelector(sel);
    if (!el || value == null || value === "") return;
    el.setAttribute(attr, value);
  }

  function setImageSrc(sel, value) {
    var el = document.querySelector(sel);
    if (!el || value == null || value === "") return;
    var next = String(value).trim();
    var cur = String(el.getAttribute("src") || "").trim();
    if (cur === next) return;
    el.setAttribute("src", next);
  }

  function usesHeroImageProxy(el) {
    if (!el) return false;
    return String(el.getAttribute("src") || "").indexOf("/api/marketing/hero-image") === 0;
  }

  function setMeta(name, content, isProperty) {
    if (!content) return;
    var sel = isProperty
      ? 'meta[property="' + name + '"]'
      : 'meta[name="' + name + '"]';
    var el = document.querySelector(sel);
    if (el) el.setAttribute("content", content);
  }

  function applyDraftContent(content) {
    if (!content) return;
    applyCore(content);
    if (PAGE === "home") applyHomeExtras(content);
  }

  function showDraftBanner() {
    if (document.getElementById("nabadMarketingDraftBanner")) return;
    var bar = document.createElement("div");
    bar.id = "nabadMarketingDraftBanner";
    bar.className = "marketingDraftBanner";
    bar.textContent = "Draft preview — not visible to visitors until you Save & publish in admin.";
    document.body.appendChild(bar);
  }

  function applyRelated(related) {
    if (!related) return;
    setText("[data-mk='related.title']", related.title);
    var nav = document.querySelector("[data-mk-related-links]");
    if (!nav || !Array.isArray(related.links)) return;
    nav.innerHTML = related.links.map(function (link) {
      if (!link || !link.label || !link.href) return "";
      return '<a href="' + link.href.replace(/"/g, "&quot;") + '">' + link.label + "</a>";
    }).join("");
  }

  function applyCore(c) {
    if (c.seo) {
      if (c.seo.title) document.title = c.seo.title;
      setMeta("description", c.seo.description, false);
      setMeta("og:title", c.seo.title, true);
      setMeta("og:description", c.seo.description, true);
      setMeta("twitter:title", c.seo.title, false);
      setMeta("twitter:description", c.seo.description, false);
    }

    if (c.hero) {
      setText("[data-mk='hero.eyebrow']", c.hero.eyebrow);
      setText("[data-mk='hero.title']", c.hero.title);
      setText("[data-mk='hero.lead']", c.hero.lead);
      setText("[data-mk='hero.cta']", c.hero.ctaLabel);
      setAttr("[data-mk='hero.cta']", "href", c.hero.ctaHref);
      setText("[data-mk='hero.secondary']", c.hero.secondaryLabel);
      setAttr("[data-mk='hero.secondary']", "href", c.hero.secondaryHref);
      var heroEl = document.querySelector("[data-mk='hero.image']");
      if (heroEl && c.hero.heroImageUrl && !usesHeroImageProxy(heroEl)) {
        setImageSrc("[data-mk='hero.image']", c.hero.heroImageUrl);
      }
      setAttr("[data-mk='hero.image']", "alt", c.hero.heroImageAlt);
    }

    if (c.features) {
      setText("[data-mk='features.eyebrow']", c.features.eyebrow);
      setText("[data-mk='features.title']", c.features.title);
      var cards = document.querySelectorAll("[data-mk-feature-card]");
      if (Array.isArray(c.features.cards)) {
        c.features.cards.forEach(function (card, i) {
          var node = cards[i];
          if (!node || !card) return;
          var h = node.querySelector("[data-mk='feature.title']");
          var p = node.querySelector("[data-mk='feature.body']");
          if (h && card.title) h.textContent = card.title;
          if (p && card.body) p.textContent = card.body;
          var linksWrap = node.querySelector("[data-mk-feature-links]");
          if (linksWrap && Array.isArray(card.links) && card.links.length) {
            linksWrap.innerHTML = card.links.map(function (link) {
              if (!link || !link.label || !link.href) return "";
              return '<a class="featureCardLink" href="' + link.href.replace(/"/g, "&quot;") + '">' + link.label + "</a>";
            }).join("");
          }
        });
      }
    }

    if (c.faq) {
      setText("[data-mk='faq.title']", c.faq.title);
      var faqNodes = document.querySelectorAll("[data-mk-faq-item]");
      if (Array.isArray(c.faq.items)) {
        c.faq.items.forEach(function (item, i) {
          var node = faqNodes[i];
          if (!node || !item) return;
          var h = node.querySelector("[data-mk='faq.q']");
          var p = node.querySelector("[data-mk='faq.a']");
          if (h && item.question) h.textContent = item.question;
          if (p && item.answerHtml) p.innerHTML = item.answerHtml;
        });
      }
    }

    if (c.finalCta) {
      setText("[data-mk='final.title']", c.finalCta.title);
      setText("[data-mk='final.body']", c.finalCta.body);
      setText("[data-mk='final.cta']", c.finalCta.ctaLabel);
      setAttr("[data-mk='final.cta']", "href", c.finalCta.ctaHref);
    }

    applyRelated(c.related);
  }

  var SOCIAL_ICON_BASE = "/assets/marketing/social/";

  function applyFooter(footer) {
    if (!footer || !Array.isArray(footer.social)) return;
    var nav = document.querySelector("[data-mk-footer-social]");
    if (!nav) return;
    nav.innerHTML = footer.social.map(function (item) {
      if (!item || !item.platform) return "";
      var label = item.label || item.platform;
      var icon = SOCIAL_ICON_BASE + item.platform + ".svg";
      var inner = '<img src="' + icon + '" width="20" height="20" alt="">';
      if (item.href) {
        return '<a href="' + item.href.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener noreferrer" aria-label="' + label.replace(/"/g, "&quot;") + '">' + inner + "</a>";
      }
      return '<span class="marketingFooterSocialIcon marketingFooterSocialIcon--idle" aria-label="' + label.replace(/"/g, "&quot;") + '">' + inner + "</span>";
    }).join("");
  }

  function renderDiscoverCarousel(songs) {
    var wrap = document.querySelector("[data-mk-discover-carousel-wrap]");
    var root = document.querySelector("[data-mk-discover-carousel]");
    if (!wrap || !root) return;
    if (!Array.isArray(songs) || !songs.length) {
      wrap.hidden = true;
      root.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    root.innerHTML = songs.map(function (song) {
      if (!song || !song.id) return "";
      var href = song.shareUrl || ("/s/" + encodeURIComponent(song.id));
      var art = song.artUrl || "/assets/marketing/nabadai-social-card.png";
      var title = song.title || "Untitled";
      var by = song.username ? "@" + song.username : (song.byLine || "");
      return (
        '<a class="discoverCarouselCard" href="' + href.replace(/"/g, "&quot;") + '">' +
          '<span class="discoverCarouselArt"><img src="' + art.replace(/"/g, "&quot;") + '" alt="" loading="lazy"></span>' +
          '<span class="discoverCarouselMeta">' +
            '<span class="discoverCarouselTitle">' + title.replace(/</g, "&lt;") + "</span>" +
            (by ? '<span class="discoverCarouselBy">' + by.replace(/</g, "&lt;") + "</span>" : "") +
          "</span>" +
        "</a>"
      );
    }).join("");
  }

  function fetchFeaturedDiscoverSongs(ids) {
    if (!Array.isArray(ids) || !ids.length) return Promise.resolve([]);
    return fetch("/api/marketing/featured-discover?ids=" + encodeURIComponent(ids.join(",")), {
      credentials: "omit",
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && data.ok && Array.isArray(data.songs)) ? data.songs : []; })
      .catch(function () { return []; });
  }

  function applyHomeExtras(c) {
    if (c.discover) {
      setText("[data-mk='discover.eyebrow']", c.discover.eyebrow);
      setText("[data-mk='discover.title']", c.discover.title);
      setText("[data-mk='discover.lead']", c.discover.lead);
      setText("[data-mk='discover.cta']", c.discover.ctaLabel);
      setAttr("[data-mk='discover.cta']", "href", c.discover.ctaHref);
      if (Array.isArray(c.discover.featuredSongs) && c.discover.featuredSongs.length) {
        renderDiscoverCarousel(c.discover.featuredSongs);
      } else if (Array.isArray(c.discover.featuredSongIds) && c.discover.featuredSongIds.length) {
        fetchFeaturedDiscoverSongs(c.discover.featuredSongIds).then(renderDiscoverCarousel);
      } else {
        renderDiscoverCarousel([]);
      }
    }
    if (c.pricing) {
      setText("[data-mk='pricing.eyebrow']", c.pricing.eyebrow);
      setText("[data-mk='pricing.title']", c.pricing.title);
      if (c.pricing.free) {
        setText("[data-mk='pricing.free.title']", c.pricing.free.title);
        setText("[data-mk='pricing.free.price']", c.pricing.free.price);
        setText("[data-mk='pricing.free.body']", c.pricing.free.body);
        setText("[data-mk='pricing.free.cta']", c.pricing.free.ctaLabel);
        setAttr("[data-mk='pricing.free.cta']", "href", c.pricing.free.ctaHref);
      }
      if (c.pricing.pro) {
        setText("[data-mk='pricing.pro.title']", c.pricing.pro.title);
        setText("[data-mk='pricing.pro.price']", c.pricing.pro.price);
        setText("[data-mk='pricing.pro.body']", c.pricing.pro.body);
        setText("[data-mk='pricing.pro.cta']", c.pricing.pro.ctaLabel);
        setAttr("[data-mk='pricing.pro.cta']", "href", c.pricing.pro.ctaHref);
      }
    }
    applyFooter(c.footer);
  }

  function applyDraftQueryParams(params) {
    var heroImg = params.get("heroImg");
    var heroAlt = params.get("heroAlt");
    if (heroImg) {
      setImageSrc("[data-mk='hero.image']", heroImg);
      if (heroAlt) setAttr("[data-mk='hero.image']", "alt", heroAlt);
    }
  }

  function isAllowedDraftOrigin(origin) {
    return [
      "https://www.nabadai.com",
      "https://admin.nabadai.com",
      "https://nabadai.com",
      window.location.origin,
    ].indexOf(origin) !== -1;
  }

  function applyDraftFromSession() {
    var params = new URLSearchParams(window.location.search || "");
    if (params.get("preview") !== "draft") return false;
    showDraftBanner();
    applyDraftQueryParams(params);
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        var draft = JSON.parse(raw);
        if (
          draft
          && draft.content
          && (!draft.page || draft.page === PAGE)
          && (!draft.locale || draft.locale === LOCALE)
        ) {
          applyDraftContent(draft.content);
        }
      }
    } catch (e) { /* ignore */ }

    window.addEventListener("message", function (e) {
      if (!isAllowedDraftOrigin(e.origin)) return;
      if (e.data && e.data.type === "nabad-marketing-draft" && e.data.payload && e.data.payload.content) {
        var payload = e.data.payload;
        if (payload.page && payload.page !== PAGE) return;
        if (payload.locale && payload.locale !== LOCALE) return;
        applyDraftContent(payload.content);
      }
    });

    if (window.opener) {
      try {
        window.opener.postMessage({ type: "nabad-marketing-preview-ready" }, "*");
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  if (applyDraftFromSession()) return;

  fetch("/api/marketing/content?page=" + encodeURIComponent(PAGE) + "&locale=" + encodeURIComponent(LOCALE), {
    credentials: "omit",
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok || !data.content) return;
      applyCore(data.content);
      if (PAGE === "home") applyHomeExtras(data.content);
    })
    .catch(function () { /* keep static HTML fallbacks */ });
})();
