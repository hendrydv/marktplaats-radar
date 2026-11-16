// Orange radar: rings plus a sweep line, matching the page accent colour.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#e8590c"/>
<circle cx="32" cy="32" r="21" fill="none" stroke="#fff" stroke-width="5" opacity=".55"/>
<circle cx="32" cy="32" r="11" fill="none" stroke="#fff" stroke-width="5"/>
<path d="M32 32 47 17" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
<circle cx="32" cy="32" r="4" fill="#fff"/>
</svg>`;

export const FAVICON_LINK = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';

export function faviconResponse(): Response {
  return new Response(FAVICON_SVG, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=604800" },
  });
}
