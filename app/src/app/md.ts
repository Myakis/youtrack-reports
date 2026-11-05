// Markdown ответов модели (из LogDesk, без внешних библиотек).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function inline(s: string): string {
  return s.split(/(`[^`\n]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>')
      // Ссылки из ответа модели не делаем кликабельными: адрес виден целиком, переходить или нет — решает человек
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 <span class="url">($2)</span>');
  }).join('');
}

export function md(src: string): string {
  const lines = src.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lv = Math.min(4, Math.max(2, h[1].length + 1)); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);
      continue;
    }
    const lm = l.match(listRe);
    if (lm) {
      const ordered = /\d/.test(lm[2]);
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(listRe);
        if (m) { items.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[3] }); i++; continue; }
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      let html = `<${tag}>`;
      let open = false;
      items.forEach((it, k) => {
        if (it.depth === 1 && k > 0) {
          if (!open) { html = html.replace(/<\/li>$/, ''); html += '<ul>'; open = true; }
          html += `<li>${inline(it.text)}</li>`;
        } else {
          if (open) { html += '</ul></li>'; open = false; }
          html += `<li>${inline(it.text)}</li>`;
        }
      });
      if (open) html += '</ul></li>';
      out.push(html + `</${tag}>`);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|(-{3,}|\*{3,})\s*$)/.test(lines[i]) && !listRe.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

/** Модели с «размышлениями» присылают их в теге <think> или <details type="reasoning">. */
export function stripReasoning(t: string): string {
  return t
    .replace(/<details[^>]*type="reasoning"[\s\S]*?(<\/details>|$)/g, '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/^\s+/, '');
}
