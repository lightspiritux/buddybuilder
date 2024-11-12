import React, { useState } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { useChatHistory } from '../../lib/persistence';
import { HistoryItem } from './HistoryItem';
import * as Dialog from '@radix-ui/react-dialog';
import type { ChatHistoryItem } from '../../lib/persistence/useChatHistory';

export const Menu: React.FC = () => {
  const location = useLocation();
  const { initialMessages, ready } = useChatHistory();
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handleDelete = (event: React.UIEvent) => {
    event.preventDefault();
    // TODO: Implement chat deletion
    console.log('Delete chat:', selectedChat);
  };

  const chatItems: ChatHistoryItem[] = initialMessages.map((message, index) => ({
    id: String(index),
    urlId: String(index),
    description: message.content || 'New Chat',
    messages: [message],
    timestamp: new Date().toISOString()
  }));

  const filteredChats = chatItems.filter(chat => 
    (chat.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog.Root>
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-2 border-r border-bolt-elements-border transition-all duration-300 ${isOpen ? 'w-64' : 'w-16'}`}>
        <div className="flex items-center justify-between p-4 border-b border-bolt-elements-border">
          <button
            onClick={toggleMenu}
            className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 focus:outline-none"
            aria-label={isOpen ? 'Collapse menu' : 'Expand menu'}
          >
            <svg
              className={`w-6 h-6 transition-transform ${isOpen ? 'rotate-0' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isOpen ? 'M4 6h16M4 12h16M4 18h16' : 'M6 18L18 6M6 6l12 12'}
              />
            </svg>
          </button>
          {isOpen && (
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3 rounded-lg hover:bg-bolt-elements-background-depth-4 focus:outline-none focus:ring-2 focus:ring-bolt-elements-border"
            >
              New Chat
            </Link>
          )}
        </div>

        {isOpen && (
          <div className="p-4 border-b border-bolt-elements-border">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-border rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-border text-bolt-elements-textPrimary"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isOpen ? (
            <div className="space-y-1 p-2">
              {filteredChats.map((chat) => (
                <HistoryItem
                  key={chat.id}
                  item={chat}
                  onDelete={(event) => {
                    setSelectedChat(chat.id);
                    handleDelete(event);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4">
              <Link
                to="/"
                className="p-2 mb-2 text-bolt-elements-textSecondary rounded-lg hover:bg-bolt-elements-background-depth-3"
                title="New Chat"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-bolt-elements-background-depth-2 p-6 rounded-lg shadow-xl">
          <Dialog.Title className="text-lg font-medium text-bolt-elements-textPrimary mb-4">
            Delete Chat
          </Dialog.Title>
          <Dialog.Description className="text-bolt-elements-textSecondary mb-6">
            Are you sure you want to delete this chat? This action cannot be undone.
          </Dialog.Description>
          <div className="flex justify-end gap-4">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded-lg hover:bg-bolt-elements-background-depth-4">
                Cancel
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">
                Delete
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
