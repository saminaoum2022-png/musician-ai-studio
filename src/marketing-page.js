/**
 * Hydrate marketing pages from /api/marketing/content (CMS with HTML fallbacks).
 */
(function () {
  var PAGE = document.documentElement.getAttribute("data-marketing-page") || "home";
  var LOCALE = document.documentElement.lang || "en";
  var DRAFT_KEY = "nabad_marketing_draft:" + PAGE + ":" + LOCALE;

  function formatHeroTitleHtml(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    if (LOCALE.indexOf("ar") === 0) return t;
    return t
      .replace(/\b(hum\.?)\b/i, '<span class="heroAccent">$1</span>')
      .replace(/\.\s+Share/i, ".<br>Share");
  }

  function applyHeroTitle(value) {
    var el = document.querySelector("[data-mk='hero.title']");
    if (!el || value == null || value === "") return;
    var html = formatHeroTitleHtml(value);
    if (html.indexOf("<") !== -1) el.innerHTML = html;
    else el.textContent = value;
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

  function applyHeroAlt(alt) {
    if (alt == null || alt === "") return;
    setAttr("[data-mk='hero.image']", "alt", alt);
    setMeta("og:image:alt", alt, true);
  }

  function fetchHeroMeta() {
    var heroEl = document.querySelector("[data-mk='hero.image']");
    if (!heroEl) return;
    fetch("/api/marketing/hero-meta?page=" + encodeURIComponent(PAGE) + "&locale=" + encodeURIComponent(LOCALE), {
      credentials: "omit",
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.alt) applyHeroAlt(data.alt);
      })
      .catch(function () { /* keep static HTML alt */ });
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

  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function lightenHex(hex, amount) {
    var rgb = hexToRgb(hex);
    if (!rgb) return hex;
    function mix(c) { return Math.min(255, Math.round(c + (255 - c) * amount)); }
    return "#" + [mix(rgb.r), mix(rgb.g), mix(rgb.b)].map(function (c) {
      return c.toString(16).padStart(2, "0");
    }).join("");
  }

  var FONT_STACKS = {
    "inter-display": '"Inter Display", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    inter: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  };

  function applyBrand(brand) {
    if (!brand) return;
    var cta = brand.ctaColor || "#23d5ab";
    var ctaText = brand.ctaTextColor || "#051018";
    var violet = brand.accentViolet || "#7c5cff";
    var ctaHover = lightenHex(cta, 0.12);
    var violetHover = lightenHex(violet, 0.12);
    var heading = FONT_STACKS[brand.headingFont] || FONT_STACKS["inter-display"];
    var body = FONT_STACKS[brand.bodyFont] || FONT_STACKS.inter;
    var root = document.documentElement;

    root.style.setProperty("--brand-teal", cta);
    root.style.setProperty("--brand-teal-hover", ctaHover);
    root.style.setProperty("--brand-violet", violet);
    root.style.setProperty("--brand-violet-hover", violetHover);
    root.style.setProperty("--brand-cta-bg", cta);
    root.style.setProperty("--brand-cta-bg-hover", ctaHover);
    root.style.setProperty("--brand-cta-text", ctaText);
    var ctaRgb = hexToRgb(cta) || { r: 35, g: 213, b: 171 };
    var violetRgb = hexToRgb(violet) || { r: 124, g: 92, b: 255 };
    root.style.setProperty("--brand-teal-muted", "rgba(" + ctaRgb.r + ", " + ctaRgb.g + ", " + ctaRgb.b + ", 0.14)");
    root.style.setProperty("--brand-violet-muted", "rgba(" + violetRgb.r + ", " + violetRgb.g + ", " + violetRgb.b + ", 0.14)");

    var styleId = "nabadMarketingBrandOverrides";
    var el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = [
      "body { font-family: " + body + "; }",
      ".marketingHeroTitle, .marketingSectionTitle, .marketingNavBrand, .marketingFinalTitle, h1, h2 { font-family: " + heading + "; }",
    ].join("\n");
  }

  function applyCore(c) {
    if (c.brand) applyBrand(c.brand);
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
      applyHeroTitle(c.hero.title);
      setText("[data-mk='hero.lead']", c.hero.lead);
      setText("[data-mk='hero.cta']", c.hero.ctaLabel);
      setAttr("[data-mk='hero.cta']", "href", c.hero.ctaHref);
      setText("[data-mk='hero.secondary']", c.hero.secondaryLabel);
      setAttr("[data-mk='hero.secondary']", "href", c.hero.secondaryHref);
      var heroEl = document.querySelector("[data-mk='hero.image']");
      if (heroEl && c.hero.heroImageUrl && !usesHeroImageProxy(heroEl)) {
        setImageSrc("[data-mk='hero.image']", c.hero.heroImageUrl);
      }
      applyHeroAlt(c.hero.heroImageAlt);
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
          if (linksWrap) {
            if (Array.isArray(card.links) && card.links.length) {
              linksWrap.innerHTML = card.links.map(function (link) {
                if (!link || !link.label || !link.href) return "";
                return '<a class="featureCardLink" href="' + link.href.replace(/"/g, "&quot;") + '">' + link.label + "</a>";
              }).join("");
              linksWrap.hidden = false;
            } else {
              linksWrap.innerHTML = "";
              linksWrap.hidden = true;
            }
          }
        });
      }
    }

    if (c.faq) {
      setText("[data-mk='faq.title']", c.faq.title);
      setText("[data-mk='faq.lead']", c.faq.lead);
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
      var inner = '<img class="marketingFooterSocialImg marketingFooterSocialImg--' + item.platform + '" src="' + icon + '" width="18" height="18" alt="">';
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
    setupScrollReveal(root);
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

  function applyTemplates(t) {
    if (!t) return;
    setText("[data-mk='templates.eyebrow']", t.eyebrow);
    setText("[data-mk='templates.title']", t.title);
    setText("[data-mk='templates.lead']", t.lead);
    setText("[data-mk='templates.cta']", t.ctaLabel);
    setAttr("[data-mk='templates.cta']", "href", t.ctaHref);
    if (t.imageUrl) setImageSrc("[data-mk='templates.image']", t.imageUrl);
    if (t.imageAlt) setAttr("[data-mk='templates.image']", "alt", t.imageAlt);
    var cards = document.querySelectorAll("[data-mk-template-card]");
    var tones = ["birthday", "wedding", "love", "apology", "thanks", "arabic"];
    if (Array.isArray(t.cards)) {
      t.cards.forEach(function (card, i) {
        var node = cards[i];
        if (!node || !card) return;
        tones.forEach(function (tone) {
          node.classList.remove("marketingOccasionCard--" + tone);
        });
        if (card.tone) node.classList.add("marketingOccasionCard--" + card.tone);
        if (card.href) node.setAttribute("href", card.href);
        var img = node.querySelector("[data-mk='template.image']");
        var h = node.querySelector("[data-mk='template.title']");
        var p = node.querySelector("[data-mk='template.body']");
        if (img && card.imageUrl) img.setAttribute("src", card.imageUrl);
        if (h && card.title) h.textContent = card.title;
        if (p && card.body) p.textContent = card.body;
      });
    }
  }

  function applyCollab(c) {
    if (!c) return;
    setText("[data-mk='collab.eyebrow']", c.eyebrow);
    setText("[data-mk='collab.title']", c.title);
    setText("[data-mk='collab.lead']", c.lead);
    setText("[data-mk='collab.ctaPrimary']", c.ctaPrimaryLabel);
    setAttr("[data-mk='collab.ctaPrimary']", "href", c.ctaPrimaryHref);
    setText("[data-mk='collab.ctaSecondary']", c.ctaSecondaryLabel);
    setAttr("[data-mk='collab.ctaSecondary']", "href", c.ctaSecondaryHref);
    if (c.imageUrl) setImageSrc("[data-mk='collab.image']", c.imageUrl);
    if (c.imageAlt) setAttr("[data-mk='collab.image']", "alt", c.imageAlt);
    var points = document.querySelectorAll("[data-mk-collab-item]");
    if (Array.isArray(c.points)) {
      c.points.forEach(function (point, i) {
        var node = points[i];
        if (!node || !point) return;
        var h = node.querySelector("[data-mk='collab.point.title']");
        var p = node.querySelector("[data-mk='collab.point.body']");
        if (h && point.title) h.textContent = point.title;
        if (p && point.body) p.textContent = point.body;
      });
    }
  }

  function renderPricingFeatures(tierKey, features) {
    if (!Array.isArray(features) || !features.length) return;
    var list = document.querySelector('[data-mk-pricing-features="' + tierKey + '"]');
    if (!list) return;
    list.innerHTML = "";
    features.forEach(function (f) {
      var li = document.createElement("li");
      li.className = "pricingFeature";
      var text = f.label || "";
      if (f.sub) text = text ? text + " · " + f.sub : f.sub;
      li.textContent = text;
      list.appendChild(li);
    });
  }

  function applyPricingTier(tierKey, tier) {
    if (!tier) return;
    setText("[data-mk='pricing." + tierKey + ".title']", tier.title);
    setText("[data-mk='pricing." + tierKey + ".price']", tier.price);
    setText("[data-mk='pricing." + tierKey + ".body']", tier.body);
    setText("[data-mk='pricing." + tierKey + ".cta']", tier.ctaLabel);
    setAttr("[data-mk='pricing." + tierKey + ".cta']", "href", tier.ctaHref);
    if (tierKey === "pro") setText("[data-mk='pricing.pro.finePrint']", tier.finePrint);
    renderPricingFeatures(tierKey, tier.features);
  }

  function applyHomeExtras(c) {
    if (c.templates) applyTemplates(c.templates);
    if (c.collab) applyCollab(c.collab);
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
      if (c.pricing.free) applyPricingTier("free", c.pricing.free);
      if (c.pricing.pro) applyPricingTier("pro", c.pricing.pro);
    }
    applyFooter(c.footer);
  }

  function applyDraftQueryParams(params) {
    var heroImg = params.get("heroImg");
    var heroAlt = params.get("heroAlt");
    if (heroImg) {
      setImageSrc("[data-mk='hero.image']", heroImg);
      if (heroAlt) applyHeroAlt(heroAlt);
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

  var scrollRevealObserver = null;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function markScrollReveal(el, variant, delayMs) {
    if (!el || el.classList.contains("mkReveal") || !scrollRevealObserver) return;
    el.classList.add("mkReveal", "mkReveal--" + variant);
    if (delayMs) el.style.setProperty("--mk-reveal-delay", delayMs + "ms");
    scrollRevealObserver.observe(el);
  }

  function setupScrollReveal(root) {
    if (!scrollRevealObserver) return;
    root = root || document;

    root.querySelectorAll(".section .sectionHead").forEach(function (el) {
      markScrollReveal(el, "up", 0);
    });

    root.querySelectorAll(".featureGrid .featureCard").forEach(function (el, i) {
      var col = i % 3;
      var variant = col === 0 ? "from-start" : col === 1 ? "up" : "from-end";
      markScrollReveal(el, variant, col * 90);
    });

    root.querySelectorAll(".faqList .faqItem").forEach(function (el, i) {
      markScrollReveal(el, "up", Math.min(i, 5) * 70);
    });

    root.querySelectorAll(".pricingGrid .pricingCard").forEach(function (el, i) {
      markScrollReveal(el, i === 0 ? "from-start" : "from-end", i * 100);
    });

    root.querySelectorAll(".finalCta").forEach(function (el) {
      markScrollReveal(el, "up", 0);
    });

    root.querySelectorAll(".relatedLinks a").forEach(function (el, i) {
      markScrollReveal(el, "up", Math.min(i, 4) * 60);
    });

    root.querySelectorAll(".discoverCarouselCard").forEach(function (el, i) {
      markScrollReveal(el, "up", Math.min(i, 6) * 80);
    });

    root.querySelectorAll(".marketingOccasionCard").forEach(function (el, i) {
      var col = i % 3;
      var variant = col === 0 ? "from-start" : col === 1 ? "up" : "from-end";
      markScrollReveal(el, variant, col * 75);
    });

    root.querySelectorAll(".marketingSplitCopy").forEach(function (el) {
      markScrollReveal(el, "from-start", 0);
    });

    root.querySelectorAll(".marketingSplitMedia").forEach(function (el) {
      markScrollReveal(el, "from-end", 100);
    });

    root.querySelectorAll(".marketingCollabItem").forEach(function (el, i) {
      markScrollReveal(el, "up", i * 90);
    });
  }

  function initScrollReveal() {
    if (prefersReducedMotion()) return;
    scrollRevealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          scrollRevealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    setupScrollReveal(document);
  }

  fetchHeroMeta();
  initScrollReveal();

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
