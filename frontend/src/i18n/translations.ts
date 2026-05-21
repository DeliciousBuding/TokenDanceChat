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
    dmWith: string;
    groupChat: string;
    publicChat: string;
    dmIndicator: string;
    groupIndicator: string;
    deletedMessage: string;
  };
  sidebar: {
    publicChat: string;
    publicChatSub: string;
    onlineUsers: string;
    emptyState: string;
    connectedAs: string;
    you: string;
    friends: string;
    groups: string;
    directMessages: string;
    noFriends: string;
    noGroups: string;
    noDMs: string;
    createGroup: string;
    sendMessage: string;
    addFriend: string;
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
    dmPlaceholder: string;
    groupPlaceholder: string;
  };
  system: {
    userJoined: string;
    userLeft: string;
    userOnline: string;
    connectionLost: string;
    typing: string;
    friendRejected: string;
    groupInvited: string;
    friendRequest: string;
    friendAccepted: string;
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
  group: {
    createTitle: string;
    namePlaceholder: string;
    selectMembers: string;
    create: string;
    cancel: string;
    created: string;
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
    dmWith: "与 {{username}} 的私聊",
    groupChat: "群聊: {{name}}",
    publicChat: "公共聊天",
    dmIndicator: "私信",
    groupIndicator: "群聊",
    deletedMessage: "此消息已被删除",
  },
  sidebar: {
    publicChat: "公共聊天",
    publicChatSub: "Public Chat Room",
    onlineUsers: "在线用户",
    emptyState: "暂无在线用户",
    connectedAs: "已连接为",
    you: "你",
    friends: "好友",
    groups: "群组",
    directMessages: "私信",
    noFriends: "暂无好友",
    noGroups: "暂无群组",
    noDMs: "暂无私信",
    createGroup: "创建群组",
    sendMessage: "发送消息",
    addFriend: "添加好友",
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
    dmPlaceholder: "发送私信给 {{username}}...",
    groupPlaceholder: "发送消息到 {{name}}...",
  },
  system: {
    userJoined: "{{username}} 加入了聊天室",
    userLeft: "{{username}} 离开了聊天室",
    userOnline: "{{username}} 上线了",
    connectionLost: "连接已断开，正在尝试重新连接...",
    typing: "{{username}} 正在输入...",
    friendRejected: "{{username}} 拒绝了你的好友请求",
    groupInvited: "{{username}} 邀请你加入群组 {{group}}",
    friendRequest: "{{username}} 向你发送了好友请求",
    friendAccepted: "{{username}} 接受了你的好友请求",
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
  group: {
    createTitle: "创建群组",
    namePlaceholder: "群组名称...",
    selectMembers: "选择成员",
    create: "创建",
    cancel: "取消",
    created: "群组 {{name}} 已创建",
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
    dmWith: "DM with {{username}}",
    groupChat: "Group: {{name}}",
    publicChat: "Public Chat",
    dmIndicator: "DM",
    groupIndicator: "Group",
    deletedMessage: "This message was deleted",
  },
  sidebar: {
    publicChat: "Public Chat",
    publicChatSub: "Public Chat Room",
    onlineUsers: "Online Users",
    emptyState: "No users online",
    connectedAs: "Connected as",
    you: "You",
    friends: "Friends",
    groups: "Groups",
    directMessages: "Direct Messages",
    noFriends: "No friends yet",
    noGroups: "No groups yet",
    noDMs: "No DMs yet",
    createGroup: "Create Group",
    sendMessage: "Send Message",
    addFriend: "Add Friend",
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
    dmPlaceholder: "Send DM to {{username}}...",
    groupPlaceholder: "Send message to {{name}}...",
  },
  system: {
    userJoined: "{{username}} joined the chat",
    userLeft: "{{username}} left the chat",
    userOnline: "{{username}} is now online",
    connectionLost: "Connection lost, attempting to reconnect...",
    typing: "{{username}} is typing...",
    friendRejected: "{{username}} rejected your friend request",
    groupInvited: "{{username}} invited you to group {{group}}",
    friendRequest: "{{username}} sent you a friend request",
    friendAccepted: "{{username}} accepted your friend request",
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
  group: {
    createTitle: "Create Group",
    namePlaceholder: "Group name...",
    selectMembers: "Select members",
    create: "Create",
    cancel: "Cancel",
    created: "Group {{name}} created",
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
  const navLang =
    navigator.language ||
    (navigator as { userLanguage?: string }).userLanguage ||
    "";
  if (navLang.startsWith("zh")) return "zh-CN";
  return "en-US";
}
