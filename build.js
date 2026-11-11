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

// ---------- 신뢰 페이지 (소개·편집 원칙·광고 정책·개인정보·약관·문의) ----------
const CONTACT = (CONFIG.contactEmail || '').trim();
const POLICY_DATE = (CONFIG.policyDate || '').trim();
const HAS_AFFILIATE = CONFIG.hasAffiliate !== false;
const ANALYTICS = (CONFIG.analytics || '').trim(); // 예: "Microsoft Clarity" (쓰지 않으면 비워 둠)
const listHtml = arr => '<ul>' + (arr || []).map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
const paraHtml = arr => (arr || []).map(t => `<p>${esc(t)}</p>`).join('');
const mail = CONTACT ? `<a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>` : '';
const dateLine = POLICY_DATE ? `<p>시행일: ${esc(POLICY_DATE)}</p>` : '';

const TRUST = [
  { slug: 'about', nav: '소개', title: '사이트 소개', desc: `${SITE_NAME}는 어떤 사이트인지 소개합니다.`,
    body: `<h2>어떤 곳인가요</h2>${paraHtml(CONFIG.aboutParagraphs && CONFIG.aboutParagraphs.length ? CONFIG.aboutParagraphs : [SITE_DESC])}
<h2>글은 어떻게 만드나요</h2><p>글 작성과 확인 방식은 <a href="/editorial/">편집 원칙</a>에 자세히 적어 두었습니다.</p>${HAS_AFFILIATE ? '<p>제휴 링크가 있는 글에는 맨 위에 수수료 안내가 표시됩니다. 자세한 내용은 <a href="/disclosure/">광고·제휴 정책</a>을 확인해 주세요.</p>' : ''}
<h2>운영</h2><p>이 사이트의 운영 주체는 ${esc(SITE_NAME)}입니다.${CONTACT ? ' 문의는 <a href="/contact/">문의 페이지</a>를 이용해 주세요.' : ''}</p>` },
  { slug: 'editorial', nav: '편집 원칙', title: '편집 원칙', desc: `${SITE_NAME}가 글을 쓰고 확인하는 방식입니다.`,
    body: `<h2>글 작성 방식</h2><ul><li>AI 도구의 도움을 받아 초안을 만들고, 발행 전에 운영자가 내용을 확인합니다.</li>${(CONFIG.editorialPoints || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
<h2>확인되지 않은 내용은 쓰지 않습니다</h2><p>출처를 확인하지 못한 가격, 수치, 일정, 순위, 후기는 글에 넣지 않습니다. 가격이나 재고처럼 자주 바뀌는 정보는 글을 쓴 시점의 내용이므로, 구매나 신청 전에 공식 안내에서 다시 확인해 주세요.</p>
<h2>사용 경험 표시</h2><p>운영자가 직접 써 보지 않은 것을 써 본 것처럼 쓰지 않습니다. 직접 사용한 경우에만 그렇게 밝힙니다.</p>
<h2>이미지</h2><p>AI로 만든 이미지에는 '${esc('AI 생성 이미지')}'라고 표시합니다.</p>
<h2>정정 요청</h2><p>잘못된 내용을 발견하셨다면 ${CONTACT ? mail + '로' : '문의 방법으로'} 알려 주세요. 확인 후 수정하고, 의미가 달라지는 수정은 글의 수정일에 반영합니다.</p>` },
  { slug: 'disclosure', nav: '광고·제휴', title: '광고·제휴 정책', desc: `${SITE_NAME}의 광고와 제휴 링크 표시 방식입니다.`,
    body: HAS_AFFILIATE
      ? `<h2>수수료 안내</h2><p>제휴 링크가 있는 글에는 맨 위에 다음과 같은 안내를 넣습니다.</p><blockquote>${esc(AFFILIATE_NOTICE)}</blockquote>
<h2>표시 방법</h2><ul><li>안내 문구는 글 맨 위, 본문보다 먼저 보이게 넣습니다.</li><li>제휴 링크에는 광고성 링크임을 알리는 속성(sponsored, nofollow)을 붙입니다.</li></ul>
<h2>평가의 독립성</h2><p>수수료가 있는지, 얼마인지에 따라 제품 평가나 순서를 바꾸지 않는 것을 원칙으로 합니다. 일반적으로 이용자가 제휴 링크로 구매해도 추가 비용은 없습니다.</p>
<h2>출처</h2><p>글에 쓴 정보의 출처는 본문에 표시하며, 출처를 확인하지 못한 내용은 쓰지 않습니다.</p>`
      : `<h2>광고·제휴 현황</h2><p>현재 이 사이트에는 광고나 제휴 링크가 없습니다. 앞으로 생기면 해당 글 맨 위에 명확히 표시하고 이 페이지를 갱신합니다.</p>
<h2>출처</h2><p>글에 쓴 정보의 출처는 본문에 표시하며, 출처를 확인하지 못한 내용은 쓰지 않습니다.</p>` },
  { slug: 'privacy', nav: '개인정보처리방침', title: '개인정보처리방침', desc: `${SITE_NAME}의 개인정보 처리 방식입니다.`,
    body: `<h2>1. 수집하는 정보</h2><p>이 사이트에는 회원가입, 댓글, 결제 기능이 없으며 이용자가 직접 입력하는 개인정보를 수집하지 않습니다.${CONTACT ? ' 이메일로 문의하시면 보내 주신 이메일 주소와 문의 내용이 운영자에게 전달됩니다.' : ''}</p>
<h2>2. 자동으로 처리되는 정보</h2><p>사이트를 제공하는 호스팅 서비스(Cloudflare)가 접속 기록(IP 주소, 브라우저 정보, 접속 시각 등)을 서비스 운영과 보안을 위해 처리할 수 있습니다.</p>
<h2>3. 이용 목적과 보관</h2><p>${CONTACT ? '문의 내용은 답변과 정정 처리에만 사용하며, 처리가 끝나면 지체 없이 파기합니다.' : '이 사이트는 이용자의 개인정보를 별도로 보관하지 않습니다.'}</p>
<h2>4. 외부 서비스와 쿠키</h2><ul><li>글꼴(Google Fonts)과 스타일·스크립트(jsDelivr)를 불러올 때 해당 서비스에 접속 정보(IP 주소 등)가 전달될 수 있습니다.</li>${HAS_AFFILIATE ? '<li>제휴 링크를 누르면 이동한 쇼핑몰·제휴 사이트가 자체 쿠키를 사용할 수 있습니다. 이는 해당 사이트의 방침을 따릅니다.</li>' : ''}${ANALYTICS ? `<li>방문 통계를 위해 ${esc(ANALYTICS)}를 사용할 수 있으며, 이 과정에서 쿠키와 접속 정보가 처리될 수 있습니다.</li>` : ''}<li>브라우저 설정에서 쿠키 저장을 거부할 수 있습니다.</li></ul>
<h2>5. 제3자 제공</h2><p>법령에 따른 경우를 제외하고 이용자의 정보를 제3자에게 제공하지 않습니다.</p>
<h2>6. 이용자의 권리</h2><p>${CONTACT ? `문의 내용의 열람, 정정, 삭제를 원하시면 ${mail}로 요청해 주세요.` : '개인정보 관련 요청은 사이트 운영자에게 문의해 주세요.'}</p>
<h2>7. 방침의 변경</h2><p>내용이 바뀌면 이 페이지를 갱신합니다.</p>${dateLine}` },
  { slug: 'terms', nav: '이용약관', title: '이용약관', desc: `${SITE_NAME} 이용 조건입니다.`,
    body: `<h2>1. 목적</h2><p>이 약관은 ${esc(SITE_NAME)} 사이트의 이용 조건을 정합니다.</p>
<h2>2. 저작권</h2><p>사이트의 글과 이미지의 권리는 운영자에게 있습니다. 허락 없이 복제, 배포, 상업적으로 이용할 수 없으며, 인용할 때는 출처와 원문 링크를 표시해 주세요.</p>
<h2>3. 정보의 성격</h2><p>글은 일반적인 정보 제공을 위한 것입니다. 정확성을 위해 노력하지만 가격, 일정, 제도 등은 바뀔 수 있으므로 중요한 결정 전에는 공식 안내를 직접 확인해 주세요. 글을 참고해 내린 결정의 결과에 대해 운영자는 법령이 허용하는 범위에서 책임을 지지 않습니다.</p>
<h2>4. 외부 링크</h2><p>외부 사이트로 연결되는 링크가 있습니다. 외부 사이트의 내용과 운영에 대해서는 해당 사이트가 책임집니다.</p>
<h2>5. 약관의 변경</h2><p>내용이 바뀌면 이 페이지를 갱신합니다.</p>${dateLine}` }
];
if (CONTACT) {
  TRUST.push({ slug: 'contact', nav: '문의', title: '문의', desc: `${SITE_NAME}에 문의하는 방법입니다.`,
    body: `<p>정정 요청, 제안, 제휴·광고 문의는 아래 이메일로 보내 주세요. 확인 후 순차적으로 답변드립니다.</p><p>${mail}</p><p>주민등록번호, 비밀번호 같은 민감한 정보는 보내지 마세요. 문의 정보 처리는 <a href="/privacy/">개인정보처리방침</a>을 따릅니다.</p>` });
}
const TRUST_CSS = `.trust-links{max-width:1180px;margin:0 auto;padding:0 32px 48px;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.82rem}.trust-links a{color:var(--ink-muted);text-decoration:none}.trust-links a:hover{color:var(--ink)}@media(max-width:600px){.trust-links{padding-left:20px;padding-right:20px}}`;
const trustNav = () => `<nav class="trust-links" aria-label="사이트 정보">${TRUST.map(t => `<a href="/${t.slug}/">${t.nav}</a>`).join('')}</nav>`;
function trustPage(t) {
  const url = `${SITE_URL}/${t.slug}/`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(t.title)} | ${SITE_NAME}</title>
  <meta name="description" content="${esc(t.desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${esc(t.title)}" />
  <meta property="og:description" content="${esc(t.desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="color-scheme" content="light dark" />
  ${fontLinks}
  ${style}
  <style>a.back-btn { text-decoration: none; } #content-area h2:first-child { margin-top: 0; } ${TRUST_CSS}</style>
</head>
<body>
  <header class="gnb">
    <div class="gnb-top">
      <a class="logo" href="/">${SITE_NAME}</a>
    </div>
  </header>
  <div class="container">
    <a class="back-btn" href="/">&larr; 홈으로</a>
    <article class="detail-container">
      <h1 class="detail-title">${esc(t.title)}</h1>
      <div id="content-area">${t.body}</div>
    </article>
  </div>
  <footer class="site-footer"><span class="f-logo">${SITE_NAME}</span><span>${esc(FOOTER_TAGLINE)}</span></footer>
  ${trustNav()}
</body>
</html>`;
}


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
  .affiliate-notice { font-size: .9rem; color: var(--ink-sub); background: var(--surface); border: 1px solid var(--line); border-left: 2px solid var(--accent); padding: 12px 16px; margin: 0 0 32px; line-height: 1.6; }${TRUST_CSS}</style>
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
  ${trustNav()}
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
for (const t of TRUST) {
  const dir = path.join(OUT, t.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), trustPage(t));
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
  <style>${TRUST_CSS}</style>
</head>`;
let home = indexSrc.replace('</head>', homeHead);
home = home.replace('<div class="state-msg">글 목록을 조회 중입니다...</div>',
  `<div class="state-msg">글 목록을 조회 중입니다...</div>\n      <noscript><ul>${list}</ul></noscript>`);
home = home.replace('</footer>', '</footer>\n  ' + trustNav());
fs.writeFileSync(path.join(OUT, 'index.html'), home);

// ---------- sitemap / robots / posts.json ----------
const urls = [`<url><loc>${SITE_URL}/</loc></url>`].concat(posts.map(p => {
  let last = '';
  try { last = `<lastmod>${new Date(p.updated || p.date).toISOString().slice(0, 10)}</lastmod>`; } catch (e) {}
  return `<url><loc>${SITE_URL}/p/${p.slug}/</loc>${last}</url>`;
}), TRUST.map(t => `<url><loc>${SITE_URL}/${t.slug}/</loc></url>`));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
// 검색용 크롤러는 허용, AI 학습용 크롤러는 차단
const AI_TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'Meta-ExternalAgent', 'cohere-ai'];
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\n` + AI_TRAINING_BOTS.map(b => `User-agent: ${b}\nDisallow: /\n`).join('\n') + `\nSitemap: ${SITE_URL}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify(posts.map(({ name, text, slug }) => ({ name, text, slug }))));

console.log(`빌드 완료: 글 ${posts.length}개, 신뢰 페이지 ${TRUST.length}개 → ${OUT}/ (sitemap.xml, robots.txt, posts.json 포함)`);
if (!CONTACT) console.log('주의: site.config.json의 contactEmail이 비어 있어 문의 페이지를 만들지 않았습니다.');
