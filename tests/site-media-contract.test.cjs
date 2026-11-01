const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/20261101000100_site_media_cms.sql", "utf8");
const adminHtml = fs.readFileSync("admin/site-media.html", "utf8");
const adminJs = fs.readFileSync("admin/js/admin-site-media.js", "utf8");
const publicJs = fs.readFileSync("js/sauberplus-content.js", "utf8");

for (const table of ["leadership_profiles", "site_media"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /allowed_mime_types[\s\S]*video\/mp4[\s\S]*video\/webm/);
assert.match(adminHtml, /data-media-panel="people"/);
assert.match(adminHtml, /data-media-panel="vehicle"/);
assert.match(adminHtml, /data-media-panel="hero"/);
assert.match(adminJs, /MAX_VIDEO=30\*1024\*1024/);
assert.match(adminJs, /crypto\.randomUUID/);
assert.match(publicJs, /initLeadershipProfiles/);
assert.match(publicJs, /initManagedSiteMedia/);
assert.match(publicJs, /muted playsinline/);
console.log("Site media CMS contract checks passed.");
