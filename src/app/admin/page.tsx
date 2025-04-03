'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatTimeDifference } from '@/lib/utils';

interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  focusMode: string;
}

interface Message {
  content: string;
  role: 'assistant' | 'user';
  createdAt: string;
}

const AdminDashboard = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('AdminDashboard component mounted');
    const fetchAllChats = async () => {
      console.log('Fetching all chats...');
      try {
        const res = await fetch('/api/admin/chats');
        console.log('API response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('API error response:', errorText);
          throw new Error(`Failed to fetch chats: ${res.status} ${errorText}`);
        }
        
        const data = await res.json();
        console.log('Received chats data:', data);
        setChats(data.chats);
      } catch (error) {
        console.error('Error fetching chats:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch chats');
      } finally {
        setLoading(false);
      }
    };

    fetchAllChats();
  }, []);

  const fetchChatMessages = async (chatId: string) => {
    console.log('Fetching messages for chat:', chatId);
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      console.log('Messages API response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Messages API error response:', errorText);
        throw new Error(`Failed to fetch messages: ${res.status} ${errorText}`);
      }
      
      const data = await res.json();
      console.log('Received messages data:', data);
      setMessages(data.messages.map((msg: any) => ({
        ...msg,
        ...JSON.parse(msg.metadata)
      })));
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch messages');
    }
  };

  const handleChatClick = (chat: Chat) => {
    console.log('Chat clicked:', chat);
    setSelectedChat(chat);
    fetchChatMessages(chat.id);
  };

  if (loading) {
    console.log('Rendering loading state');
    return (
      <div className="flex flex-row items-center justify-center min-h-screen">
        <svg
          aria-hidden="true"
          className="w-8 h-8 text-light-200 fill-light-secondary dark:text-[#202020] animate-spin dark:fill-[#ffffff3b]"
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100.003 78.2051 78.1951 100.003 50.5908 100C22.9765 99.9972 0.997224 78.018 1 50.4037C1.00281 22.7993 22.8108 0.997224 50.4251 1C78.0395 1.00281 100.018 22.8108 100 50.4251ZM9.08164 50.594C9.06312 73.3997 27.7909 92.1272 50.5966 92.1457C73.4023 92.1642 92.1298 73.4365 92.1483 50.6308C92.1669 27.8251 73.4392 9.0973 50.6335 9.07878C27.8278 9.06026 9.10003 27.787 9.08164 50.594Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4037 97.8624 35.9116 96.9801 33.5533C95.1945 28.8227 92.871 24.3692 90.0681 20.348C85.6237 14.1775 79.4473 9.36872 72.0454 6.45794C64.6435 3.54717 56.3134 2.65431 48.3133 3.89319C45.869 4.27179 44.3768 6.77534 45.014 9.20079C45.6512 11.6262 48.1343 13.0956 50.5786 12.717C56.5073 11.8281 62.5542 12.5399 68.0406 14.7911C73.527 17.0422 78.2187 20.7487 81.5841 25.4923C83.7976 28.5886 85.4467 32.059 86.4416 35.7474C87.1273 38.1189 89.5423 39.6781 91.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    console.log('Rendering error state:', error);
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  console.log('Rendering dashboard with chats:', chats);
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chats List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">All Chats</h2>
          {chats.length === 0 ? (
            <p className="text-black/70 dark:text-white/70 text-sm">
              No chats found.
            </p>
          ) : (
            <div className="space-y-4">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`p-4 rounded-lg cursor-pointer transition-colors ${
                    selectedChat?.id === chat.id
                      ? 'bg-blue-50 dark:bg-blue-900'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => handleChatClick(chat)}
                >
                  <div className="font-medium">{chat.title}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    User ID: {chat.userId}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Created: {formatTimeDifference(new Date(), chat.createdAt)} ago
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages View */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            {selectedChat ? 'Chat Messages' : 'Select a chat to view messages'}
          </h2>
          {selectedChat && (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-gray-50 dark:bg-gray-700'
                      : 'bg-blue-50 dark:bg-blue-900'
                  }`}
                >
                  <div className="font-medium mb-2">
                    {message.role === 'user' ? 'User' : 'Assistant'}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {formatTimeDifference(new Date(), message.createdAt)} ago
                  </div>
                </div>
              ))}
              <Link
                href={`/c/${selectedChat.id}`}
                className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                View Full Chat
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 