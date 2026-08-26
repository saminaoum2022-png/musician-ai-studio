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
    applyMarketingBlocks(content, { draftEditor: true });
    applySectionLayout(content);
  }

  var draftEditorMode = false;
  var inspectorHoverSection = null;
  var inspectorActiveSection = null;

  var MK_SECTION_LABELS = {
    hero: "Hero",
    features: "Features",
    templates: "Song templates",
    discover: "Discover teaser",
    collab: "Creators & voices",
    pricing: "Pricing",
    faq: "FAQ",
    related: "Related pages",
    final: "Final CTA",
    finalCta: "Final CTA",
    testimonials: "Testimonials",
    logoStrip: "Logo strip",
    mediaBlock: "Photo & copy",
    contentCarousel: "Image carousel",
  };

  function enableDraftEditorMode() {
    if (draftEditorMode) return;
    draftEditorMode = true;
    document.documentElement.classList.add("nabad-draft-editor");
    setupDraftSectionInspector();
  }

  function sectionLabelFor(row, block) {
    if (block && block.title) return String(block.title).trim();
    if (row && row.type && MK_SECTION_LABELS[row.type]) return MK_SECTION_LABELS[row.type];
    if (row && row.id && MK_SECTION_LABELS[row.id]) return MK_SECTION_LABELS[row.id];
    return row && row.id ? row.id : "Section";
  }

  function imagePlaceholderHtml(label) {
    return (
      '<span class="marketingImagePlaceholder" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
          '<circle cx="8.5" cy="10" r="1.5"/>' +
          '<path d="M21 16l-5.5-5.5L9 17"/>' +
        "</svg>" +
        '<span class="marketingImagePlaceholderLabel">' + escHtml(label || "Add image") + "</span>" +
      "</span>"
    );
  }

  var cmsCarouselTimers = {};

  function clearCmsCarouselTimers() {
    Object.keys(cmsCarouselTimers).forEach(function (key) {
      clearInterval(cmsCarouselTimers[key]);
      delete cmsCarouselTimers[key];
    });
  }

  function escHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function renderTestimonialsBlock(el, block, opts) {
    opts = opts || {};
    var draftEditor = opts.draftEditor === true;
    var items = Array.isArray(block.items) ? block.items.slice() : [];
    if (draftEditor && items.length < 3) {
      while (items.length < 3) {
        items.push({ quote: "", name: "Creator name", role: "Role", _placeholder: true });
      }
    }
    el.className = "section marketingCmsBlock marketingTestimonials";
    el.innerHTML =
      '<header class="sectionHead sectionHead--center">' +
        (block.eyebrow ? '<p class="eyebrow">' + escHtml(block.eyebrow) + "</p>" : (draftEditor ? '<p class="eyebrow marketingPlaceholderLine">Eyebrow</p>' : "")) +
        (block.title ? "<h2>" + escHtml(block.title) + "</h2>" : (draftEditor ? '<h2 class="marketingPlaceholderLine">Section title</h2>' : "")) +
      "</header>" +
      '<div class="marketingTestimonialGrid">' +
        items.map(function (it) {
          var quote = it.quote || (draftEditor ? "Quote text will appear here." : "");
          if (!quote && !draftEditor) return "";
          var cardClass = "marketingTestimonialCard" + (it._placeholder ? " marketingTestimonialCard--placeholder" : "");
          return (
            '<blockquote class="' + cardClass + '">' +
              '<p class="marketingTestimonialQuote">“' + escHtml(quote) + "”</p>" +
              '<footer><strong>' + escHtml(it.name || "Name") + "</strong>" +
              (it.role || draftEditor ? '<span class="cellMuted">' + escHtml(it.role || "Role") + "</span>" : "") +
              "</footer></blockquote>"
          );
        }).join("") +
      "</div>";
  }

  function renderLogoStripBlock(el, block, opts) {
    opts = opts || {};
    var draftEditor = opts.draftEditor === true;
    var logos = Array.isArray(block.logos) ? block.logos : [];
    if (draftEditor && logos.length < 3) {
      while (logos.length < 3) logos.push({ label: "Logo", imageUrl: "", href: "" });
    }
    el.className = "section marketingCmsBlock marketingLogoStrip";
    el.innerHTML =
      (block.title ? '<p class="marketingLogoStripTitle">' + escHtml(block.title) + "</p>" : (draftEditor ? '<p class="marketingLogoStripTitle marketingPlaceholderLine">Section label</p>' : "")) +
      '<div class="marketingLogoStripRow">' +
        logos.map(function (logo) {
          var inner = logo.imageUrl
            ? '<img src="' + escHtml(logo.imageUrl) + '" alt="' + escHtml(logo.label || "") + '" loading="lazy">'
            : (draftEditor
              ? imagePlaceholderHtml(logo.label || "Logo")
              : '<span class="marketingLogoPlaceholder">' + escHtml(logo.label || "Logo") + "</span>");
          if (logo.href && !draftEditor) {
            return '<a class="marketingLogoItem" href="' + escHtml(logo.href) + '" target="_blank" rel="noopener">' + inner + "</a>";
          }
          return '<span class="marketingLogoItem">' + inner + "</span>";
        }).join("") +
      "</div>";
  }

  function renderMediaBlock(el, block, opts) {
    opts = opts || {};
    var draftEditor = opts.draftEditor === true;
    var imageLeft = block.imagePosition === "left";
    el.className = "section marketingCmsBlock marketingMediaBlock" + (imageLeft ? " marketingMediaBlock--imageLeft" : "");
    var imageHtml = block.imageUrl
      ? '<figure class="marketingMediaBlockArt"><img src="' + escHtml(block.imageUrl) + '" alt="' + escHtml(block.imageAlt || "") + '" loading="lazy"></figure>'
      : (draftEditor ? '<figure class="marketingMediaBlockArt marketingMediaBlockArt--placeholder">' + imagePlaceholderHtml("Upload photo") + "</figure>" : "");
    var copyHtml =
      '<div class="marketingMediaBlockCopy">' +
        (block.eyebrow ? '<p class="eyebrow">' + escHtml(block.eyebrow) + "</p>" : (draftEditor ? '<p class="eyebrow marketingPlaceholderLine">Eyebrow</p>' : "")) +
        (block.title ? "<h2>" + escHtml(block.title) + "</h2>" : (draftEditor ? '<h2 class="marketingPlaceholderLine">Section title</h2>' : "")) +
        (block.body ? '<p class="sectionLead">' + escHtml(block.body) + "</p>" : (draftEditor ? '<p class="sectionLead marketingPlaceholderLine">Supporting copy for this block.</p>' : "")) +
      "</div>";
    el.innerHTML = imageLeft ? imageHtml + copyHtml : copyHtml + imageHtml;
  }

  function initContentCarousel(root, block) {
    if (!root || !block) return;
    var track = root.querySelector(".marketingContentCarouselTrack");
    if (!track) return;
    var slides = track.querySelectorAll(".marketingContentCarouselSlide");
    if (!slides.length) return;
    var visible = Math.min(Number(block.visibleCount) || 3, slides.length);
    var idx = 0;
    function apply() {
      var slideWidth = 100 / visible;
      track.style.width = (slides.length * slideWidth) + "%";
      slides.forEach(function (slide) {
        slide.style.flex = "0 0 " + slideWidth + "%";
      });
      track.style.transform = "translateX(-" + (idx * slideWidth) + "%)";
    }
    apply();
    if (cmsCarouselTimers[block.id]) {
      clearInterval(cmsCarouselTimers[block.id]);
      delete cmsCarouselTimers[block.id];
    }
    if (block.autoSlide !== false && slides.length > visible) {
      cmsCarouselTimers[block.id] = setInterval(function () {
        idx = (idx + 1) % (slides.length - visible + 1);
        apply();
      }, Math.max(2000, Number(block.intervalMs) || 5000));
    }
  }

  function renderContentCarouselBlock(el, block, opts) {
    opts = opts || {};
    var draftEditor = opts.draftEditor === true;
    var items = Array.isArray(block.items) ? block.items.slice() : [];
    var visible = Math.min(Math.max(Number(block.visibleCount) || 3, 1), 6);
    if (draftEditor) {
      while (items.length < visible) {
        items.push({ title: "Slide " + (items.length + 1), body: "", imageUrl: "", href: "", _placeholder: true });
      }
    }
    var sizeClass = block.size === "large" ? " marketingContentCarousel--large" : "";
    el.className = "section marketingCmsBlock marketingContentCarousel" + sizeClass;
    el.innerHTML =
      '<header class="sectionHead sectionHead--center">' +
        (block.eyebrow ? '<p class="eyebrow">' + escHtml(block.eyebrow) + "</p>" : (draftEditor ? '<p class="eyebrow marketingPlaceholderLine">Eyebrow</p>' : "")) +
        (block.title ? "<h2>" + escHtml(block.title) + "</h2>" : (draftEditor ? '<h2 class="marketingPlaceholderLine">Carousel title</h2>' : "")) +
        (block.lead ? '<p class="sectionLead">' + escHtml(block.lead) + "</p>" : (draftEditor ? '<p class="sectionLead marketingPlaceholderLine">Optional lead text</p>' : "")) +
      "</header>" +
      '<div class="marketingContentCarouselViewport" data-visible="' + escHtml(String(block.visibleCount || 3)) + '">' +
        '<div class="marketingContentCarouselTrack">' +
          items.map(function (item) {
            var body = item.body ? '<p>' + escHtml(item.body) + "</p>" : (draftEditor && item._placeholder ? '<p class="marketingPlaceholderLine">Slide copy</p>' : "");
            var img = item.imageUrl
              ? '<img src="' + escHtml(item.imageUrl) + '" alt="' + escHtml(item.title || "") + '" loading="lazy">'
              : (draftEditor ? imagePlaceholderHtml(item.title || "Slide") : '<span class="marketingContentCarouselFallback">' + escHtml(item.title || "Slide") + "</span>");
            var slideClass = "marketingContentCarouselSlideInner" + (item._placeholder ? " marketingContentCarouselSlideInner--placeholder" : "");
            var inner = '<div class="' + slideClass + '">' + img + "<h3>" + escHtml(item.title || "Slide") + "</h3>" + body + "</div>";
            if (item.href && !draftEditor) {
              return '<a class="marketingContentCarouselSlide" href="' + escHtml(item.href) + '">' + inner + "</a>";
            }
            return '<article class="marketingContentCarouselSlide">' + inner + "</article>";
          }).join("") +
        "</div></div>";
    initContentCarousel(el, block);
  }

  function applyMarketingBlocks(content, opts) {
    opts = opts || {};
    var draftEditor = opts.draftEditor === true || draftEditorMode;
    if (PAGE !== "home" || !content) return;
    clearCmsCarouselTimers();
    var blocks = content.blocks && typeof content.blocks === "object" ? content.blocks : {};
    var sections = Array.isArray(content.sections) ? content.sections : [];
    var main = document.querySelector("main");
    if (!main) return;

    sections.forEach(function (row) {
      if (!row || !row.id || row.enabled === false) return;
      var block = blocks[row.id];
      if (!block) return;
      var el = document.querySelector('[data-mk-section="' + row.id + '"]');
      if (!el) {
        el = document.createElement("section");
        el.setAttribute("data-mk-section", row.id);
        el.setAttribute("data-mk-block-type", row.type);
        main.appendChild(el);
      }
      var renderOpts = { draftEditor: draftEditor };
      if (row.type === "testimonials") renderTestimonialsBlock(el, block, renderOpts);
      else if (row.type === "logoStrip") renderLogoStripBlock(el, block, renderOpts);
      else if (row.type === "mediaBlock") renderMediaBlock(el, block, renderOpts);
      else if (row.type === "contentCarousel") renderContentCarouselBlock(el, block, renderOpts);
      el.setAttribute("data-mk-section-label", sectionLabelFor(row, block));
    });
  }

  function applySectionLayout(content) {
    if (!content || !Array.isArray(content.sections) || !content.sections.length) return;
    var main = document.querySelector("main");
    if (!main) return;
    var blocks = content.blocks && typeof content.blocks === "object" ? content.blocks : {};

    var ordered = content.sections.slice();
    var heroIdx = -1;
    for (var h = 0; h < ordered.length; h += 1) {
      if (ordered[h] && ordered[h].type === "hero") {
        heroIdx = h;
        break;
      }
    }
    if (heroIdx > 0) {
      var heroRow = ordered.splice(heroIdx, 1)[0];
      ordered.unshift(heroRow);
    }

    for (var i = 0; i < ordered.length; i += 1) {
      var row = ordered[i];
      if (!row || !row.id) continue;
      var el = document.querySelector('[data-mk-section="' + row.id + '"]');
      if (!el) continue;
      el.setAttribute("data-mk-section-label", sectionLabelFor(row, blocks[row.id]));
      if (row.enabled === false) {
        el.setAttribute("hidden", "");
      } else {
        el.removeAttribute("hidden");
        main.appendChild(el);
      }
    }
    applyInspectorActiveSection(inspectorActiveSection);
  }

  function postToEditorParent(message) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, "*");
      }
      if (window.opener) {
        window.opener.postMessage(message, "*");
      }
    } catch (e) { /* ignore */ }
  }

  function applyInspectorActiveSection(sectionId) {
    inspectorActiveSection = sectionId || null;
    document.querySelectorAll("[data-mk-section]").forEach(function (el) {
      var on = sectionId && el.getAttribute("data-mk-section") === sectionId;
      el.classList.toggle("mkInspectorActive", Boolean(on));
    });
  }

  function setupDraftSectionInspector() {
    if (document.body.dataset.mkInspectorBound === "1") return;
    document.body.dataset.mkInspectorBound = "1";

    document.addEventListener("mouseover", function (e) {
      if (!draftEditorMode) return;
      var section = e.target.closest("[data-mk-section]:not([hidden])");
      if (inspectorHoverSection && inspectorHoverSection !== section) {
        inspectorHoverSection.classList.remove("mkInspectorHover");
      }
      inspectorHoverSection = section;
      if (section && !section.classList.contains("mkInspectorActive")) {
        section.classList.add("mkInspectorHover");
      }
    }, true);

    document.addEventListener("mouseout", function (e) {
      if (!draftEditorMode) return;
      var section = e.target.closest("[data-mk-section]");
      if (!section) return;
      var related = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest("[data-mk-section]") : null;
      if (related === section) return;
      section.classList.remove("mkInspectorHover");
      if (inspectorHoverSection === section) inspectorHoverSection = null;
    }, true);

    document.addEventListener("click", function (e) {
      if (!draftEditorMode) return;
      var section = e.target.closest("[data-mk-section]:not([hidden])");
      if (!section) return;
      e.preventDefault();
      e.stopPropagation();
      var sectionId = section.getAttribute("data-mk-section");
      applyInspectorActiveSection(sectionId);
      postToEditorParent({ type: "nabad-marketing-section-select", sectionId: sectionId });
    }, true);
  }

  function showDraftBanner() {
    if (document.getElementById("nabadMarketingDraftBanner")) return;
    var bar = document.createElement("div");
    bar.id = "nabadMarketingDraftBanner";
    bar.className = "marketingDraftBanner";
    bar.textContent = "Draft preview — not visible to visitors until you Publish to live in admin.";
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

  var CAROUSEL_PREVIEW_SEC = 30;
  var CAROUSEL_SIGNUP_HREF = "/app/#/intro";
  var TEMPLATE_SHOWCASE_HREF = "/app/#/challenges";
  var carouselPreviewAudio = null;
  var carouselPreviewCardId = null;
  var carouselPreviewStopTimer = null;

  var CAROUSEL_PLAY_SVG =
    '<svg class="discoverCarouselPlayIco" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M8 5v14l11-7z"/>' +
    "</svg>";
  var CAROUSEL_PAUSE_SVG =
    '<svg class="discoverCarouselPlayIco" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>' +
    "</svg>";

  function stopCarouselPreview() {
    if (carouselPreviewStopTimer) {
      clearTimeout(carouselPreviewStopTimer);
      carouselPreviewStopTimer = null;
    }
    if (carouselPreviewAudio) {
      try { carouselPreviewAudio.pause(); } catch (e) {}
      carouselPreviewAudio.removeAttribute("src");
      carouselPreviewAudio.load();
      carouselPreviewAudio = null;
    }
    if (carouselPreviewCardId) {
      var prev = document.querySelector(
        '.discoverCarouselCard[data-song-id="' + carouselPreviewCardId + '"]',
      );
      if (prev) {
        prev.classList.remove("isPreviewPlaying");
        var btn = prev.querySelector(".discoverCarouselPlay");
        if (btn) {
          btn.innerHTML = CAROUSEL_PLAY_SVG;
          btn.setAttribute("aria-label", "Preview song");
        }
      }
      carouselPreviewCardId = null;
    }
  }

  function startCarouselPreview(card, previewUrl, hookStartSec) {
    if (!card || !previewUrl) return;
    var songId = card.getAttribute("data-song-id") || "";
    if (carouselPreviewCardId === songId && carouselPreviewAudio && !carouselPreviewAudio.paused) {
      stopCarouselPreview();
      return;
    }
    stopCarouselPreview();
    carouselPreviewCardId = songId;
    carouselPreviewAudio = new Audio(previewUrl);
    carouselPreviewAudio.preload = "metadata";
    var startAt = Number(hookStartSec);
    if (!Number.isFinite(startAt) || startAt < 0) startAt = 0;
    card.classList.add("isPreviewPlaying");
    var playBtn = card.querySelector(".discoverCarouselPlay");
    if (playBtn) {
      playBtn.innerHTML = CAROUSEL_PAUSE_SVG;
      playBtn.setAttribute("aria-label", "Stop preview");
    }
    carouselPreviewAudio.addEventListener(
      "loadedmetadata",
      function () {
        try {
          carouselPreviewAudio.currentTime = Math.min(startAt, Math.max(0, (carouselPreviewAudio.duration || 0) - 1));
        } catch (e) {}
      },
      { once: true },
    );
    carouselPreviewAudio.play().catch(function () {
      stopCarouselPreview();
    });
    carouselPreviewStopTimer = setTimeout(stopCarouselPreview, CAROUSEL_PREVIEW_SEC * 1000);
    carouselPreviewAudio.addEventListener(
      "ended",
      function () { stopCarouselPreview(); },
      { once: true },
    );
  }

  function wireDiscoverCarouselPreviews(root) {
    if (!root) return;
    var cards = root.querySelectorAll(".discoverCarouselCard");
    cards.forEach(function (card) {
      var previewUrl = card.getAttribute("data-preview-url") || "";
      var hookStartSec = Number(card.getAttribute("data-hook-start") || "0");
      var playBtn = card.querySelector(".discoverCarouselPlay");

      card.addEventListener("click", function (e) {
        if (e.target.closest(".discoverCarouselPlay")) return;
        stopCarouselPreview();
        window.location.href = CAROUSEL_SIGNUP_HREF;
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.target.closest(".discoverCarouselPlay")) {
          e.preventDefault();
          stopCarouselPreview();
          window.location.href = CAROUSEL_SIGNUP_HREF;
        }
      });

      if (!playBtn || !previewUrl) {
        if (playBtn) playBtn.hidden = true;
        return;
      }

      playBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        startCarouselPreview(card, previewUrl, hookStartSec);
      });
    });
  }

  function renderDiscoverCarousel(songs) {
    var wrap = document.querySelector("[data-mk-discover-carousel-wrap]");
    var root = document.querySelector("[data-mk-discover-carousel]");
    if (!wrap || !root) return;
    stopCarouselPreview();
    if (!Array.isArray(songs) || !songs.length) {
      wrap.hidden = true;
      root.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    root.innerHTML = songs.map(function (song) {
      if (!song || !song.id) return "";
      var art = song.artUrl || "/assets/marketing/nabadai-social-card.png";
      var title = song.title || "Untitled";
      var by = song.username ? "@" + song.username : (song.byLine || "");
      var previewUrl = String(song.previewUrl || "").trim();
      var hookStart = Number(song.hookStartSec);
      if (!Number.isFinite(hookStart) || hookStart < 0) hookStart = 0;
      return (
        '<article class="discoverCarouselCard" tabindex="0" role="button" data-song-id="' +
          String(song.id).replace(/"/g, "&quot;") + '" data-preview-url="' +
          previewUrl.replace(/"/g, "&quot;") + '" data-hook-start="' + hookStart + '">' +
          '<span class="discoverCarouselArt">' +
            '<img src="' + art.replace(/"/g, "&quot;") + '" alt="" loading="lazy">' +
            '<button type="button" class="discoverCarouselPlay" aria-label="Preview song">' +
              CAROUSEL_PLAY_SVG +
            "</button>" +
          "</span>" +
          '<span class="discoverCarouselMeta">' +
            '<span class="discoverCarouselTitle">' + title.replace(/</g, "&lt;") + "</span>" +
            (by ? '<span class="discoverCarouselBy">' + by.replace(/</g, "&lt;") + "</span>" : "") +
          "</span>" +
        "</article>"
      );
    }).join("");
    wireDiscoverCarouselPreviews(root);
    setupScrollReveal(root);
  }

  function wireTemplateShowcasePreviews(root, signupHref) {
    if (!root) return;
    var targetHref = String(signupHref || TEMPLATE_SHOWCASE_HREF).trim() || TEMPLATE_SHOWCASE_HREF;
    var cards = root.querySelectorAll(".discoverCarouselCard");
    cards.forEach(function (card) {
      var previewUrl = card.getAttribute("data-preview-url") || "";
      var hookStartSec = Number(card.getAttribute("data-hook-start") || "0");
      var playBtn = card.querySelector(".discoverCarouselPlay");
      var cardHref = card.getAttribute("data-card-href") || targetHref;

      card.addEventListener("click", function (e) {
        if (e.target.closest(".discoverCarouselPlay")) return;
        stopCarouselPreview();
        window.location.href = cardHref;
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.target.closest(".discoverCarouselPlay")) {
          e.preventDefault();
          stopCarouselPreview();
          window.location.href = cardHref;
        }
      });

      if (!playBtn || !previewUrl) {
        if (playBtn) playBtn.hidden = true;
        return;
      }

      playBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        startCarouselPreview(card, previewUrl, hookStartSec);
      });
    });
  }

  function setMarketingTemplateGridVisible(visible) {
    var gridWrap = document.querySelector("[data-mk-template-grid-wrap]");
    if (gridWrap) gridWrap.hidden = !visible;
  }

  function setMarketingTemplateShowcaseVisible(visible) {
    var section = document.querySelector("[data-mk-template-showcase-section]");
    if (section) section.hidden = !visible;
  }

  function resolveShowcaseOccasionTone(label) {
    var s = String(label || "").trim().toLowerCase();
    if (!s) return "default";
    if (/birthday|bday|عيد ميلاد/.test(s)) return "birthday";
    if (/wedding|dabke|عرس|زفاف|engagement/.test(s)) return "wedding";
    if (/love|valentine|romantic|anniversary|حب|عشق/.test(s)) return "love";
    if (/apolog|sorry|اعتذار/.test(s)) return "apology";
    if (/thank|gratitude|شكر/.test(s)) return "thanks";
    if (/arabic|عرب/.test(s)) return "arabic";
    if (/graduation|celebration|party/.test(s)) return "wedding";
    return "default";
  }

  function renderTemplateShowcaseCarousel(songs, cards, opts) {
    opts = opts || {};
    var wrap = document.querySelector("[data-mk-template-showcase-wrap]");
    var root = document.querySelector("[data-mk-template-showcase-carousel]");
    var section = document.querySelector("[data-mk-template-showcase-section]");
    if (!wrap || !root) return;
    stopCarouselPreview();

    var cardList = Array.isArray(cards) ? cards : [];
    var items = [];
    if (Array.isArray(songs) && songs.length) {
      songs.forEach(function (song, i) {
        if (!song) return;
        var card = cardList[i] || {};
        var occasionLabel = String(song.occasionLabel || song.tag || card.title || "").trim();
        items.push({
          id: song.id || ("showcase-" + i),
          artUrl: String(song.artUrl || card.imageUrl || "").trim() || "/assets/marketing/nabadai-social-card.png",
          title: String(song.title || card.title || "Example song").trim() || "Example song",
          occasionLabel: occasionLabel,
          occasionTone: resolveShowcaseOccasionTone(occasionLabel),
          byLine: song.username ? "@" + song.username : String(song.byLine || "").trim(),
          previewUrl: String(song.previewUrl || "").trim(),
          hookStartSec: Number(song.hookStartSec),
          href: String(card.href || opts.signupHref || TEMPLATE_SHOWCASE_HREF).trim() || TEMPLATE_SHOWCASE_HREF,
        });
      });
    }

    if (!items.length) {
      if (section) section.hidden = true;
      wrap.hidden = true;
      root.innerHTML = "";
      setMarketingTemplateGridVisible(true);
      return;
    }

    setMarketingTemplateGridVisible(false);
    if (section) section.hidden = false;
    wrap.hidden = false;
    root.className = "marketingDiscoverCarousel marketingTemplateShowcaseCarousel";
    root.innerHTML = items.map(function (item) {
      var previewUrl = String(item.previewUrl || "").trim();
      var hookStart = Number(item.hookStartSec);
      if (!Number.isFinite(hookStart) || hookStart < 0) hookStart = 0;
      var toneClass = item.occasionTone && item.occasionTone !== "default"
        ? " discoverCarouselCard--" + item.occasionTone
        : "";
      var occasion = item.occasionLabel
        ? '<span class="discoverCarouselOccasion">' + item.occasionLabel.replace(/</g, "&lt;") + "</span>"
        : "";
      var by = item.byLine
        ? '<span class="discoverCarouselBy">' + item.byLine.replace(/</g, "&lt;") + "</span>"
        : "";
      return (
        '<article class="discoverCarouselCard' + toneClass + '" tabindex="0" role="button" data-song-id="' +
          String(item.id).replace(/"/g, "&quot;") + '" data-preview-url="' +
          previewUrl.replace(/"/g, "&quot;") + '" data-hook-start="' + hookStart +
          '" data-card-href="' + String(item.href || TEMPLATE_SHOWCASE_HREF).replace(/"/g, "&quot;") + '">' +
          '<span class="discoverCarouselArt">' +
            '<img src="' + String(item.artUrl).replace(/"/g, "&quot;") + '" alt="" loading="lazy">' +
            '<button type="button" class="discoverCarouselPlay" aria-label="Preview song">' +
              CAROUSEL_PLAY_SVG +
            "</button>" +
          "</span>" +
          '<span class="discoverCarouselMeta">' +
            occasion +
            '<span class="discoverCarouselTitle">' + String(item.title).replace(/</g, "&lt;") + "</span>" +
            by +
          "</span>" +
        "</article>"
      );
    }).join("");
    wireTemplateShowcasePreviews(root, opts.signupHref || TEMPLATE_SHOWCASE_HREF);
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
    setText("[data-mk='templates.showcase.eyebrow']", t.showcaseEyebrow);
    setText("[data-mk='templates.showcase.lead']", t.showcaseLead);
    if (t.imageUrl) setImageSrc("[data-mk='templates.image']", t.imageUrl);
    if (t.imageAlt) setAttr("[data-mk='templates.image']", "alt", t.imageAlt);
    var cards = document.querySelectorAll("[data-mk-template-card]");
    var tones = ["birthday", "wedding", "love", "apology", "thanks", "arabic"];
    var templateCards = Array.isArray(t.cards) ? t.cards : [];
    if (templateCards.length) {
      templateCards.forEach(function (card, i) {
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
    var showcaseOpts = { signupHref: t.ctaHref || TEMPLATE_SHOWCASE_HREF };
    if (Array.isArray(t.showcaseSongs) && t.showcaseSongs.length) {
      renderTemplateShowcaseCarousel(t.showcaseSongs, templateCards, showcaseOpts);
    } else if (Array.isArray(t.showcaseItems) && t.showcaseItems.length) {
      var showcaseIds = t.showcaseItems.map(function (it) { return it && it.songId; }).filter(Boolean);
      var tagById = {};
      t.showcaseItems.forEach(function (it) {
        if (it && it.songId) tagById[it.songId] = String(it.tag || "").trim();
      });
      fetchFeaturedDiscoverSongs(showcaseIds).then(function (songs) {
        var tagged = songs.map(function (song) {
          return Object.assign({}, song, { occasionLabel: tagById[song.id] || "" });
        });
        renderTemplateShowcaseCarousel(tagged, templateCards, showcaseOpts);
      });
    } else if (Array.isArray(t.showcaseSongIds) && t.showcaseSongIds.length) {
      fetchFeaturedDiscoverSongs(t.showcaseSongIds).then(function (songs) {
        renderTemplateShowcaseCarousel(songs, templateCards, showcaseOpts);
      });
    } else {
      renderTemplateShowcaseCarousel([], templateCards, showcaseOpts);
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
    enableDraftEditorMode();
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
      if (e.data && e.data.type === "nabad-marketing-scroll-section" && e.data.sectionId) {
        var target = document.querySelector('[data-mk-section="' + e.data.sectionId + '"]');
        if (target) {
          applyInspectorActiveSection(e.data.sectionId);
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      if (e.data && e.data.type === "nabad-marketing-draft" && e.data.payload && e.data.payload.content) {
        var payload = e.data.payload;
        if (payload.page && payload.page !== PAGE) return;
        if (payload.locale && payload.locale !== LOCALE) return;
        if (payload.editorMode) enableDraftEditorMode();
        applyDraftContent(payload.content);
        if (payload.activeSection) applyInspectorActiveSection(payload.activeSection);
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
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopCarouselPreview();
  });

  fetch("/api/marketing/content?page=" + encodeURIComponent(PAGE) + "&locale=" + encodeURIComponent(LOCALE), {
    credentials: "omit",
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok || !data.content) return;
      applyCore(data.content);
      if (PAGE === "home") {
        applyHomeExtras(data.content);
        applyMarketingBlocks(data.content, { draftEditor: false });
        applySectionLayout(data.content);
      }
    })
    .catch(function () {
      if (PAGE !== "home") return;
      setMarketingTemplateGridVisible(true);
      setMarketingTemplateShowcaseVisible(false);
    });
})();
