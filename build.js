// 배포(Cloudflare Pages) 때 자동 실행됩니다.
// 글마다 고유 주소의 HTML 페이지, sitemap.xml, robots.txt, posts.json을 dist 폴더에 만듭니다.
// 사이트마다 다른 값(이름, 설명, 고지문 등)은 같은 폴더의 site.config.json 에서 읽습니다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { marked } = require('marked');

// ---------- 사이트 설정 (site.config.json) ----------
// 파일이 없거나 값이 빠져 있으면 아래 기본값(=기존 쇼핑 사이트 값)을 씁니다.
const DEFAULT_CONFIG = {
  siteUrl: 'https://my-page-eyb.pages.dev',
  name: 'Brand Ai Agent',
  description: '가격 대비 만족도 높은 제품만 골라 정리하는 쇼핑 큐레이션 블로그, Brand Ai Agent입니다.',
  // 제휴 링크가 있는 글 맨 위에 자동으로 들어가는 문구 (공정위 기준: 제목 또는 첫 부분, 명확한 표현)
  affiliateNotice: '이 글에는 제휴 링크가 포함되어 있으며, 링크를 통한 구매나 가입 등에 따라 Brand Ai Agent가 수수료를 받습니다.',
  defaultCategory: '큐레이션',
  footerTagline: '가격 대비 만족도 높은 제품 큐레이션',
  homeOgTitleSuffix: '쇼핑 큐레이션',
  // 홈 화면(index.html)에 들어가는 문구. heroTitleHtml 은 HTML 그대로 들어갑니다. (<br> 가능)
  heroTitleHtml: '오래 쓸 물건을,<br>합리적인 가격에.',
  heroDesc: 'Brand Ai Agent가 가격 대비 만족도가 높은 제품만 골라 정리합니다.',
  // 홈 화면이 posts.json 을 못 읽을 때만 쓰는 백업 경로입니다. 반드시 "이 사이트의" 저장소여야 합니다.
  githubRepo: 'brandaiagent/my-page'
};
function loadConfig() {
  const file = 'site.config.json';
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  let user;
  try { user = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('site.config.json 을 읽지 못했습니다: ' + e.message); process.exit(1); }
  return { ...DEFAULT_CONFIG, ...user };
}
const CONFIG = loadConfig();
// 환경변수 SITE_URL 이 있으면 그것이 우선입니다. (끝에 / 없이)
const SITE_URL = (process.env.SITE_URL || CONFIG.siteUrl).replace(/\/$/, '');
const SITE_NAME = CONFIG.name;
const SITE_DESC = CONFIG.description;
const AFFILIATE_NOTICE = CONFIG.affiliateNotice;
const DEFAULT_CATEGORY = CONFIG.defaultCategory;
const FOOTER_TAGLINE = CONFIG.footerTagline;
const HOME_OG_SUFFIX = CONFIG.homeOgTitleSuffix;
const HERO_TITLE_HTML = CONFIG.heroTitleHtml;
const HERO_DESC = CONFIG.heroDesc;
const GITHUB_REPO = CONFIG.githubRepo;
const OUT = 'dist';
const SOURCE_DIRS = ['.', 'posts'];
const SKIP = new Set(['dist', 'node_modules', 'posts', 'build.js', 'package.json', 'package-lock.json', 'vercel.json', 'site.config.json']);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function getFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}
function getField(text, key) {
  const lines = getFrontmatter(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp('^' + key + ':\\s*(.*)$'));
    if (!m) continue;
    const v = m[1].trim();
    if (/^[|>][+-]?$/.test(v)) {
      const buf = [];
      for (let j = i + 1; j < lines.length && /^\s+/.test(lines[j]); j++) buf.push(lines[j].trim());
      return buf.join(' ').trim();
    }
    return v.replace(/^["']|["']$/g, '').replace(/\\"/g, '"').trim();
  }
  return '';
}
function getBody(text) {
  const m = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  return m ? m[1] : text;
}
// 영문/숫자 파일명은 그대로, 한글 등은 짧은 고정 코드로 (주소가 깨지지 않게)
function makeSlug(name) {
  const base = name.replace(/\.md$/, '').normalize('NFC');
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(base)) return base.toLowerCase();
  return 'post-' + crypto.createHash('sha1').update(base).digest('hex').slice(0, 8);
}
function formatDate(d) {
  const dt = new Date(d);
  if (!d || isNaN(dt)) return '';
  return dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0');
}
function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  return SITE_URL + '/' + u.replace(/^\.?\//, '');
}

// ---------- 글 읽기 ----------
const posts = [];
for (const dir of SOURCE_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const file = path.join(dir, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    const body = getBody(text);
    const affiliate = getField(text, 'affiliate') !== 'false'; // 칸이 없는 예전 글은 제휴 글로 처리
    const heading = body.match(/^#\s+(.*)$/m);
    const title = getField(text, 'title') || (heading ? heading[1] : name.replace('.md', ''));
    const fixed = body
      .replace(/src=(["'])\.?\/?images\//g, 'src=$1/images/')
      .replace(/\]\(\s*\.?\/?images\//g, '](/images/');
    let imgN = 0; // 첫 이미지는 즉시 로드(LCP), 나머지는 지연 로드
    let html = marked.parse(fixed)
      .replace(/<table>/g, '<div class="table-wrap"><table>')
      .replace(/<\/table>/g, '</table></div>')
      .replace(/<img /g, () => (imgN++ === 0 ? '<img fetchpriority="high" decoding="async" ' : '<img loading="lazy" decoding="async" '));
    if (affiliate) {
      // 바깥 링크에 '광고성 링크' 표시 + 새 탭 열기 (내 사이트 링크는 제외)
      html = html.replace(/<a href="(https?:\/\/[^"]*)"/g, (m, url) =>
        url.startsWith(SITE_URL) ? m : `<a href="${url}" rel="sponsored nofollow noopener" target="_blank"`);
    }
    const plain = decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const date = getField(text, 'date');
    // 본문 이미지 목록 + 'AI 생성 이미지' 캡션이 달린 이미지 판별 (구조화 데이터용)
    const aiSrc = new Set([...html.matchAll(/<figure>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<figcaption>([^<]*)<\/figcaption>/g)]
      .filter(m => /AI 생성/.test(m[2])).map(m => m[1]));
    const images = [...html.matchAll(/<img [^>]*>/g)].map(m => {
      const tag = m[0], g = k => (tag.match(new RegExp(k + '="([^"]*)"')) || [])[1] || '';
      return { src: absUrl(g('src')), alt: decode(g('alt')), w: +g('width') || 0, h: +g('height') || 0, ai: aiSrc.has(g('src')) };
    }).filter(i => i.src);
    posts.push({
      name, text, title, html, date, affiliate, images,
      notice: getField(text, 'ad_notice') || AFFILIATE_NOTICE,
      updated: getField(text, 'updated') || date,
      slug: makeSlug(name),
      category: getField(text, 'category') || DEFAULT_CATEGORY,
      desc: getField(text, 'description') || plain.slice(0, 110),
      thumb: getField(text, 'image') || getField(text, 'thumbnail') || getField(text, 'cover') || (images[0] ? images[0].src : '')
    });
  }
}
posts.sort((a, b) => (new Date(b.date) || 0) - (new Date(a.date) || 0));

// ---------- dist 준비 + 정적 파일 복사 ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync('.')) {
  if (entry.startsWith('.') || SKIP.has(entry) || entry.endsWith('.md')) continue;
  fs.cpSync(entry, path.join(OUT, entry), { recursive: true });
}

// ---------- 글 페이지 ----------
// index.html 은 모든 사이트가 같은 모양을 쓰고, 사이트마다 다른 문구만 설정 값으로 바꿔 끼웁니다.
// 바꿀 문구를 못 찾으면 경고를 띄웁니다. (템플릿을 고쳤는데 여기를 안 고친 경우를 알아채기 위해)
function brandHome(src) {
  const jsStr = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const swaps = [
    ['<title>Brand Ai Agent - 쇼핑 큐레이션</title>', `<title>${esc(SITE_NAME)} - ${esc(HOME_OG_SUFFIX)}</title>`],
    ['<a class="logo" onclick="goHome()">Brand Ai Agent</a>', `<a class="logo" onclick="goHome()">${esc(SITE_NAME)}</a>`],
    ['<h1>오래 쓸 물건을,<br>합리적인 가격에.</h1>', `<h1>${HERO_TITLE_HTML}</h1>`],
    ['<p>Brand Ai Agent가 가격 대비 만족도가 높은 제품만 골라 정리합니다.</p>', `<p>${esc(HERO_DESC)}</p>`],
    ['<span class="f-logo">Brand Ai Agent</span><span>가격 대비 만족도 높은 제품 큐레이션</span>', `<span class="f-logo">${esc(SITE_NAME)}</span><span>${esc(FOOTER_TAGLINE)}</span>`],
    ["getField(text, ['category', 'tag']) || '큐레이션',", `getField(text, ['category', 'tag']) || '${jsStr(DEFAULT_CATEGORY)}',`],
    ['api.github.com/repos/brandaiagent/my-page/contents/', `api.github.com/repos/${GITHUB_REPO}/contents/`, 2]
  ];
  for (const [from, to, times = 1] of swaps) {
    const n = src.split(from).length - 1;
    if (n !== times) console.warn(`경고: index.html 에서 바꿀 문구를 ${times}곳 예상했는데 ${n}곳 찾았습니다 → ${from.slice(0, 40)}`);
    src = src.split(from).join(to);
  }
  return src;
}
const indexSrc = brandHome(fs.readFileSync('index.html', 'utf8'));
const style = (indexSrc.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const fontLinks = (indexSrc.match(/<link rel="stylesheet"[^>]*>/g) || []).join('\n  ');

function postPage(p) {
  const url = `${SITE_URL}/p/${p.slug}/`;
  const img = absUrl(p.thumb);
  let iso = '', isoMod = '';
  try { iso = new Date(p.date).toISOString(); } catch (e) {}
  try { isoMod = new Date(p.updated).toISOString(); } catch (e) {}
  const post = {
    '@type': 'BlogPosting',
    '@id': url + '#post',
    headline: p.title, description: p.desc, inLanguage: 'ko', mainEntityOfPage: url,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL + '/' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL + '/' }
  };
  if (iso) { post.datePublished = iso; post.dateModified = isoMod || iso; }
  if (img) post.image = [img];
  // 이미지별 정보: 제작 주체와 AI 생성 여부를 명시 (저작권 오해 방지)
  const imageNodes = p.images.map(i => {
    const o = { '@type': 'ImageObject', contentUrl: i.src, url: i.src, creator: { '@type': 'Organization', name: SITE_NAME } };
    if (i.alt) o.caption = i.alt;
    if (i.w && i.h) { o.width = i.w; o.height = i.h; }
    if (i.ai) o.creditText = SITE_NAME + ' (AI 생성 이미지)';
    return o;
  });
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL + '/' },
    { '@type': 'ListItem', position: 2, name: p.title, item: url }
  ] };
  const ld = { '@context': 'https://schema.org', '@graph': [post, crumbs].concat(imageNodes) };
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)} | ${SITE_NAME}</title>
  <meta name="description" content="${esc(p.desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="ko_KR" />
  ${iso ? `<meta property="article:published_time" content="${esc(iso)}" />` : ''}
  ${isoMod ? `<meta property="article:modified_time" content="${esc(isoMod)}" />` : ''}
  ${img ? `<meta property="og:image" content="${esc(img)}" />` : ''}
  <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />
  <meta name="color-scheme" content="light dark" />
  ${fontLinks}
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  ${style}
  <style>a.back-btn { text-decoration: none; }
  .affiliate-notice { font-size: .9rem; color: var(--ink-sub); background: var(--surface); border: 1px solid var(--line); border-left: 2px solid var(--accent); padding: 12px 16px; margin: 0 0 32px; line-height: 1.6; }</style>
</head>
<body>
  <header class="gnb">
    <div class="gnb-top">
      <a class="logo" href="/">${SITE_NAME}</a>
      <a class="admin-link" href="/admin" target="_blank">관리자</a>
    </div>
  </header>
  <div class="container">
    <a class="back-btn" href="/">&larr; 목록으로</a>
    <article class="detail-container">
      <div class="detail-meta"><span class="card-tag">${esc(p.category)}</span>${p.date ? `<time datetime="${esc(iso)}">${formatDate(p.date)}</time>` : ''}</div>
      <h1 class="detail-title">${esc(p.title)}</h1>
      ${p.affiliate ? `<p class="affiliate-notice">${esc(p.notice)}</p>` : ''}
      <div id="content-area">${p.html}</div>
    </article>
  </div>
  <footer class="site-footer"><span class="f-logo">${SITE_NAME}</span><span>${esc(FOOTER_TAGLINE)}</span></footer>
  <div id="progress"></div>
  <script>addEventListener('scroll',function(){var h=document.documentElement.scrollHeight-innerHeight;document.getElementById('progress').style.width=(h>0?scrollY/h*100:0)+'%'},{passive:true});</script>
</body>
</html>`;
}
for (const p of posts) {
  const dir = path.join(OUT, 'p', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), postPage(p));
}

// ---------- 메인 페이지(검색용 정보 추가) ----------
const list = posts.map(p => `<li><a href="/p/${p.slug}/">${esc(p.title)}</a></li>`).join('');
const homeHead = `  <meta name="description" content="${esc(SITE_DESC)}" />
  <link rel="canonical" href="${SITE_URL}/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${SITE_NAME} - ${HOME_OG_SUFFIX}" />
  <meta property="og:description" content="${esc(SITE_DESC)}" />
  <meta property="og:url" content="${SITE_URL}/" />
</head>`;
let home = indexSrc.replace('</head>', homeHead);
home = home.replace('<div class="state-msg">글 목록을 조회 중입니다...</div>',
  `<div class="state-msg">글 목록을 조회 중입니다...</div>\n      <noscript><ul>${list}</ul></noscript>`);
fs.writeFileSync(path.join(OUT, 'index.html'), home);

// ---------- sitemap / robots / posts.json ----------
const urls = [`<url><loc>${SITE_URL}/</loc></url>`].concat(posts.map(p => {
  let last = '';
  try { last = `<lastmod>${new Date(p.updated || p.date).toISOString().slice(0, 10)}</lastmod>`; } catch (e) {}
  return `<url><loc>${SITE_URL}/p/${p.slug}/</loc>${last}</url>`;
}));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify(posts.map(({ name, text, slug }) => ({ name, text, slug }))));

console.log(`빌드 완료: 글 ${posts.length}개 → ${OUT}/ (글 페이지, sitemap.xml, robots.txt, posts.json)`);
