#!/usr/bin/env python3
"""
MarkItDown Worker — ClawWiki sidecar process.

Reads a JSON request from stdin, converts the file using MarkItDown,
writes a JSON response to stdout.

Request:  {"path": "/path/to/file.pdf"}
Response: {"ok": true, "title": "...", "markdown": "...", "source": "pdf"}
Error:    {"ok": false, "error": "..."}

Install: pip install 'markitdown[all]'
"""

import json
import sys
import os


def main():
    # Force UTF-8 on Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")

    try:
        raw = sys.stdin.read()
        req = json.loads(raw)
        file_path = req.get("path", "")

        if not file_path or not os.path.isfile(file_path):
            json.dump({"ok": False, "error": f"File not found: {file_path}"}, sys.stdout)
            return

        # Import markitdown (fail fast with clear error if not installed)
        try:
            from markitdown import MarkItDown
        except ImportError:
            json.dump({
                "ok": False,
                "error": "markitdown not installed. Run: pip install 'markitdown[all]'"
            }, sys.stdout)
            return

        md = MarkItDown()
        result = md.convert(file_path)
        content = result.text_content if result.text_content else ""

        # Image fallback: if MarkItDown returns minimal content, use Pillow metadata
        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
        if ext in ("jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff") and len(content.strip()) < 50:
            try:
                from PIL import Image as PILImage
                from PIL.ExifTags import TAGS
                img = PILImage.open(file_path)
                w, h = img.size
                meta_lines = [
                    f"# 图片: {os.path.basename(file_path)}",
                    f"",
                    f"- 尺寸: {w} x {h} 像素",
                    f"- 格式: {img.format or ext.upper()}",
                    f"- 模式: {img.mode}",
                    f"- 文件大小: {os.path.getsize(file_path)} 字节",
                ]
                # EXIF data
                exif = img.getexif()
                if exif:
                    for tag_id, val in list(exif.items())[:10]:
                        tag = TAGS.get(tag_id, tag_id)
                        meta_lines.append(f"- {tag}: {val}")
                content = "\n".join(meta_lines)
            except Exception:
                content = f"# 图片: {os.path.basename(file_path)}\n\n无法提取图片元数据。"

        # Audio fallback: detect empty transcription
        if ext in ("mp3", "wav", "m4a", "ogg", "flac", "amr") and len(content.strip()) < 20:
            json.dump({
                "ok": False,
                "error": f"音频转写失败：MarkItDown 未返回有效文本。可能原因：1) 需要网络访问（Google Speech API）；2) 音频格式不支持。文件: {os.path.basename(file_path)}"
            }, sys.stdout, ensure_ascii=False)
            return

        # Extract title from first heading or filename
        title = os.path.splitext(os.path.basename(file_path))[0]
        lines = content.split("\n")
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("# "):
                title = stripped[2:].strip()
                break

        # Detect source type from extension (ext already set above)
        source_map = {
            "pdf": "pdf", "docx": "docx", "doc": "docx",
            "pptx": "pptx", "ppt": "pptx",
            "xlsx": "xlsx", "xls": "xlsx",
            "jpg": "image", "jpeg": "image", "png": "image",
            "gif": "image", "webp": "image", "svg": "image",
            "mp3": "audio", "wav": "audio", "m4a": "audio",
            "mp4": "video", "mkv": "video", "avi": "video",
            "html": "html", "htm": "html",
            "csv": "csv", "json": "json", "xml": "xml",
            "epub": "epub", "ipynb": "notebook",
            "zip": "archive",
        }
        source = source_map.get(ext, ext or "unknown")

        json.dump({
            "ok": True,
            "title": title,
            "markdown": content,
            "source": source,
        }, sys.stdout, ensure_ascii=False)

    except Exception as e:
        json.dump({"ok": False, "error": str(e)}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
