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
