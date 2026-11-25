import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Square,
  RotateCcw,
  Sparkles,
  User,
  Copy,
  Check,
  AlertCircle,
  BookOpen,
  Code2,
  Cpu,
  Plus,
} from 'lucide-react';
import { ChatMessage } from './useAiChat.ts';
import { AiChatContext } from '../../ai/aiPrompts.ts';
import { ChatMessageContent } from './ChatMessageContent.tsx';

interface AiChatViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  errorMsg: string | null;
  routeContext: AiChatContext;
  usePageContext: boolean;
  onTogglePageContext: (enabled: boolean) => void;
  onSendMessage: (text: string) => void;
  onStopGenerating: () => void;
  onRetryLast: () => void;
  onNewChat?: () => void;
  variant?: 'full' | 'drawer';
}

export const AiChatView: React.FC<AiChatViewProps> = ({
  messages,
  isStreaming,
  errorMsg,
  routeContext,
  usePageContext,
  onTogglePageContext,
  onSendMessage,
  onStopGenerating,
  onRetryLast,
  onNewChat,
  variant = 'full',
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new tokens arrive
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const suggestedPrompts = React.useMemo(() => {
    if (routeContext.itemTitle && routeContext.kind !== 'general' && routeContext.kind !== 'ide') {
      return [
        {
          icon: BookOpen,
          label: `Giải thích ý tưởng "${routeContext.itemTitle}" từng bước`,
          prompt: `Hãy giải thích giúp em ý tưởng cốt lõi của bài "${routeContext.itemTitle}" một cách dễ hiểu và trực quan từng bước.`,
        },
        {
          icon: AlertCircle,
          label: 'Các trường hợp biên dễ bị sai test',
          prompt: `Với bài "${routeContext.itemTitle}", em cần chú ý những trường hợp biên (edge cases) nào để không bị mất điểm test?`,
        },
        {
          icon: Cpu,
          label: 'Phân tích độ phức tạp thời gian',
          prompt: `Độ phức tạp thời gian và bộ nhớ tối ưu cho bài "${routeContext.itemTitle}" là bao nhiêu, và vì sao?`,
        },
      ];
    }

    return [
      {
        icon: Cpu,
        label: 'Phân biệt độ phức tạp O(N) và O(N²)',
        prompt: 'Giải thích giúp em cách ước lượng độ phức tạp O(N) vs O(N²) trong đề thi HSG Tin học với ví dụ Python đơn giản.',
      },
      {
        icon: Code2,
        label: 'Cách dùng mảng cộng dồn (Prefix Sum)',
        prompt: 'Cho em ví dụ và cách cài đặt mảng cộng dồn (Prefix Sum) trong Python để tính tổng đoạn [L, R] nhanh nhất.',
      },
      {
        icon: BookOpen,
        label: 'Tìm lỗi sai trong code Python của em',
        prompt: 'Em muốn dán một đoạn code Python bị sai test hoặc báo lỗi, thầy/cô hướng dẫn em cách debug từng bước nhé!',
      },
      {
        icon: Sparkles,
        label: 'Kỹ thuật Cửa sổ trượt (Sliding Window)',
        prompt: 'Giải thích kỹ thuật Cửa sổ trượt (Sliding Window) bằng một ví dụ minh hoạ trace từng bước biến chạy.',
      },
    ];
  }, [routeContext.itemTitle, routeContext.kind]);

  const hasContextBanner = Boolean(
    routeContext.itemTitle && routeContext.kind && routeContext.kind !== 'general'
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950/60">
      {/* Context Bar (if viewing a specific lesson/problem/IDE) */}
      {hasContextBanner && (
        <div className="px-3.5 py-2 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold shrink-0">
              <Sparkles className="w-3 h-3" />
              Ngữ cảnh
            </span>
            <span className="text-slate-300 truncate font-medium">
              {routeContext.itemTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTogglePageContext(!usePageContext)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
              usePageContext
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {usePageContext ? 'Đang bật' : 'Đã tắt'}
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto px-3.5 sm:px-5 py-4 space-y-4 ${
          variant === 'drawer' ? 'min-h-[260px]' : ''
        }`}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/10">
              <Bot className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mb-1">
              Xin chào! Em cần hỗ trợ gì về Python & Thuật toán?
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-5 leading-relaxed">
              Hỏi bất cứ điều gì về cú pháp Python, phân tích độ phức tạp, trace vòng lặp hay tìm lỗi sai trong code của em.
            </p>

            <div
              className={`grid gap-2 w-full text-left ${
                variant === 'full' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {suggestedPrompts.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSendMessage(item.prompt)}
                    className="group p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/50 transition-all text-left flex items-start gap-2.5 cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-blue-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-slate-200 group-hover:text-white leading-snug">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLastAssistant = !isUser && idx === messages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 sm:gap-3 ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                    isUser
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : msg.error
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`group relative max-w-[86%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 border ${
                    isUser
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-950/30'
                      : msg.error
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                      : 'bg-slate-900/95 border-slate-800 text-slate-100'
                  }`}
                >
                  {isUser ? (
                    <div className="text-[13px] sm:text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>
                  ) : (
                    <ChatMessageContent
                      content={msg.text}
                      isStreaming={isStreaming && isLastAssistant}
                    />
                  )}

                  {!isUser && msg.text && !(isStreaming && isLastAssistant) && (
                    <div className="mt-2 pt-1.5 border-t border-slate-800/70 flex items-center justify-end gap-2">
                      {msg.error && (
                        <button
                          type="button"
                          onClick={onRetryLast}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Thử lại</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-[11px] transition-colors cursor-pointer"
                        title="Sao chép câu trả lời"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inline error notice if any */}
      {errorMsg && (
        <div className="mx-3.5 mb-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2 text-xs text-rose-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={onRetryLast}
            disabled={isStreaming}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white font-semibold shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-800 bg-slate-900/80 shrink-0"
      >
        <div className="flex items-end gap-2 bg-slate-950 border border-slate-700/80 focus-within:border-blue-500 rounded-2xl p-2 transition-colors">
          {onNewChat && messages.length > 0 && variant === 'drawer' && (
            <button
              type="button"
              onClick={onNewChat}
              title="Cuộc trò chuyện mới"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi Python, thuật toán hoặc dán code cần giải thích..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none py-1.5 px-1.5 max-h-36 leading-relaxed"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStopGenerating}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer"
              title="Dừng trả lời"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Dừng</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
              title="Gửi câu hỏi (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          )}
        </div>
        <div className="mt-1.5 px-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>Enter để gửi • Shift + Enter để xuống dòng</span>
          <span className="hidden sm:inline">Trợ lý AI CodeTrekking</span>
        </div>
      </form>
    </div>
  );
};
