import React, { useState } from 'react';
import {
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeft,
  Sparkles,
  Code2,
  Cpu,
  X,
} from 'lucide-react';
import { useAiChat } from '../chat/useAiChat.ts';
import { AiChatView } from '../chat/AiChatView.tsx';

export const ChatPage: React.FC = () => {
  const {
    sessions,
    activeSession,
    isStreaming,
    errorMsg,
    routeContext,
    usePageContext,
    setUsePageContext,
    selectSession,
    createNewSession,
    deleteSession,
    sendMessage,
    stopGenerating,
    retryLastMessage,
  } = useAiChat();

  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  const renderSessionList = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            createNewSession();
            setMobileHistoryOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cuộc trò chuyện mới</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Lịch sử trò chuyện ({sessions.length})
        </div>

        {sessions.map((session) => {
          const isActive = session.id === activeSession?.id;
          return (
            <div
              key={session.id}
              className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                isActive
                  ? 'bg-blue-600/15 border-blue-500/40 text-white'
                  : 'bg-slate-900/50 border-transparent hover:bg-slate-800/80 text-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  selectSession(session.id);
                  setMobileHistoryOpen(false);
                }}
                className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
              >
                <MessageSquare
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-blue-400' : 'text-slate-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{session.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {session.messages.length} tin nhắn
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                title="Xoá cuộc trò chuyện"
                className="opacity-70 lg:opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-800 bg-slate-900/60 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Trợ lý chuyên Python & HSG</span>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <span className="flex items-center gap-1">
            <Code2 className="w-3 h-3" /> Debug code
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" /> Trace thuật toán
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 flex-1 flex flex-col min-h-0">
      {/* Top Page Header */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Mở lịch sử trò chuyện"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shrink-0">
            <Bot className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-white truncate">
              Trợ lý AI Lập trình & Thuật toán
            </h1>
            <p className="text-xs text-slate-400 truncate">
              Giải đáp Python, phân tích độ phức tạp, sửa lỗi code và luyện thi Tin học trẻ / HSG
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={createNewSession}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>Chat mới</span>
        </button>
      </div>

      {/* Main Chat Container */}
      <div className="flex-1 min-h-[540px] h-[calc(100vh-12rem)] rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex shadow-2xl">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-72 border-r border-slate-800 bg-slate-900/90 shrink-0">
          {renderSessionList()}
        </aside>

        {/* Chat Conversation Area */}
        <main className="flex-1 min-w-0 flex flex-col">
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
            variant="full"
          />
        </main>
      </div>

      {/* Mobile History Drawer */}
      {mobileHistoryOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex"
          onClick={() => setMobileHistoryOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 h-full flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Lịch sử Chat AI</span>
              <button
                type="button"
                onClick={() => setMobileHistoryOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{renderSessionList()}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
