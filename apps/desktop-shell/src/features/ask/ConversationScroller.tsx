/**
 * Conversation scroll container — messages start from top, input stays
 * at bottom. Auto-scrolls to bottom on new messages.
 */

import {
  type ReactNode,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useState,
} from "react";

interface ScrollCtx {
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

const ScrollContext = createContext<ScrollCtx>({
  isAtBottom: true,
  scrollToBottom: () => {},
});

export function useStickToBottomContext() {
  return useContext(ScrollContext);
}

export function ConversationScroller({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Auto-scroll on content change if user was at bottom
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkBottom);
  }, [checkBottom]);

  return (
    <ScrollContext.Provider value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={scrollRef}
        style={{ flex: "1 1 0%", overflowY: "auto", minHeight: 0 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
          {children}
        </div>
      </div>
    </ScrollContext.Provider>
  );
}
