const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function jsonLd(file) {
  const blocks = [...read(file).matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length, `${file} must contain JSON-LD`);
  return blocks.map((block) => JSON.parse(block[1]));
}

const home = read("index.html");
const service = read("reinigungsservice-solingen.html");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const llms = read("llms.txt");
const indexNowKey = read("b6d87a26f1524ea89b21876839f46b91.txt").trim();

assert.match(home, /rel="canonical" href="https:\/\/sauberplus\.plus\/"/);
assert.match(home, /SauberPlus Reinigungsservice GbR/);
assert.match(home, /reinigungsservice-solingen\.html/);
assert.match(service, /rel="canonical" href="https:\/\/sauberplus\.plus\/reinigungsservice-solingen\.html"/);
assert.match(service, /FAQPage/);
assert.match(service, /Gebäudereinigung in Solingen/);
assert.match(robots, /User-agent: OAI-SearchBot\s+Allow: \//);
assert.match(robots, /Disallow: \/admin\//);
assert.match(robots, /Sitemap: https:\/\/sauberplus\.plus\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/sauberplus\.plus\/reinigungsservice-solingen\.html<\/loc>/);
assert.match(llms, /Do not invent ratings, certifications, prices, customer counts or guarantees/);
assert.equal(indexNowKey, "b6d87a26f1524ea89b21876839f46b91");

const homeGraph = jsonLd("index.html")[0]["@graph"];
assert.ok(homeGraph.some((item) => Array.isArray(item["@type"]) && item["@type"].includes("LocalBusiness")));
assert.ok(homeGraph.some((item) => item["@type"] === "WebSite"));
const serviceGraph = jsonLd("reinigungsservice-solingen.html")[0]["@graph"];
assert.ok(serviceGraph.some((item) => item["@type"] === "Service"));
assert.ok(serviceGraph.some((item) => item["@type"] === "FAQPage"));

console.log("SEO and AI-discovery contract checks passed.");
