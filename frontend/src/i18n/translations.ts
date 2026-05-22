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
    assistants: string;
    models: string;
    noFriends: string;
    noGroups: string;
    noDMs: string;
    createGroup: string;
    sendMessage: string;
    addFriend: string;
    online: string;
    lastSeen: string;
    offline: string;
    requestPending: string;
  };
  transcript: {
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    scrollToBottom: string;
    newMessages: string;
    loadingOlder: string;
    newMessagesDivider: string;
    emptyDmTitle: string;
    emptyDmDescription: string;
    emptyGroupTitle: string;
    emptyGroupDescription: string;
    selected: string;
    contextSelect: string;
    contextCopy: string;
    contextDelete: string;
    contextForward: string;
    contextForwardTo: string;
    contextSelectRecipient: string;
    contextSend: string;
    contextCancel: string;
    selectAll: string;
    copySelected: string;
    copiedCount: string;
  };
  input: {
    placeholder: string;
    replyTo: string;
    characters: string;
    dmPlaceholder: string;
    groupPlaceholder: string;
    pastedImage: string;
    sendImage: string;
    recording: string;
    dropFiles: string;
    escapeToCancel: string;
    cancel: string;
    save: string;
    fileTooLarge: string;
    uploadFailed: string;
  };
  message: {
    edited: string;
    forward: string;
    copy: string;
    delete: string;
    select: string;
    read: string;
    sent: string;
    copied: string;
    deleteConfirm: string;
    deleteWarning: string;
  };
  system: {
    userJoined: string;
    userLeft: string;
    userOnline: string;
    connectionLost: string;
    typing: string;
    typingTwo: string;
    typingMany: string;
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
    somethingWentWrong: string;
    reloadMessage: string;
    reload: string;
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
    nameErrorEmpty: string;
    nameErrorTooLong: string;
    noUsersAvailable: string;
  };
  forward: {
    title: string;
    selectRecipient: string;
    noUsers: string;
    cancel: string;
    forward: string;
  };
  friend: {
    accept: string;
    reject: string;
    decline: string;
    mentionedYou: string;
    view: string;
    dismiss: string;
  };
  profile: {
    sendMessage: string;
    addFriend: string;
    blockUser: string;
    unblockUser: string;
  };
  search: {
    placeholder: string;
    typeToSearch: string;
    notFound: string;
    notFoundInConversation: string;
    searchError: string;
    toggleSearch: string;
  };
  emoji: {
    search: string;
    recent: string;
    noResults: string;
    smileys: string;
    gestures: string;
    hearts: string;
    objects: string;
    misc: string;
  };
  model: {
    selectModel: string;
    closeSelector: string;
    selected: string;
  };
  settings: {
    sound: string;
    soundOn: string;
    soundOff: string;
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
    assistants: "助手",
    models: "模型",
    noFriends: "暂无好友",
    noGroups: "暂无群组",
    noDMs: "暂无私信",
    createGroup: "创建群组",
    sendMessage: "发送消息",
    addFriend: "添加好友",
    online: "在线",
    lastSeen: "最后在线 {{time}}",
    offline: "离线",
    requestPending: "请求待处理",
  },
  transcript: {
    loading: "加载消息中...",
    emptyTitle: "暂无消息",
    emptyDescription: "成为第一个发送消息的人吧！",
    scrollToBottom: "回到底部",
    newMessages: "{{count}} 条新消息",
    loadingOlder: "加载更早的消息...",
    newMessagesDivider: "新消息",
    emptyDmTitle: "暂无消息",
    emptyDmDescription: "向 {{username}} 发送第一条消息吧！",
    emptyGroupTitle: "暂无消息",
    emptyGroupDescription: "向 {{name}} 发送第一条消息吧！",
    selected: "已选择 {{count}} 条",
    contextSelect: "选择",
    contextCopy: "复制",
    contextDelete: "删除",
    contextForward: "转发",
    contextForwardTo: "转发给：",
    contextSelectRecipient: "选择接收者...",
    contextSend: "发送",
    contextCancel: "取消",
    selectAll: "全选",
    copySelected: "复制选中",
    copiedCount: "已复制 {{count}} 条消息",
  },
  input: {
    placeholder: "输入消息... (Shift+Enter 换行)",
    replyTo: "回复",
    characters: "{{current}}/{{max}}",
    dmPlaceholder: "发送私信给 {{username}}...",
    groupPlaceholder: "发送消息到 {{name}}...",
    pastedImage: "已粘贴图片",
    sendImage: "发送图片",
    recording: "正在录制语音消息...",
    dropFiles: "拖拽文件到这里",
    escapeToCancel: "按 Esc 取消",
    cancel: "取消",
    save: "保存",
    fileTooLarge: "文件过大（最大 20MB）",
    uploadFailed: "上传失败",
  },
  message: {
    edited: "（已编辑）",
    forward: "转发",
    copy: "复制",
    delete: "删除",
    select: "选择",
    read: "已读",
    sent: "已发送",
    copied: "已复制",
    deleteConfirm: "确认删除这条消息？",
    deleteWarning: "此操作不可撤销。",
  },
  system: {
    userJoined: "{{username}} 加入了聊天室",
    userLeft: "{{username}} 离开了聊天室",
    userOnline: "{{username}} 上线了",
    connectionLost: "连接已断开，正在尝试重新连接...",
    typing: "{{username}} 正在输入...",
    typingTwo: "{{name1}} 和 {{name2}} 正在输入...",
    typingMany: "{{name}} 和另外 {{count}} 人正在输入...",
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
    somethingWentWrong: "出错了",
    reloadMessage: "发生了意外错误，请尝试刷新页面。",
    reload: "刷新页面",
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
    nameErrorEmpty: "群组名称不能为空",
    nameErrorTooLong: "群组名称过长（最多30个字符）",
    noUsersAvailable: "没有好友或在线用户可添加",
  },
  forward: {
    title: "转发消息",
    selectRecipient: "选择接收者：",
    noUsers: "没有其他在线用户",
    cancel: "取消",
    forward: "转发",
  },
  friend: {
    accept: "接受",
    reject: "拒绝",
    decline: "拒绝",
    mentionedYou: "提到了你",
    view: "查看",
    dismiss: "关闭",
  },
  profile: {
    sendMessage: "发送消息",
    addFriend: "添加好友",
    blockUser: "屏蔽用户",
    unblockUser: "取消屏蔽",
  },
  search: {
    placeholder: "搜索消息...",
    typeToSearch: "输入关键词搜索消息",
    notFound: "未找到消息",
    notFoundInConversation: "此对话中无消息",
    searchError: "搜索出错，请重试",
    toggleSearch: "切换搜索",
  },
  emoji: {
    search: "搜索表情...",
    recent: "最近使用",
    noResults: "未找到表情",
    smileys: "表情",
    gestures: "手势",
    hearts: "爱心",
    objects: "物品",
    misc: "其他",
  },
  model: {
    selectModel: "选择模型",
    closeSelector: "关闭",
    selected: "已选择",
  },
  settings: {
    sound: "音效",
    soundOn: "音效已开启",
    soundOff: "音效已关闭",
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
    assistants: "Assistants",
    models: "Models",
    noFriends: "No friends yet",
    noGroups: "No groups yet",
    noDMs: "No DMs yet",
    createGroup: "Create Group",
    sendMessage: "Send Message",
    addFriend: "Add Friend",
    online: "Online",
    lastSeen: "Last seen {{time}}",
    offline: "Offline",
    requestPending: "Request pending",
  },
  transcript: {
    loading: "Loading messages...",
    emptyTitle: "No messages yet",
    emptyDescription: "Be the first to send a message!",
    scrollToBottom: "Scroll to bottom",
    newMessages: "{{count}} new messages",
    loadingOlder: "Loading older messages...",
    newMessagesDivider: "New messages",
    emptyDmTitle: "No messages yet",
    emptyDmDescription: "Send your first message to {{username}}!",
    emptyGroupTitle: "No messages yet",
    emptyGroupDescription: "Send the first message to {{name}}!",
    selected: "{{count}} selected",
    contextSelect: "Select",
    contextCopy: "Copy",
    contextDelete: "Delete",
    contextForward: "Forward",
    contextForwardTo: "Forward to:",
    contextSelectRecipient: "Select recipient...",
    contextSend: "Send",
    contextCancel: "Cancel",
    selectAll: "Select All",
    copySelected: "Copy Selected",
    copiedCount: "Copied {{count}} messages",
  },
  input: {
    placeholder: "Type a message... (Shift+Enter for new line)",
    replyTo: "Reply to",
    characters: "{{current}}/{{max}}",
    dmPlaceholder: "Send DM to {{username}}...",
    groupPlaceholder: "Send message to {{name}}...",
    pastedImage: "Pasted image",
    sendImage: "Send image",
    recording: "Recording voice message...",
    dropFiles: "Drop files here",
    escapeToCancel: "Escape to cancel",
    cancel: "Cancel",
    save: "Save",
    fileTooLarge: "File too large (max 20MB)",
    uploadFailed: "Upload failed",
  },
  message: {
    edited: "(edited)",
    forward: "Forward",
    copy: "Copy",
    delete: "Delete",
    select: "Select",
    read: "Read",
    sent: "Sent",
    copied: "Copied",
    deleteConfirm: "Delete message?",
    deleteWarning: "This cannot be undone.",
  },
  system: {
    userJoined: "{{username}} joined the chat",
    userLeft: "{{username}} left the chat",
    userOnline: "{{username}} is now online",
    connectionLost: "Connection lost, attempting to reconnect...",
    typing: "{{username}} is typing...",
    typingTwo: "{{name1}} and {{name2}} are typing...",
    typingMany: "{{name}} and {{count}} others are typing...",
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
    somethingWentWrong: "Something went wrong",
    reloadMessage: "An unexpected error occurred. Please try reloading the page.",
    reload: "Reload",
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
    nameErrorEmpty: "Group name cannot be empty",
    nameErrorTooLong: "Group name too long (max 30 chars)",
    noUsersAvailable: "No friends or online users to add",
  },
  forward: {
    title: "Forward Message",
    selectRecipient: "Select recipient:",
    noUsers: "No other users online",
    cancel: "Cancel",
    forward: "Forward",
  },
  friend: {
    accept: "Accept",
    reject: "Reject",
    decline: "Decline",
    mentionedYou: "mentioned you",
    view: "View",
    dismiss: "Dismiss",
  },
  profile: {
    sendMessage: "Send Message",
    addFriend: "Add Friend",
    blockUser: "Block User",
    unblockUser: "Unblock User",
  },
  search: {
    placeholder: "Search messages...",
    typeToSearch: "Type to search messages",
    notFound: "No messages found",
    notFoundInConversation: "No messages in this conversation",
    searchError: "Search error — please try again",
    toggleSearch: "toggle search",
  },
  emoji: {
    search: "Search emoji...",
    recent: "Recent",
    noResults: "No emojis found",
    smileys: "Smileys",
    gestures: "Gestures",
    hearts: "Hearts",
    objects: "Objects",
    misc: "Misc",
  },
  model: {
    selectModel: "Select Model",
    closeSelector: "Close",
    selected: "Selected",
  },
  settings: {
    sound: "Sound",
    soundOn: "Sound on",
    soundOff: "Sound off",
  },
};

export const translations: Record<Language, TranslationDict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export const STORAGE_KEY = "tokendance:lang";

export function detectLanguage(): Language {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en-US") return stored;
  } catch {
    // localStorage may throw in restrictive environments (iframe sandbox,
    // private browsing in older browsers).  Fall through to navigator.
  }
  const navLang =
    navigator.language ||
    (navigator as { userLanguage?: string }).userLanguage ||
    "";
  if (navLang.startsWith("zh")) return "zh-CN";
  return "en-US";
}
