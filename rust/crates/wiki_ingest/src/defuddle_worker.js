#!/usr/bin/env node
/**
 * Defuddle Content Extraction Worker — ClawWiki sidecar.
 *
 * Receives HTML + URL via stdin JSON, extracts article content using
 * defuddle (the engine behind Obsidian Web Clipper), and outputs
 * clean Markdown via stdout JSON.
 *
 * stdin:  { "html": "<full page HTML>", "url": "https://..." }
 * stdout: { "ok": true, "title": "...", "author": "...", "published": "...", "markdown": "...", "wordCount": 123 }
 * error:  { "ok": false, "error": "..." }
 *
 * Install: npm install (in this directory)
 */

const { parseHTML } = require('linkedom');

/**
 * Match the Rust-side `wiki_ingest::sanitize_markdown` so a direct
 * consumer of this worker (anything calling `node defuddle_worker.js`
 * outside the Rust pipeline) also gets clean output.
 *
 * Steps mirror the Rust order: HTML entities (with `&amp;` first so
 * nested `&amp;nbsp;` decodes fully), then drop truncated data: image
 * URIs (the SVG fragment defuddle sometimes emits), then collapse
 * runs of blank lines and stray empty `![]()` markers.
 */
function sanitizeMarkdown(md) {
  if (typeof md !== 'string' || md.length === 0) return md || '';

  // 1. HTML entity decode (`&amp;` first → handles nested entities).
  let out = md
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#47;/g, '/');

  // 2. Drop truncated `![alt](data:mime,payload)` images.
  out = out.replace(/!\[[^\]]*\]\(data:([^,)]+),([^)]*)\)/g, (m, mime, payload) => {
    if (!payload || payload.length < 20) return '';
    if (/svg/i.test(mime) && !payload.includes('%3E')) return '';
    return m;
  });

  // 3. Collapse 3+ consecutive newlines to 2.
  out = out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  // 4. Drop standalone empty `![]()` lines.
  out = out
    .split('\n')
    .filter((line) => !/^!\[\]\(\s*\)\s*$/.test(line.trim()))
    .join('\n');

  return out.trim();
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const req = JSON.parse(input);
    const html = req.html || '';
    const url = req.url || '';

    if (!html) {
      console.log(JSON.stringify({ ok: false, error: 'html is empty' }));
      return;
    }

    // Parse HTML with linkedom (lightweight DOM for Node.js)
    const { document } = parseHTML(html);

    // Import defuddle
    let Defuddle, createMarkdownContent;
    try {
      Defuddle = require('defuddle').default || require('defuddle');
      const full = require('defuddle/full');
      createMarkdownContent = full.createMarkdownContent;
    } catch (e) {
      console.log(JSON.stringify({
        ok: false,
        error: `defuddle not installed. Run: npm install (in ${__dirname})`
      }));
      return;
    }

    // Extract content
    const defuddle = new Defuddle(document.documentElement, { url });
    const result = defuddle.parse();

    if (!result.content || result.content.length < 20) {
      console.log(JSON.stringify({
        ok: false,
        error: 'defuddle returned empty content — page may be protected or have no article'
      }));
      return;
    }

    // Convert to Markdown
    let markdown = '';
    try {
      markdown = createMarkdownContent(result.content, url);
    } catch (e) {
      // Fallback: strip HTML tags
      markdown = result.content.replace(/<[^>]+>/g, '').trim();
    }

    // Post-process: same cleanup the Rust side does (sanitize_markdown
    // in wiki_ingest::lib.rs). Done here too as defense in depth so
    // any direct consumer of this worker's output also gets clean text.
    markdown = sanitizeMarkdown(markdown);

    console.log(JSON.stringify({
      ok: true,
      title: result.title || '',
      author: result.author || '',
      published: result.published || '',
      markdown: markdown,
      wordCount: result.wordCount || 0,
      description: result.description || '',
    }));

  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e) }));
  }
}

main();
