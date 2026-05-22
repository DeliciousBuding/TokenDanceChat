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
    pinned: string;
    pinConversation: string;
    unpinConversation: string;
    muteConversation: string;
    unmuteConversation: string;
    muted: string;
    archived: string;
    archivedSection: string;
    archiveConversation: string;
    unarchiveConversation: string;
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
    editingMessage: string;
  };
  message: {
    edited: string;
    forward: string;
    copy: string;
    delete: string;
    select: string;
    read: string;
    readBy: string;
    sent: string;
    copied: string;
    deleteConfirm: string;
    deleteWarning: string;
    edit: string;
    pin: string;
    contextMenu: string;
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
    // Group admin
    groupInfo: string;
    members: string;
    owner: string;
    admin: string;
    member: string;
    kickMember: string;
    promoteAdmin: string;
    demoteMember: string;
    transferOwnership: string;
    renameGroup: string;
    leaveGroup: string;
    leaveGroupConfirm: string;
    kickConfirm: string;
    noPermission: string;
    renamePlaceholder: string;
    groupCreatedAt: string;
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
    editProfile: string;
    displayName: string;
    bio: string;
    status: string;
    save: string;
    cancel: string;
    avatarUpload: string;
    online: string;
    offline: string;
    lastSeen: string;
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
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
    notificationPrefs: string;
    showPreview: string;
    muteFor1h: string;
    muteFor8h: string;
    muteFor24h: string;
    muteForever: string;
    unmute: string;
    mutedConversations: string;
    noMutedConversations: string;
    previewOn: string;
    previewOff: string;
  };
  slash: {
    me: string;
    topic: string;
    shrug: string;
    tableflip: string;
  };
  thread: {
    replies: string;
    replyCount: string;
    replyPlaceholder: string;
    close: string;
  };
  editor: {
    bold: string;
    italic: string;
    strikethrough: string;
    code: string;
    quote: string;
    link: string;
    preview: string;
    linkUrl: string;
  };
  schedule: {
    schedule: string;
    scheduleMessage: string;
    sendAt: string;
    cancelSchedule: string;
    scheduledMessages: string;
    noScheduled: string;
    scheduledFor: string;
    today: string;
    tomorrow: string;
    pickDateTime: string;
    confirmSchedule: string;
    cancelled: string;
    sentToast: string;
  };
  export: {
    exportChat: string;
    exportJson: string;
    exportText: string;
    exportSuccess: string;
    exportError: string;
  };
  file: {
    uploading: string;
    downloadFile: string;
    fileSize: string;
    dropFilesHere: string;
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
    pinned: "置顶",
    pinConversation: "置顶会话",
    unpinConversation: "取消置顶",
    muteConversation: "免打扰",
    unmuteConversation: "取消免打扰",
    muted: "已静音",
    archived: "已归档",
    archivedSection: "已归档会话",
    archiveConversation: "归档会话",
    unarchiveConversation: "取消归档",
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
    fileTooLarge: "文件过大（最大 50MB）",
    uploadFailed: "上传失败",
    editingMessage: "编辑消息",
  },
  message: {
    edited: "（已编辑）",
    forward: "转发",
    copy: "复制",
    delete: "删除",
    select: "选择",
    read: "已读",
    readBy: "已读用户",
    sent: "已发送",
    copied: "已复制",
    deleteConfirm: "确认删除这条消息？",
    deleteWarning: "此操作不可撤销。",
    edit: "编辑",
    pin: "置顶",
    contextMenu: "消息操作",
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
    groupInfo: "群组信息",
    members: "成员",
    owner: "群主",
    admin: "管理员",
    member: "成员",
    kickMember: "踢出群组",
    promoteAdmin: "设为管理员",
    demoteMember: "降为成员",
    transferOwnership: "转让群主",
    renameGroup: "重命名群组",
    leaveGroup: "退出群组",
    leaveGroupConfirm: "确定要退出群组吗？",
    kickConfirm: "确定要踢出 {{name}} 吗？",
    noPermission: "你没有权限执行此操作",
    renamePlaceholder: "新群组名称...",
    groupCreatedAt: "创建时间",
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
    editProfile: "编辑资料",
    displayName: "显示名称",
    bio: "个人签名",
    status: "状态",
    save: "保存",
    cancel: "取消",
    avatarUpload: "上传头像",
    online: "在线",
    offline: "离线",
    lastSeen: "最后在线 {{time}}",
    justNow: "刚刚",
    minutesAgo: "{{n}}分钟前",
    hoursAgo: "{{n}}小时前",
    daysAgo: "{{n}}天前",
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
    notificationPrefs: "通知偏好",
    showPreview: "消息预览",
    muteFor1h: "静音 1 小时",
    muteFor8h: "静音 8 小时",
    muteFor24h: "静音 24 小时",
    muteForever: "永久静音",
    unmute: "取消静音",
    mutedConversations: "已静音会话",
    noMutedConversations: "暂无静音会话",
    previewOn: "预览已开启",
    previewOff: "预览已关闭",
  },
  slash: {
    me: "以动作方式发送消息",
    topic: "修改群组话题",
    shrug: "¯\\_(ツ)_/¯",
    tableflip: "(╯°□°)╯︵ ┻━┻",
  },
  thread: {
    replies: "条回复",
    replyCount: "{count} 条回复",
    replyPlaceholder: "回复此消息...",
    close: "关闭",
  },
  editor: {
    bold: "加粗",
    italic: "斜体",
    strikethrough: "删除线",
    code: "代码",
    quote: "引用",
    link: "链接",
    preview: "预览",
    linkUrl: "输入链接",
  },
  schedule: {
    schedule: "定时",
    scheduleMessage: "定时发送消息",
    sendAt: "发送时间",
    cancelSchedule: "取消定时",
    scheduledMessages: "定时消息",
    noScheduled: "没有定时消息",
    scheduledFor: "计划于 {{time}} 发送",
    today: "今天",
    tomorrow: "明天",
    pickDateTime: "选择日期和时间",
    confirmSchedule: "确认定时",
    cancelled: "已取消定时消息",
    sentToast: "定时消息已发送计划",
  },
  export: {
    exportChat: "导出聊天记录",
    exportJson: "导出为 JSON",
    exportText: "导出为文本",
    exportSuccess: "聊天记录导出成功",
    exportError: "导出聊天记录失败",
  },
  file: {
    uploading: "上传中...",
    downloadFile: "下载文件",
    fileSize: "{{size}}",
    dropFilesHere: "拖放文件到此处",
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
    pinned: "Pinned",
    pinConversation: "Pin conversation",
    unpinConversation: "Unpin conversation",
    muteConversation: "Mute",
    unmuteConversation: "Unmute",
    muted: "Muted",
    archived: "Archived",
    archivedSection: "Archived",
    archiveConversation: "Archive",
    unarchiveConversation: "Unarchive",
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
    fileTooLarge: "File too large (max 50MB)",
    uploadFailed: "Upload failed",
    editingMessage: "Edit message",
  },
  message: {
    edited: "(edited)",
    forward: "Forward",
    copy: "Copy",
    delete: "Delete",
    select: "Select",
    read: "Read",
    readBy: "Read by",
    sent: "Sent",
    copied: "Copied",
    deleteConfirm: "Delete message?",
    deleteWarning: "This cannot be undone.",
    edit: "Edit",
    pin: "Pin",
    contextMenu: "Message actions",
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
    groupInfo: "Group Info",
    members: "Members",
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    kickMember: "Kick from group",
    promoteAdmin: "Promote to admin",
    demoteMember: "Demote to member",
    transferOwnership: "Transfer ownership",
    renameGroup: "Rename group",
    leaveGroup: "Leave group",
    leaveGroupConfirm: "Are you sure you want to leave the group?",
    kickConfirm: "Kick {{name}} from the group?",
    noPermission: "You don't have permission to do this",
    renamePlaceholder: "New group name...",
    groupCreatedAt: "Created",
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
    editProfile: "Edit Profile",
    displayName: "Display Name",
    bio: "Bio",
    status: "Status",
    save: "Save",
    cancel: "Cancel",
    avatarUpload: "Upload Avatar",
    online: "Online",
    offline: "Offline",
    lastSeen: "Last seen {{time}}",
    justNow: "just now",
    minutesAgo: "{{n}}m ago",
    hoursAgo: "{{n}}h ago",
    daysAgo: "{{n}}d ago",
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
    notificationPrefs: "Notification Prefs",
    showPreview: "Message Preview",
    muteFor1h: "Mute for 1 hour",
    muteFor8h: "Mute for 8 hours",
    muteFor24h: "Mute for 24 hours",
    muteForever: "Mute forever",
    unmute: "Unmute",
    mutedConversations: "Muted Conversations",
    noMutedConversations: "No muted conversations",
    previewOn: "Preview on",
    previewOff: "Preview off",
  },
  slash: {
    me: "Send as action message",
    topic: "Change group topic",
    shrug: "¯\\_(ツ)_/¯",
    tableflip: "(╯°□°)╯︵ ┻━┻",
  },
  thread: {
    replies: "replies",
    replyCount: "{count} replies",
    replyPlaceholder: "Reply to thread...",
    close: "Close",
  },
  editor: {
    bold: "Bold",
    italic: "Italic",
    strikethrough: "Strikethrough",
    code: "Code",
    quote: "Quote",
    link: "Link",
    preview: "Preview",
    linkUrl: "Enter URL",
  },
  schedule: {
    schedule: "Schedule",
    scheduleMessage: "Schedule Message",
    sendAt: "Send at",
    cancelSchedule: "Cancel Schedule",
    scheduledMessages: "Scheduled Messages",
    noScheduled: "No scheduled messages",
    scheduledFor: "Scheduled for {{time}}",
    today: "Today",
    tomorrow: "Tomorrow",
    pickDateTime: "Pick date and time",
    confirmSchedule: "Confirm Schedule",
    cancelled: "Scheduled message cancelled",
    sentToast: "Scheduled message queued",
  },
  export: {
    exportChat: "Export Chat",
    exportJson: "Export as JSON",
    exportText: "Export as Text",
    exportSuccess: "Chat exported successfully",
    exportError: "Failed to export chat",
  },
  file: {
    uploading: "Uploading...",
    downloadFile: "Download file",
    fileSize: "{{size}}",
    dropFilesHere: "Drop files here",
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
