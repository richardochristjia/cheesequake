import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { NotificationItem } from '../App';
import { BUTTON_TAP, SNAPPY_SPRING } from '../lib/motion';
import { ToastBody } from './PingToaster';

export interface NotificationBellProps {
  notifications: NotificationItem[];
  onOpenNotification: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

export function NotificationBell({
  notifications,
  onOpenNotification,
  onMarkAllRead,
  onClear,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.reduce(
    (count, item) => (item.read ? count : count + 1),
    0,
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        whileTap={BUTTON_TAP}
        whileHover={{ y: -0.5 }}
        transition={SNAPPY_SPRING}
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#f4ede2]/15 bg-[#211c16]/80 px-2.5 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer"
      >
        <Bell className="h-4 w-4 text-[#e59a28]" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#e59a28] px-1 text-[10px] font-bold leading-none text-[#110e0b] tabular-nums"
          >
            {unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notification history"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={SNAPPY_SPRING}
            className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#e59a28]/35 bg-[#211c16]/95 text-[#f4ede2] shadow-[0_14px_36px_rgba(4,3,2,0.75)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#f4ede2]/10 px-3.5 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#f4ede2]">
                Notifications
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={unreadCount === 0}
                  className="text-xs font-medium text-[#e59a28] hover:text-[#f59e0b] disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  Mark all read
                </button>
                <span className="text-[#f4ede2]/20" aria-hidden="true">
                  |
                </span>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={notifications.length === 0}
                  className="text-xs font-medium text-[#cfc3b4] hover:text-[#f4ede2] disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[#cfc3b4]">
                No notifications yet.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-[#f4ede2]/10">
                {notifications.map((item) => (
                  <button
                    key={item.toast.id}
                    type="button"
                    data-read={item.read ? 'true' : 'false'}
                    onClick={() => {
                      onOpenNotification(item);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#2d251d]/70 cursor-pointer ${
                      item.read ? 'opacity-70' : 'bg-[#e59a28]/[0.04]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        item.read ? 'bg-transparent' : 'bg-[#e59a28]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <ToastBody toast={item.toast} />
                      <p className="mt-1 text-[11px] tabular-nums text-[#cfc3b4]/80">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
