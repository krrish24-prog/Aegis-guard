import React from 'react';
import { Star, Pin, Forward, Reply, Smile, X, Trash2 } from 'lucide-react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface MessageActionsProps {
  messageId: string;
  isPinned?: boolean;
  isOwnMessage?: boolean;
  reactions?: Record<string, { emoji: string; userIds: string[]; count: number }>;
  currentUserId: string;
  theme: 'light' | 'dark' | 'glow';
  onReact: (emoji: string) => void;
  onPin: () => void;
  onUnpin: () => void;
  onForward: () => void;
  onReply: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function MessageActions({
  messageId, isPinned, isOwnMessage, reactions, currentUserId, theme, onReact, onPin, onUnpin, onForward, onReply, onDelete, onClose,
}: MessageActionsProps) {
  const cardClass = theme === 'glow'
    ? 'bg-emerald-950 border-emerald-500/30 text-white'
    : theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-zinc-200 text-zinc-900 shadow-xl';

  return (
    <div className={`absolute z-50 bottom-full mb-2 left-0 rounded-2xl border p-3 min-w-[200px] ${cardClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Actions</span>
        <button onClick={onClose} className="opacity-40 hover:opacity-100"><X className="w-3 h-3" /></button>
      </div>

      <div className="flex gap-1 mb-3">
        {QUICK_REACTIONS.map((emoji) => {
          const reacted = reactions?.[emoji]?.userIds?.includes(currentUserId);
          return (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={`w-8 h-8 rounded-lg text-sm transition-all hover:scale-110 ${
                reacted ? 'bg-emerald-500/30 ring-1 ring-emerald-500' : 'hover:bg-white/10'
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <button onClick={onReply} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors">
          <Reply className="w-3.5 h-3.5" /> Reply
        </button>
        <button onClick={onForward} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors">
          <Forward className="w-3.5 h-3.5" /> Forward
        </button>
        <button
          onClick={isPinned ? onUnpin : onPin}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
        >
          <Pin className="w-3.5 h-3.5" /> {isPinned ? 'Unpin' : 'Pin'} Message
        </button>
        {isOwnMessage && onDelete && (
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete for Everyone
          </button>
        )}
      </div>

      {reactions && Object.keys(reactions).length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1">
          {Object.entries(reactions).map(([emoji, r]) => (
            r.userIds?.length > 0 && (
              <span key={emoji} className="text-xs bg-white/10 px-2 py-0.5 rounded-full">
                {emoji} {r.userIds.length}
              </span>
            )
          ))}
        </div>
      )}
    </div>
  );
}
