# Branded “Confirm signup” email (Supabase + Resend)

The plain “Confirm your signup / Follow this link…” message is Supabase’s **default** template. You replace it in the dashboard — no app redeploy required.

## 1. Logo image (hosted with the app)

The confirm email uses the **current app icon** (purple → teal **N** mark), not the legacy music-note artwork.

After you deploy, use this URL in the template (the `?v=2` busts old CDN/cache from the previous logo):

```
https://musician-ai-studio.vercel.app/assets/nabadai-logo.png?v=2
```

After `nabadai.com` is on Vercel:

```
https://nabadai.com/assets/nabadai-logo.png?v=2
```

## 2. Edit the template in Supabase

1. [Supabase Dashboard](https://supabase.com) → your project → **Authentication** → **Emails** → **Templates**
2. Open **Confirm signup**
3. **Subject:** `Welcome to NabadAi Music — confirm your email`
4. Paste the **HTML body** below into the message editor (switch to **Source / HTML** if the UI offers it)
5. **Save**

## 3. Subject + preview lines (copy)

| Field | Text |
|--------|------|
| Subject | `Welcome to NabadAi Music — confirm your email` |
| Preheader (if available) | `One tap to start creating music from a hum.` |

## 4. HTML body (paste into Supabase)

Paste as-is after deploy. If you change the logo file again, bump `?v=` in the `img src` so inboxes don’t show a cached image.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Confirm your NabadAi account</title>
</head>
<body style="margin:0;padding:0;background-color:#05070d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#05070d;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:linear-gradient(165deg,#0c1018 0%,#12151e 55%,#0a0d14 100%);border:1px solid rgba(124,92,255,0.28);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:36px 32px 20px;text-align:center;">
              <img src="https://musician-ai-studio.vercel.app/assets/nabadai-logo.png?v=2" width="88" height="88" alt="NabadAi Music" style="display:block;margin:0 auto 18px;border-radius:20px;" />
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(223,231,251,0.55);">NabadAi Music</p>
              <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:#f0f4ff;">Confirm your email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:rgba(223,231,251,0.82);">
                You’re one step away from <strong style="color:#f0f4ff;">NabadAi Music</strong> — hum a melody, write lyrics, and ship a song with AI.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:rgba(223,231,251,0.62);">
                Tap the button below to verify <span style="color:#e0d6ff;">{{ .Email }}</span> and open your studio.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;text-align:center;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:15px 32px;border-radius:14px;background:linear-gradient(135deg,#7c5cff 0%,#23d5ab 100%);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;box-shadow:0 12px 32px -8px rgba(124,92,255,0.55);">
                Confirm &amp; open NabadAi
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:rgba(223,231,251,0.45);">
                Button not working? Copy this link into your browser:<br />
                <a href="{{ .ConfirmationURL }}" style="color:#9b8cff;word-break:break-all;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 32px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(223,231,251,0.38);text-align:center;">
                If you didn’t create a NabadAi account, you can ignore this email.<br />
                Sent by NabadAi Music · <a href="https://musician-ai-studio.vercel.app/" style="color:rgba(155,140,255,0.9);text-decoration:none;">Open the app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

## 5. Plain-text fallback (optional)

Some clients show plain text only. In Supabase, if there is a separate plain body field:

```
Welcome to NabadAi Music

Confirm your email to start creating music from a hum.

{{ .ConfirmationURL }}

If you didn’t sign up, ignore this email.
```

## 6. Test

1. Sign up with a **new** test email (not your Google address).
2. Check inbox — you should see the dark card, logo, and purple/teal button.
3. If the logo is broken or still shows the **old music-note** icon, deploy the latest app build, update the `img src` in Supabase to match the URL above (including `?v=2`), save, and send a new test signup.

## Notes

- **Resend** only delivers what Supabase sends; branding is 100% this Supabase template.
- Keep `{{ .ConfirmationURL }}` exactly as-is — Supabase fills it in.
- For **Magic link** or **Reset password**, duplicate the same HTML and swap the CTA copy; use `{{ .ConfirmationURL }}` or the variable shown in that template’s docs.
