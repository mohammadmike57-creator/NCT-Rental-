import React, { useState, useMemo, useEffect } from 'react';
import { User, Message } from '../types';
import { InboxIcon, PaperAirplaneIcon, TrashIcon, EditIcon, CloseIcon } from './icons';

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

    return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 flex h-[calc(100vh-150px)] overflow-hidden">
        {/* Left Pane: Sidebar and Message List */}
        <aside className="w-full md:w-1/3 xl:w-1/4 border-r flex flex-col">
            <header className="p-4 border-b space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800">Messages</h2>
                     <button onClick={() => handleCompose()} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm rounded-md hover:bg-secondary">
                        <EditIcon /> Compose
                    </button>
                </div>
                 <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setView('inbox')} className={`flex-1 p-2 text-sm font-medium rounded-md ${view === 'inbox' ? 'bg-white shadow' : 'text-gray-600'}`}>Inbox ({inboxMessages.filter(m => !m.isRead).length})</button>
                    <button onClick={() => setView('sent')} className={`flex-1 p-2 text-sm font-medium rounded-md ${view === 'sent' ? 'bg-white shadow' : 'text-gray-600'}`}>Sent</button>
                </div>
            </header>
            <div className="overflow-y-auto flex-grow">
                {currentList.length > 0 ? (
                    <ul>
                        {currentList.map(msg => {
                            const recipient = users.find(u => u.id === msg.recipientId);
                            return (
                                <li key={msg.id}>
                                    <button onClick={() => handleSelectMessage(msg)} className={`w-full text-left p-4 border-b hover:bg-gray-50 focus:outline-none focus:bg-blue-50 ${selectedMessage?.id === msg.id ? 'bg-blue-50' : ''}`}>
                                        <div className={`flex justify-between items-start ${!msg.isRead && view === 'inbox' ? 'font-bold' : ''}`}>
                                            <p className="text-sm truncate">{view === 'inbox' ? msg.senderName : `To: ${recipient?.fullName || 'Unknown'}`}</p>
                                            <time className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatDate(msg.timestamp)}</time>
                                        </div>
                                        <p className={`text-sm mt-1 truncate ${!msg.isRead && view === 'inbox' ? 'text-gray-800' : 'text-gray-600'}`}>{msg.subject}</p>
                                        <p className="text-xs text-gray-400 mt-1 truncate">{msg.body}</p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="p-6 text-center text-gray-500">
                        <InboxIcon className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                        <p>No messages in your {view}.</p>
                    </div>
                )}
            </div>
        </aside>

        {/* Right Pane: Message View or Compose */}
        <main className="w-full md:w-2/3 xl:w-3/4 flex flex-col">
            {showCompose ? (
                // Compose View
                <div className="flex flex-col h-full">
                    <header className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700">New Message</h3>
                        <button onClick={() => setShowCompose(false)}><CloseIcon/></button>
                    </header>
                    <div className="p-4 space-y-4">
                         <div>
                            <label className="text-sm font-medium text-gray-600">To:</label>
                            <select value={composeState.recipientId} onChange={e => setComposeState(p => ({...p, recipientId: e.target.value}))} className="w-full p-2 mt-1 border rounded-md" required>
                                <option value="" disabled>Select a recipient...</option>
                                {otherUsers.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Subject:</label>
                            <input type="text" value={composeState.subject} onChange={e => setComposeState(p => ({...p, subject: e.target.value}))} className="w-full p-2 mt-1 border rounded-md" required/>
                        </div>
                    </div>
                    <div className="flex-grow p-4 pt-0">
                        <textarea value={composeState.body} onChange={e => setComposeState(p => ({...p, body: e.target.value}))} className="w-full h-full p-2 border rounded-md resize-none" placeholder="Type your message here..."></textarea>
                    </div>
                    <footer className="p-4 border-t bg-gray-50 text-right">
                         <button onClick={handleSend} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary ml-auto">
                            <PaperAirplaneIcon className="h-5 w-5"/> Send
                        </button>
                    </footer>
                </div>
            ) : selectedMessage ? (
                // Message View
                <div className="flex flex-col h-full">
                    <header className="p-4 border-b">
                        <h3 className="font-semibold text-gray-800 text-lg">{selectedMessage.subject}</h3>
                        <div className="flex justify-between items-center mt-2 text-sm">
                            <div>
                                <p className="text-gray-500">From: <span className="font-medium text-gray-700">{selectedMessage.senderName}</span></p>
                                <p className="text-gray-500">To: <span className="font-medium text-gray-700">{users.find(u => u.id === selectedMessage.recipientId)?.fullName || 'Me'}</span></p>
                            </div>
                            <time className="text-gray-500">{new Date(selectedMessage.timestamp).toLocaleString()}</time>
                        </div>
                    </header>
                    <div className="p-4 overflow-y-auto flex-grow">
                        <p className="whitespace-pre-wrap text-gray-700">{selectedMessage.body}</p>
                    </div>
                    <footer className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                        <button onClick={() => onDeleteMessage(selectedMessage.id)} className="flex items-center gap-1.5 px-3 py-2 bg-red-100 text-red-700 text-sm rounded-md hover:bg-red-200">
                            <TrashIcon /> Delete
                        </button>
                        <button onClick={() => handleCompose(selectedMessage)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-secondary">
                            Reply
                        </button>
                    </footer>
                </div>
            ) : (
                // Placeholder
                 <div className="flex flex-col h-full items-center justify-center text-gray-400 p-8">
                    <InboxIcon className="h-20 w-20 text-gray-300 mb-4"/>
                    <h2 className="text-xl font-semibold">Select a message</h2>
                    <p>Choose a message from the list to read its content.</p>
                </div>
            )}
        </main>
    </div>
  );
};

export default InternalMessages;