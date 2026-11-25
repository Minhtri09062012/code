import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { streamAiChat } from '../../ai/gemini.ts';
import { AiChatContext, AiChatHistoryItem } from '../../ai/aiPrompts.ts';
import { getLesson, getProblem } from '../../core/registry.ts';
import { getExamSet } from '../../problems/sets/index.ts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: number;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const STORAGE_KEY = 'codetrekking_ai_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'codetrekking_ai_chat_active_v1';
const SYNC_EVENT = 'codetrekking_ai_chat_sync';

function createSession(title = 'Cuộc trò chuyện mới'): ChatSession {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    messages: [],
    updatedAt: Date.now(),
  };
}

function loadSessionsFromStorage(): ChatSession[] {
  if (typeof window === 'undefined') return [createSession()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createSession()];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [createSession()];
}

function loadActiveSessionId(sessions: ChatSession[]): string {
  if (typeof window === 'undefined') return sessions[0].id;
  try {
    const savedId = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (savedId && sessions.some((s) => s.id === savedId)) {
      return savedId;
    }
  } catch {
    // ignore
  }
  return sessions[0].id;
}

function saveToStorage(sessions: ChatSession[], activeId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
    window.localStorage.setItem(ACTIVE_SESSION_KEY, activeId);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  } catch {
    // ignore quota errors
  }
}

export function useRouteAiContext(): AiChatContext {
  const location = useLocation();

  return useMemo(() => {
    const path = location.pathname;

    if (path.startsWith('/concept/')) {
      const id = path.replace('/concept/', '');
      const lesson = getLesson(id);
      return {
        pathname: path,
        kind: 'concept',
        itemTitle: lesson?.title,
        itemSummary: lesson?.content?.task?.statement || lesson?.summary,
      };
    }

    if (path.startsWith('/algorithm/')) {
      const id = path.replace('/algorithm/', '');
      const lesson = getLesson(id);
      return {
        pathname: path,
        kind: 'algorithm',
        itemTitle: lesson?.title,
        itemSummary: lesson?.content?.task?.statement || lesson?.summary,
      };
    }

    if (path.startsWith('/problem/')) {
      const id = path.replace('/problem/', '');
      const problem = getProblem(id);
      return {
        pathname: path,
        kind: 'problem',
        itemTitle: problem?.title,
        itemSummary: problem?.task?.statement,
      };
    }

    if (path.startsWith('/exam/')) {
      const setId = path.replace('/exam/', '');
      const examSet = getExamSet(setId);
      return {
        pathname: path,
        kind: 'exam',
        itemTitle: examSet?.title,
      };
    }

    if (path.startsWith('/ide')) {
      return {
        pathname: path,
        kind: 'ide',
        itemTitle: 'IDE Python CodeTrekking',
      };
    }

    return {
      pathname: path,
      kind: 'general',
    };
  }, [location.pathname]);
}

export function useAiChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessionsFromStorage());
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    loadActiveSessionId(loadSessionsFromStorage())
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usePageContext, setUsePageContext] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const routeContext = useRouteAiContext();

  // Sync across multiple mounted instances (Widget <-> ChatPage)
  useEffect(() => {
    const handleSync = () => {
      if (isStreaming) return;
      const latest = loadSessionsFromStorage();
      setSessions(latest);
      setActiveSessionId(loadActiveSessionId(latest));
    };

    window.addEventListener(SYNC_EVENT, handleSync);
    return () => window.removeEventListener(SYNC_EVENT, handleSync);
  }, [isStreaming]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      if (isStreaming) return;
      setErrorMsg(null);
      setActiveSessionId(sessionId);
      saveToStorage(sessions, sessionId);
    },
    [isStreaming, sessions]
  );

  const createNewSession = useCallback(() => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setErrorMsg(null);
    const fresh = createSession();
    const updated = [fresh, ...sessions].slice(0, 20);
    setSessions(updated);
    setActiveSessionId(fresh.id);
    saveToStorage(updated, fresh.id);
  }, [isStreaming, sessions]);

  const deleteSession = useCallback(
    (sessionId: string) => {
      if (isStreaming && activeSessionId === sessionId) {
        abortControllerRef.current?.abort();
        setIsStreaming(false);
      }
      const remaining = sessions.filter((s) => s.id !== sessionId);
      const nextSessions = remaining.length > 0 ? remaining : [createSession()];
      const nextActive =
        activeSessionId === sessionId ? nextSessions[0].id : activeSessionId;
      setSessions(nextSessions);
      setActiveSessionId(nextActive);
      saveToStorage(nextSessions, nextActive);
    },
    [activeSessionId, isStreaming, sessions]
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isStreaming) return;

      setErrorMsg(null);

      const targetSession = activeSession || createSession();
      const userMessage: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
      };
      const assistantMsgId = `msg_a_${Date.now() + 1}`;
      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        role: 'model',
        text: '',
        createdAt: Date.now() + 1,
      };

      const history: AiChatHistoryItem[] = targetSession.messages
        .filter((m) => !m.error && m.text.trim().length > 0)
        .map((m) => ({ role: m.role, text: m.text }));

      const nextTitle =
        targetSession.messages.length === 0
          ? trimmed.slice(0, 46) + (trimmed.length > 46 ? '...' : '')
          : targetSession.title;

      const updatedWithUser: ChatSession = {
        ...targetSession,
        title: nextTitle,
        messages: [...targetSession.messages, userMessage, assistantPlaceholder],
        updatedAt: Date.now(),
      };

      const baseSessions = sessions.some((s) => s.id === targetSession.id)
        ? sessions.map((s) => (s.id === targetSession.id ? updatedWithUser : s))
        : [updatedWithUser, ...sessions];

      setSessions(baseSessions);
      setActiveSessionId(targetSession.id);
      saveToStorage(baseSessions, targetSession.id);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);

      let finalText = '';

      try {
        finalText = await streamAiChat({
          message: trimmed,
          history,
          context: usePageContext ? routeContext : undefined,
          signal: controller.signal,
          onDelta: (chunk) => {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== targetSession.id) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === assistantMsgId ? { ...m, text: m.text + chunk } : m
                  ),
                };
              })
            );
          },
        });

        setSessions((prev) => {
          const persisted = prev.map((s) => {
            if (s.id !== targetSession.id) return s;
            return {
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text: finalText || m.text || 'Xin lỗi, thầy/cô chưa tạo được câu trả lời. Em thử hỏi lại nhé.',
                    }
                  : m
              ),
            };
          });
          saveToStorage(persisted, targetSession.id);
          return persisted;
        });
      } catch (err: any) {
        if (controller.signal.aborted) {
          setSessions((prev) => {
            saveToStorage(prev, targetSession.id);
            return prev;
          });
          return;
        }

        const friendlyError =
          err?.message || 'Không thể kết nối tới Trợ lý AI lúc này. Vui lòng thử lại.';
        setErrorMsg(friendlyError);

        setSessions((prev) => {
          const errored = prev.map((s) => {
            if (s.id !== targetSession.id) return s;
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      error: true,
                      text: m.text || friendlyError,
                    }
                  : m
              ),
            };
          });
          saveToStorage(errored, targetSession.id);
          return errored;
        });
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
    },
    [activeSession, isStreaming, routeContext, sessions, usePageContext]
  );

  const retryLastMessage = useCallback(() => {
    if (!activeSession || isStreaming) return;
    const msgs = [...activeSession.messages];
    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const actualUserIdx = msgs.length - 1 - lastUserIdx;
    const lastUserText = msgs[actualUserIdx].text;

    const trimmedMsgs = msgs.slice(0, actualUserIdx);
    const cleanedSession: ChatSession = {
      ...activeSession,
      messages: trimmedMsgs,
    };

    const nextSessions = sessions.map((s) =>
      s.id === activeSession.id ? cleanedSession : s
    );
    setSessions(nextSessions);
    saveToStorage(nextSessions, activeSession.id);

    setTimeout(() => {
      sendMessage(lastUserText);
    }, 0);
  }, [activeSession, isStreaming, sendMessage, sessions]);

  return {
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
  };
}
