import React, { useState, useMemo, useEffect } from 'react';
import { User, Message } from '../types';
import { InboxIcon, PaperAirplaneIcon, TrashIcon, EditIcon, CloseIcon, MailIcon } from './icons';

interface InternalMessagesProps {
  currentUser: User;
  users: User[];
  messages: Message[];
  onSendMessage: (message: Omit<Message, 'id' | 'senderId' | 'senderName' | 'timestamp'>) => void;
  onMarkAsRead: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  initialMessage?: { subject: string; body: string } | null;
  onClearInitialMessage: () => void;
}

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays <= 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString();
};

const initials = (name?: string) => (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';
const AVATAR_TONES = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700'];
const avatarTone = (key: string) => AVATAR_TONES[Array.from(key).reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_TONES.length];

const Avatar: React.FC<{ name?: string; size?: 'sm' | 'md' }> = ({ name, size = 'sm' }) => (
  <span className={`${size === 'md' ? 'w-10 h-10 text-sm' : 'w-9 h-9 text-xs'} rounded-full flex items-center justify-center font-semibold shrink-0 ${avatarTone(name || '?')}`}>
    {initials(name)}
  </span>
);


const InternalMessages: React.FC<InternalMessagesProps> = ({ currentUser, users, messages, onSendMessage, onMarkAsRead, onDeleteMessage, initialMessage, onClearInitialMessage }) => {
    const [view, setView] = useState<'inbox' | 'sent'>('inbox');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [composeState, setComposeState] = useState<{ recipientId: string; subject: string; body: string }>({ recipientId: '', subject: '', body: '' });
    const [showCompose, setShowCompose] = useState(false);

    const inboxMessages = useMemo(() => messages.filter(m => m.recipientId === currentUser.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [messages, currentUser.id]);
    const sentMessages = useMemo(() => messages.filter(m => m.senderId === currentUser.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [messages, currentUser.id]);
    const otherUsers = useMemo(() => users.filter(u => u.id !== currentUser.id && u.status === 'ACTIVE').sort((a,b) => a.fullName.localeCompare(b.fullName)), [users, currentUser.id]);

    useEffect(() => {
        if (initialMessage) {
            handleCompose(); // This opens the compose view
            setComposeState(prevState => ({
                ...prevState,
                subject: initialMessage.subject,
                body: initialMessage.body,
            }));
            onClearInitialMessage();
        }
    }, [initialMessage, onClearInitialMessage]);

    const handleSelectMessage = (message: Message) => {
        setSelectedMessage(message);
        if (!message.isRead && message.recipientId === currentUser.id) {
            onMarkAsRead(message.id);
        }
        setShowCompose(false);
    };
    
    const handleCompose = (replyTo?: Message) => {
        if (replyTo) {
             setComposeState({
                recipientId: replyTo.senderId,
                subject: replyTo.subject.startsWith('Re: ') ? replyTo.subject : `Re: ${replyTo.subject}`,
                body: `\n\n------------------------------\nOn ${new Date(replyTo.timestamp).toLocaleString()}, ${replyTo.senderName} wrote:\n\n${replyTo.body}`,
            });
        } else {
             setComposeState({ recipientId: '', subject: '', body: '' });
        }
        setSelectedMessage(null);
        setShowCompose(true);
    };

    const handleSend = () => {
        if (!composeState.recipientId) {
            alert("Please select a recipient."); return;
        }
        if (!composeState.subject.trim()) {
            alert("Subject cannot be empty."); return;
        }
         if (!composeState.body.trim()) {
            alert("Message body cannot be empty."); return;
        }
        onSendMessage({
            ...composeState,
            isRead: false,
        });
        setShowCompose(false);
        setComposeState({ recipientId: '', subject: '', body: '' });
    };
    
    const currentList = view === 'inbox' ? inboxMessages : sentMessages;
    const unreadCount = inboxMessages.filter(m => !m.isRead).length;
    // A message deleted elsewhere (or just now) should no longer be shown as open.
    const activeMessage = selectedMessage ? messages.find(m => m.id === selectedMessage.id) || null : null;
    const detailOpen = showCompose || !!activeMessage;
    const userName = (id: string) => users.find(u => u.id === id)?.fullName;
    const fieldCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';

    const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
        <button onClick={onClick} aria-label="Back to messages" className="md:hidden -ml-1.5 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
    );

    return (
    <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <InboxIcon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Internal messages</h2>
                    <p className="text-sm text-slate-500">{unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'} · {inboxMessages.length} received · {sentMessages.length} sent</p>
                </div>
            </div>
            <button onClick={() => handleCompose()} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shrink-0">
                <EditIcon className="w-4 h-4" /> New message
            </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex h-[calc(100vh-15rem)] min-h-[30rem] overflow-hidden">
            {/* Left pane: message list */}
            <aside className={`${detailOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 md:border-r border-slate-200 flex-col min-w-0 shrink-0`}>
                <div className="p-3 border-b border-slate-100">
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                        <button onClick={() => setView('inbox')} className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg ${view === 'inbox' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            Inbox
                            {unreadCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[11px] leading-none font-bold bg-indigo-600 text-white tabular-nums">{unreadCount}</span>}
                        </button>
                        <button onClick={() => setView('sent')} className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${view === 'sent' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Sent</button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {currentList.length > 0 ? (
                        <ul className="divide-y divide-slate-100">
                            {currentList.map(msg => {
                                const unread = !msg.isRead && view === 'inbox';
                                const counterpart = view === 'inbox' ? msg.senderName : (userName(msg.recipientId) || 'Unknown');
                                const active = activeMessage?.id === msg.id;
                                return (
                                    <li key={msg.id}>
                                        <button onClick={() => handleSelectMessage(msg)}
                                            className={`w-full text-left px-4 py-3 flex gap-3 border-l-2 focus:outline-none ${active ? 'bg-indigo-50/60 border-indigo-600' : 'border-transparent hover:bg-slate-50 focus-visible:bg-slate-50'}`}>
                                            <Avatar name={counterpart} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <p className={`text-sm truncate ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{view === 'sent' && <span className="text-slate-400 font-normal">To: </span>}{counterpart}</p>
                                                    <time className={`text-xs shrink-0 tabular-nums ${unread ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>{formatDate(msg.timestamp)}</time>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className={`text-sm truncate flex-1 ${unread ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{msg.subject}</p>
                                                    {unread && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" aria-label="Unread" />}
                                                </div>
                                                <p className="text-xs text-slate-400 mt-0.5 truncate">{msg.body.trim()}</p>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="px-6 py-16 text-center">
                            <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                                {view === 'inbox' ? <InboxIcon className="w-6 h-6" /> : <PaperAirplaneIcon className="w-6 h-6" />}
                            </div>
                            <p className="mt-4 text-sm font-semibold text-slate-900">{view === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}</p>
                            <p className="mt-1 text-sm text-slate-500">{view === 'inbox' ? 'Messages from your colleagues will appear here.' : 'Messages you send will appear here.'}</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Right pane: message view or compose */}
            <main className={`${detailOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
                {showCompose ? (
                    <div className="flex flex-col h-full min-h-0">
                        <header className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center gap-3">
                            <BackButton onClick={() => setShowCompose(false)} />
                            <h3 className="flex-1 text-base font-semibold text-slate-900 truncate">New message</h3>
                            <button onClick={() => setShowCompose(false)} aria-label="Discard" className="hidden md:inline-flex p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><CloseIcon className="w-5 h-5" /></button>
                        </header>
                        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="min-w-0">
                                    <label htmlFor="msg-recipient" className="block text-xs font-medium text-slate-500 mb-1">To</label>
                                    <select id="msg-recipient" value={composeState.recipientId} onChange={e => setComposeState(p => ({...p, recipientId: e.target.value}))} className={fieldCls} required>
                                        <option value="" disabled>Select a recipient...</option>
                                        {otherUsers.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                                    </select>
                                </div>
                                <div className="min-w-0">
                                    <label htmlFor="msg-subject" className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
                                    <input id="msg-subject" type="text" value={composeState.subject} onChange={e => setComposeState(p => ({...p, subject: e.target.value}))} className={fieldCls} placeholder="What is this about?" required/>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col min-h-[12rem]">
                                <label htmlFor="msg-body" className="block text-xs font-medium text-slate-500 mb-1">Message</label>
                                <textarea id="msg-body" value={composeState.body} onChange={e => setComposeState(p => ({...p, body: e.target.value}))} className={`${fieldCls} flex-1 resize-none leading-relaxed`} placeholder="Type your message here..."></textarea>
                            </div>
                        </div>
                        <footer className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
                            <button onClick={() => setShowCompose(false)} className="px-4 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">Discard</button>
                            <button onClick={handleSend} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                                <PaperAirplaneIcon className="h-4 w-4"/> Send
                            </button>
                        </footer>
                    </div>
                ) : activeMessage ? (
                    <div className="flex flex-col h-full min-h-0">
                        <header className="px-4 sm:px-6 py-4 border-b border-slate-100">
                            <div className="flex items-start gap-3">
                                <BackButton onClick={() => setSelectedMessage(null)} />
                                <h3 className="flex-1 min-w-0 text-lg font-semibold text-slate-900 break-words">{activeMessage.subject}</h3>
                            </div>
                            <div className="mt-3 flex items-center gap-3 min-w-0">
                                <Avatar name={activeMessage.senderName} size="md" />
                                <div className="min-w-0 flex-1 text-sm">
                                    <p className="font-semibold text-slate-900 truncate">{activeMessage.senderName}</p>
                                    <p className="text-slate-500 truncate">To {userName(activeMessage.recipientId) || 'Me'}</p>
                                </div>
                                <time className="hidden sm:block text-xs text-slate-400 shrink-0 tabular-nums">{new Date(activeMessage.timestamp).toLocaleString()}</time>
                            </div>
                            <time className="sm:hidden mt-2 block text-xs text-slate-400 tabular-nums">{new Date(activeMessage.timestamp).toLocaleString()}</time>
                        </header>
                        <div className="px-4 sm:px-6 py-5 overflow-y-auto flex-1 min-h-0">
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{activeMessage.body}</p>
                        </div>
                        <footer className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
                            <button onClick={() => onDeleteMessage(activeMessage.id)} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-rose-600 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 hover:border-rose-200">
                                <TrashIcon className="w-4 h-4" /> Delete
                            </button>
                            <button onClick={() => handleCompose(activeMessage)} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                                Reply
                            </button>
                        </footer>
                    </div>
                ) : (
                    <div className="flex flex-col h-full items-center justify-center text-center p-8">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><MailIcon className="w-6 h-6" /></div>
                        <h3 className="mt-4 text-sm font-semibold text-slate-900">Select a message</h3>
                        <p className="mt-1 text-sm text-slate-500">Choose a message from the list to read it, or start a new one.</p>
                    </div>
                )}
            </main>
        </div>
    </div>
  );
};

export default InternalMessages;
