# Project Info

Project Name: SauberPlus

Production URL: https://www.sauberplus.plus

Main branch: `main`

Repository: https://github.com/abdeen124-byte/sauberplus.git

Deployment method: GitHub Pages from the `main` branch with `CNAME` set to `sauberplus.plus`.

## Important Notes

- Work only inside the SauberPlus repository.
- The production homepage is `index.html`.
- Legal pages are stored as root `impressum.html` and `datenschutz.html`; routed legal folders are compatibility redirects.
- Production images are stored in `images/sauberplus/`.
- CSS is stored in `css/sauberplus.css`.
- JavaScript is stored in `js/sauberplus.js`.
- GitHub Pages does not serve custom HTTP security headers from repository config files.
- `_headers`, `vercel.json`, and `.htaccess` are retained for future hosting platforms that support custom response headers.
- Do not mix files from InviteLux, Smart Lab, Microsystem, MS-Invitation, noor-islam-shop, or any other project.
- The `/admin` CMS (see `docs/admin-cms-setup.md`) runs on its own dedicated Supabase project. Never connect or share it with any other client project's Supabase account/organization, same rule as the file isolation above.
- Record future changes in `CHANGELOG.md`.
