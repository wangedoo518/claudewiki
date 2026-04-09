import { PageStub } from "@/components/PageStub";

/**
 * Ask · CCD 工作台 + 流式会话 (wireframes.html §06, SOUL ①+②)
 *
 * Final surface will embed the CCD workbench + streaming primitives
 * extracted from `session-workbench/`:
 * - `AskWorkbench` (sidebar sessions + main pane + status line)
 * - `AskStream` (VirtualizedMessageList + streaming tool cards)
 * - `Composer` (InputBar, trimmed to @mention + multiline)
 * - Triggered `WikiPermissionDialog` on every `write_page`
 *
 * Implemented in S3 (CCD soul injection sprint).
 */
export function AskPage() {
  return (
    <PageStub
      icon="💬"
      title="Ask · 跟你的外脑对话"
      tagline="CCD 灵魂 ①+② · 工作台骨架 + 流式会话 · 可 @raw/页 作引用 · 写操作走 PermissionDialog"
      sprint="S3"
    />
  );
}
