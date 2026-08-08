# NabadAi SEO operations

## Production URLs

- Canonical host: `https://www.nabadai.com`
- Robots: `https://www.nabadai.com/robots.txt`
- Sitemap: `https://www.nabadai.com/sitemap.xml`
- Search landing pages: English routes at the site root and Arabic routes under `/ar/`

Staging and Vercel preview hosts intentionally return `Disallow: /` from the
host-aware robots endpoint. Do not submit preview URLs to search engines.

## Google Search Console

1. Add a **Domain property** for `nabadai.com`.
2. Copy Google's DNS TXT verification value into the DNS provider for the
   domain. DNS verification is preferred because it covers `www` and the bare
   domain without adding a secret to this repository.
3. Submit `https://www.nabadai.com/sitemap.xml`.
4. Inspect and request indexing for:
   - `https://www.nabadai.com/`
   - `https://www.nabadai.com/ai-music-generator`
   - `https://www.nabadai.com/arabic-ai-music-generator`
   - `https://www.nabadai.com/ar`
5. Use **Removals** only for urgent temporary hiding. The old “Opening soon”
   snippet should be replaced through re-crawling, not a removal request.

## Bing Webmaster Tools

Import the verified Google Search Console property when available, or verify
through DNS. Submit the same sitemap URL.

## Weekly review

- Search Console: indexed pages, exclusions, queries, impressions, clicks, CTR,
  average position, mobile Core Web Vitals.
- Landing pages: CTA visits into `/#/intro`, language split, and pages with high
  impressions but low CTR.
- Public songs: soft-404 reports, duplicate canonicals, and sitemap count.

Wait at least four weeks before rewriting pages based only on rank movement.
Prefer query and conversion evidence over adding repeated keywords.

## Release validation

Run locally before deploy:

```sh
npm run check:seo:local
```

After deploy to production:

```sh
npm run check:seo
```

Then test representative pages with Google's URL Inspection and Rich Results
Test. Confirm that page titles, descriptions, canonicals, `hreflang`, FAQ
schema, and public song schema appear in the fetched HTML without JavaScript.
