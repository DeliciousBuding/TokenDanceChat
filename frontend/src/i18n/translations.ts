export type Language = "zh-CN" | "en-US";

export interface TranslationDict {
  join: {
    title: string;
    subtitle: string;
    placeholder: string;
    buttonJoin: string;
    buttonConnecting: string;
    footer: string;
    errorEmpty: string;
    errorTooShort: string;
    errorTooLong: string;
    errorInvalidChars: string;
  };
  chat: {
    roomName: string;
    subtitle: string;
    leave: string;
    disconnect: string;
  };
  sidebar: {
    publicChat: string;
    publicChatSub: string;
    onlineUsers: string;
    emptyState: string;
    connectedAs: string;
    you: string;
  };
  transcript: {
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    scrollToBottom: string;
    newMessages: string;
  };
  input: {
    placeholder: string;
    replyTo: string;
    characters: string;
  };
  system: {
    userJoined: string;
    userLeft: string;
    connectionLost: string;
    typing: string;
  };
  error: {
    timeout: string;
    closed: string;
    cannotConnect: string;
    unknown: string;
  };
  lang: {
    switchTo: string;
    label: string;
  };
}

const zhCN: TranslationDict = {
  join: {
    title: "TokenDance Chat",
    subtitle: "输入用户名加入公共聊天室",
    placeholder: "你的用户名...",
    buttonJoin: "加入聊天",
    buttonConnecting: "连接中...",
    footer: "公共聊天室 · 文明交流",
    errorEmpty: "请输入用户名",
    errorTooShort: "用户名至少需要2个字符",
    errorTooLong: "用户名不能超过20个字符",
    errorInvalidChars: "用户名只能包含中文、英文、数字和下划线",
  },
  chat: {
    roomName: "公共聊天",
    subtitle: "在线聊天室",
    leave: "离开",
    disconnect: "断开连接",
  },
  sidebar: {
    publicChat: "公共聊天",
    publicChatSub: "Public Chat Room",
    onlineUsers: "在线用户",
    emptyState: "暂无在线用户",
    connectedAs: "已连接为",
    you: "你",
  },
  transcript: {
    loading: "加载消息中...",
    emptyTitle: "暂无消息",
    emptyDescription: "成为第一个发送消息的人吧！",
    scrollToBottom: "回到底部",
    newMessages: "{{count}} 条新消息",
  },
  input: {
    placeholder: "输入消息... (Shift+Enter 换行)",
    replyTo: "回复",
    characters: "{{current}}/{{max}}",
  },
  system: {
    userJoined: "{{username}} 加入了聊天室",
    userLeft: "{{username}} 离开了聊天室",
    connectionLost: "连接已断开，正在尝试重新连接...",
    typing: "{{username}} 正在输入...",
  },
  error: {
    timeout: "连接超时，请检查服务器是否运行",
    closed: "连接已关闭",
    cannotConnect: "无法连接到聊天服务器",
    unknown: "连接服务器失败，请确保服务器正在运行",
  },
  lang: {
    switchTo: "English",
    label: "切换语言",
  },
};

const enUS: TranslationDict = {
  join: {
    title: "TokenDance Chat",
    subtitle: "Enter a username to join the public chat room",
    placeholder: "Your username...",
    buttonJoin: "Join Chat",
    buttonConnecting: "Connecting...",
    footer: "Public Chat Room · Be respectful",
    errorEmpty: "Please enter a username",
    errorTooShort: "Username must be at least 2 characters",
    errorTooLong: "Username cannot exceed 20 characters",
    errorInvalidChars:
      "Username can only contain letters, numbers, Chinese characters, and underscores",
  },
  chat: {
    roomName: "Public Chat",
    subtitle: "Online Chat Room",
    leave: "Leave",
    disconnect: "Disconnect",
  },
  sidebar: {
    publicChat: "Public Chat",
    publicChatSub: "Public Chat Room",
    onlineUsers: "Online Users",
    emptyState: "No users online",
    connectedAs: "Connected as",
    you: "You",
  },
  transcript: {
    loading: "Loading messages...",
    emptyTitle: "No messages yet",
    emptyDescription: "Be the first to send a message!",
    scrollToBottom: "Scroll to bottom",
    newMessages: "{{count}} new messages",
  },
  input: {
    placeholder: "Type a message... (Shift+Enter for new line)",
    replyTo: "Reply to",
    characters: "{{current}}/{{max}}",
  },
  system: {
    userJoined: "{{username}} joined the chat",
    userLeft: "{{username}} left the chat",
    connectionLost: "Connection lost, attempting to reconnect...",
    typing: "{{username}} is typing...",
  },
  error: {
    timeout: "Connection timed out. Please check if the server is running",
    closed: "Connection closed",
    cannotConnect: "Could not connect to the chat server",
    unknown: "Failed to connect to server. Please ensure the server is running",
  },
  lang: {
    switchTo: "中文",
    label: "Switch language",
  },
};

export const translations: Record<Language, TranslationDict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export const STORAGE_KEY = "tokendance:lang";

export function detectLanguage(): Language {
  if (typeof window === "undefined") return "zh-CN";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") return stored;
  const navLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || "";
  if (navLang.startsWith("zh")) return "zh-CN";
  return "en-US";
}
