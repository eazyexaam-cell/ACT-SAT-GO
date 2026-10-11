// Tells Bing, Yandex and other IndexNow engines that every sitemap URL is new or updated.
// Bing's index also feeds ChatGPT search and Copilot, so new guides show up there sooner.
//
// Usage, after a deploy is live: node scripts/indexnow.mjs
// The key file in public/ proves we own the site; keep its name and contents in sync with KEY.

const SITE = 'https://www.actsatgo.com';
const KEY = 'cdb6626acde4302dd341de40030b2a18';

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error('No URLs found in the live sitemap');

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: submitted ${urlList.length} URLs, response ${res.status} ${res.statusText}`);
if (!res.ok && res.status !== 202) process.exit(1);
