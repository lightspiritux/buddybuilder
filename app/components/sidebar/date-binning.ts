export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
  }>;
}

export function groupChatsByDate(chats: Chat[]): Record<string, Chat[]> {
  const groups: Record<string, Chat[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  chats.forEach(chat => {
    const chatDate = new Date(chat.updatedAt);
    let dateKey: string;

    if (isSameDay(chatDate, today)) {
      dateKey = 'Today';
    } else if (isSameDay(chatDate, yesterday)) {
      dateKey = 'Yesterday';
    } else if (isWithinLastWeek(chatDate, today)) {
      dateKey = 'Last 7 Days';
    } else if (isWithinLastMonth(chatDate, today)) {
      dateKey = 'Last 30 Days';
    } else {
      dateKey = 'Older';
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(chat);
  });

  // Sort chats within each group by updatedAt
  Object.values(groups).forEach(groupChats => {
    groupChats.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });

  return groups;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isWithinLastWeek(date: Date, today: Date): boolean {
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return date > weekAgo;
}

function isWithinLastMonth(date: Date, today: Date): boolean {
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  return date > monthAgo;
}
