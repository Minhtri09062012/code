import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, Maximize2, X, Sparkles, Plus } from 'lucide-react';
import { routes } from '../../core/routes.ts';
import { useAiChat } from './useAiChat.ts';
import { AiChatView } from './AiChatView.tsx';

export const AiChatWidget: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const {
    activeSession,
    isStreaming,
    errorMsg,
    routeContext,
    usePageContext,
    setUsePageContext,
    createNewSession,
    sendMessage,
    stopGenerating,
    retryLastMessage,
  } = useAiChat();

  // Ẩn widget khi đang ở trang Chat chuyên biệt
  if (location.pathname.startsWith('/chat')) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40">
      {isOpen ? (
        <div className="w-[calc(100vw-2rem)] sm:w-[400px] md:w-[430px] h-[520px] max-h-[calc(100vh-7rem)] rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-slate-950/80 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-sm shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="truncate">Trợ lý AI Python</span>
                  <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Hỏi đáp thuật toán & sửa code tức thì
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={createNewSession}
                title="Cuộc trò chuyện mới"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <Link
                to={routes.chat()}
                onClick={() => setIsOpen(false)}
                title="Mở giao diện toàn màn hình"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu gọn"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <AiChatView
              messages={activeSession?.messages || []}
              isStreaming={isStreaming}
              errorMsg={errorMsg}
              routeContext={routeContext}
              usePageContext={usePageContext}
              onTogglePageContext={setUsePageContext}
              onSendMessage={sendMessage}
              onStopGenerating={stopGenerating}
              onRetryLast={retryLastMessage}
              onNewChat={createNewSession}
              variant="drawer"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Mở Trợ lý AI"
          className="group flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-950/60 border border-blue-400/30 transition-all hover:scale-[1.03] cursor-pointer"
        >
          <Bot className="w-5 h-5" />
          <span className="hidden sm:inline">Hỏi Trợ lý AI</span>
        </button>
      )}
    </div>
  );
};

export default AiChatWidget;
