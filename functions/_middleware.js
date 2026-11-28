// 옛 주소로 들어오면 새 주소로 영구 이동(301) — 검색엔진이 주소 이전을 알아채게 함
// 미리보기 주소(<해시>.brand-ai-sports.pages.dev)는 그대로 둠
const OLD_HOSTS = ["brand-ai-sports.pages.dev"];
const TARGET = 'sports.brandaihub.com';
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (OLD_HOSTS.includes(url.hostname)) {
    url.hostname = TARGET;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
