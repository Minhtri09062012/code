import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { Navbar } from './Navbar.tsx';
import { BottomTabBar } from './BottomTabBar.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { getPageTitle, checkRoutesIntegrity } from '../../core/routes.ts';
import { getLesson, getProblem, devWarnings } from '../../core/registry.ts';
import { getExamSet } from '../../problems/sets/index.ts';
import {
  logComponentMount,
  isReloadDetected,
  auditInternalLinksInDOM,
} from '../../core/devMonitor.ts';
import { AlertCircle, AlertTriangle } from 'lucide-react';

const routeIntegrity = checkRoutesIntegrity();

export const RootLayout: React.FC = () => {
  const location = useLocation();
  const navType = useNavigationType();

  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');
  const [domAuditErrors, setDomAuditErrors] = useState<string[]>([]);
  const scrollPositions = useRef<Record<string, number>>({});
  const lastKeyRef = useRef<string>(location.key);

  // ĐO KIỂM: Ghi nhận số lần mount của RootLayout (chỉ được 1 lần)
  useEffect(() => {
    logComponentMount('rootLayout');
  }, []);

  // Kiểm tra liên kết DOM ở chế độ dev
  useEffect(() => {
    const timer = setTimeout(() => {
      const audit = auditInternalLinksInDOM();
      if (!audit.ok) {
        setDomAuditErrors(audit.violations);
        console.error('[Dev Audit Quy tắc 19] Phát hiện lỗi thẻ liên kết:', audit.violations);
      } else {
        setDomAuditErrors([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  // XỬ LÝ TIÊU ĐỀ, FOCUS H1 VÀ KHÔI PHỤC CUỘN (Quy tắc 3)
  useEffect(() => {
    // 1. Xác định tiêu đề chi tiết theo route & dữ liệu thực
    let itemTitle: string | undefined = undefined;
    const path = location.pathname;

    if (path.startsWith('/concept/')) {
      const id = path.replace('/concept/', '');
      const lesson = getLesson(id);
      if (lesson) itemTitle = lesson.title;
    } else if (path.startsWith('/algorithm/')) {
      const id = path.replace('/algorithm/', '');
      const lesson = getLesson(id);
      if (lesson) itemTitle = lesson.title;
    } else if (path.startsWith('/problem/')) {
      const id = path.replace('/problem/', '');
      const problem = getProblem(id);
      if (problem) itemTitle = problem.title;
    } else if (path.startsWith('/exam/')) {
      const setId = path.replace('/exam/', '');
      const examSet = getExamSet(setId);
      if (examSet) itemTitle = examSet.title;
    }

    const fullTitle = getPageTitle(path, itemTitle);
    document.title = fullTitle;
    setLiveAnnouncement(fullTitle);

    // 2. Chuyển focus đến tiêu đề h1 mới (tabIndex = -1) cho công nghệ hỗ trợ
    const focusTimer = setTimeout(() => {
      const h1 = document.querySelector('h1') as HTMLElement | null;
      if (h1) {
        if (!h1.hasAttribute('tabindex')) {
          h1.setAttribute('tabindex', '-1');
        }
        h1.focus({ preventScroll: true });
      }
    }, 100);

    // 3. Khôi phục / Thiết lập vị trí cuộn
    const prevKey = lastKeyRef.current;
    // Lưu lại vị trí cuộn của trang trước
    const learningContainer = document.getElementById('learning-content-scroll');
    const currentScrollY = learningContainer ? learningContainer.scrollTop : window.scrollY;
    scrollPositions.current[prevKey] = currentScrollY;

    if (navType === 'POP') {
      // Người dùng bấm Back/Forward: Khôi phục vị trí cuộn cũ
      const savedPos = scrollPositions.current[location.key] || 0;
      if (learningContainer) {
        learningContainer.scrollTop = savedPos;
      } else {
        window.scrollTo({ top: savedPos, behavior: 'instant' as ScrollBehavior });
      }
    } else {
      // Điều hướng mới (PUSH/REPLACE): Cuộn vùng nội dung về đầu trang (không cuộn sidebar)
      if (learningContainer) {
        learningContainer.scrollTop = 0;
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }

    lastKeyRef.current = location.key;

    return () => clearTimeout(focusTimer);
  }, [location.pathname, location.key, navType]);

  const isLearningRoute =
    location.pathname.startsWith('/concept') ||
    location.pathname.startsWith('/algorithm');

  const reloadDetected = isReloadDetected();

  return (
    <div className="relative min-h-screen flex flex-col pb-16 lg:pb-0 bg-slate-950 text-slate-100">
      {/* Vùng aria-live thông báo tên trang cho trợ năng */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      {/* 1. Dev banner nếu phát hiện tải lại toàn trang (Document-level Reload) */}
      {reloadDetected && (
        <div className="bg-rose-600 text-white text-xs px-4 py-2 font-mono text-center font-bold flex items-center justify-center gap-2 shadow-md z-50">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            [Dev Audit Quy tắc 19 & 20] Phát hiện tải lại toàn trang (Document Reload)! Ứng dụng vừa bị tải lại từ máy chủ/trình duyệt thay vì Client-side Navigation.
          </span>
        </div>
      )}

      {/* 2. Dev banner nếu có lỗi định tuyến Quy tắc 18 */}
      {!routeIntegrity.ok && (
        <div className="bg-amber-600 text-white text-xs px-4 py-1.5 font-mono text-center font-bold flex items-center justify-center gap-2 z-50">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Cảnh báo Quy tắc 18: {routeIntegrity.errors.join(' | ')}</span>
        </div>
      )}

      {/* 3. Dev banner nếu có vi phạm thẻ liên kết <a> nội bộ */}
      {domAuditErrors.length > 0 && (
        <div className="bg-rose-700 text-white text-xs px-4 py-1.5 font-mono text-center font-bold flex items-center justify-center gap-2 z-50">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Lỗi Quy tắc 19: {domAuditErrors.join(' | ')}</span>
        </div>
      )}

      {/* Dev banner nếu có cảnh báo chuẩn hóa dữ liệu */}
      {devWarnings.length > 0 && (
        <div className="bg-amber-600 text-white text-xs px-4 py-1.5 font-mono text-center font-bold flex items-center justify-center gap-2 z-50">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Cảnh báo chuẩn hóa dữ liệu: {devWarnings.join(' | ')}</span>
        </div>
      )}

      {/* 4. Khung Header (AppHeader / Navbar) - Giữ nguyên không bị hủy khi đổi trang */}
      <Navbar showSidebarToggle={isLearningRoute} />

      {/* 5. Vùng nội dung được bảo vệ bởi ErrorBoundary */}
      <div className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary fallbackTitle="Trang này đang gặp lỗi">
          <Outlet />
        </ErrorBoundary>
      </div>

      {/* 6. Thanh điều hướng tab bar dưới đáy cho thiết bị di động */}
      <BottomTabBar />
    </div>
  );
};
export default RootLayout;
