# SauberPlus Website

Static production website for SauberPlus.

Production URL: https://www.sauberplus.plus

## Project Structure

```text
.
├── index.html              # Production homepage
├── css/                    # Stylesheets
│   └── sauberplus.css
├── js/                     # Browser JavaScript
│   └── sauberplus.js
├── images/                 # Production image assets
│   └── sauberplus/
├── impressum.html          # Legal notice
├── datenschutz.html        # Privacy policy
├── impressum/              # Compatibility redirect
├── datenschutz/            # Compatibility redirect
├── legal/                  # Compatibility redirects
├── admin/                  # Admin dashboard / CMS (static, Supabase-backed — see docs/admin-cms-setup.md)
├── supabase/               # Committed schema.sql (RLS/functions/triggers) for the admin backend
├── backups/                # Local backup drop-zone, not for production files
├── docs/                   # Maintenance documentation
├── CNAME                   # GitHub Pages custom domain
├── _headers                # Header config for hosts that support it
├── vercel.json             # Header config for Vercel
└── .htaccess               # Header config for Apache
```

## Deployment

The live site is currently deployed with GitHub Pages from the `main` branch.

1. Edit files only inside this repository.
2. Verify the site locally by opening `index.html` in a browser.
3. Check links and layout on desktop and mobile.
4. Commit changes to `main`.
5. Push to `origin main`.
6. Wait for GitHub Pages cache to refresh, then verify https://www.sauberplus.plus.

GitHub Pages does not apply custom HTTP response headers from `_headers`, `vercel.json`, or `.htaccess`. These files are kept for future migration to Netlify, Cloudflare Pages, Vercel, or Apache-compatible hosting.

## Updating The Website

- Homepage content belongs in `index.html`.
- Styling belongs in `css/sauberplus.css`.
- Browser behavior belongs in `js/sauberplus.js`.
- Production photos belong in `images/sauberplus/`.
- Legal text belongs in root `impressum.html` and `datenschutz.html`.
- Maintenance notes belong in `docs/`.
- Record every meaningful change in `CHANGELOG.md`.

Do not copy files from other projects into this repository. Keep SauberPlus isolated from InviteLux, Smart Lab, Microsystem, noor-islam-shop, and every other project.

## Admin Dashboard

`/admin` is a separate, static, Supabase-backed CMS for partners to manage announcements/banners and the gallery without touching code — it does not change anything about the public site above. See `docs/admin-cms-setup.md` for the full design, provisioning steps, and current build status.

## Safety Rules

- Do not rename `index.html`, `CNAME`, or production asset folders without a deployment reason.
- Do not add generated screenshots, temporary browser profiles, verification downloads, or debug scripts.
- Do not add private keys, tokens, passwords, or customer data.
- Do not invent legal company data. Add official legal details only when they are provided.
