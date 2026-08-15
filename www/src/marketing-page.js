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
      setAttr("[data-mk='hero.image']", "src", c.hero.heroImageUrl);
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

  function applyHomeExtras(c) {
    if (c.discover) {
      setText("[data-mk='discover.eyebrow']", c.discover.eyebrow);
      setText("[data-mk='discover.title']", c.discover.title);
      setText("[data-mk='discover.lead']", c.discover.lead);
      setText("[data-mk='discover.cta']", c.discover.ctaLabel);
      setAttr("[data-mk='discover.cta']", "href", c.discover.ctaHref);
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
  }

  function applyDraftQueryParams(params) {
    var heroImg = params.get("heroImg");
    var heroAlt = params.get("heroAlt");
    if (heroImg) {
      setAttr("[data-mk='hero.image']", "src", heroImg);
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
