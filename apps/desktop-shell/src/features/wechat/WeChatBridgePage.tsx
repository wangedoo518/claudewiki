import { PageStub } from "@/components/PageStub";

/**
 * WeChat Bridge · 个微 iLink 漏斗 (wireframes.html §02, D2 override)
 *
 * IMPORTANT: per the user's D2 override (commit 6617945), this page
 * does NOT configure an enterprise-WeChat outbound bot + cloud
 * wechat-ingest microservice. Instead it surfaces the EXISTING
 * personal-WeChat iLink pipeline that Phase 1-2 of (8) already wired
 * up (rust/crates/desktop-core/src/wechat_ilink/):
 * - QR login + account persistence
 * - long-poll monitor with DesktopAgentHandler
 * - per-account session mapping into the upcoming `~/.clawwiki/raw/`
 *   pipeline (S5 rewires the handler's output path)
 *
 * Implemented in S5 (wire wechat_ilink → ~/.clawwiki/raw). Before S5
 * this page should just show the existing account state + QR login CTA
 * reusing the Phase 6C UI so the user doesn't lose their working setup.
 */
export function WeChatBridgePage() {
  return (
    <PageStub
      icon="🔗"
      title="WeChat Bridge · 个微 iLink 漏斗"
      tagline="微信怎么接进来的 — 个微 iLink 登录 · 长轮询监听 · 转发入 raw/ · D2 override (保留 Phase 1-2)"
      sprint="S5 (iLink)"
    />
  );
}
