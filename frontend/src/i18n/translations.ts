export type Language = "zh-CN" | "en-US";

export interface TranslationDict {
  join: {
    title: string;
    subtitle: string;
    placeholder: string;
    buttonJoin: string;
    buttonConnecting: string;
    footer: string;
    welcomeHint: string;
    errorEmpty: string;
    errorTooShort: string;
    errorTooLong: string;
    errorInvalidChars: string;
    buttonLogin: string;
    buttonRegister: string;
    buttonGuest: string;
    orText: string;
  };
  auth: {
    register: string;
    login: string;
    username: string;
    password: string;
    confirmPassword: string;
    inviteCode: string;
    registerButton: string;
    loginButton: string;
    loginOrRegister: string;
    guestUpgradeHint: string;
    haveAccount: string;
    noAccount: string;
    guestLogin: string;
    invalidCode: string;
    codeUsed: string;
    fillAllFields: string;
    passwordMinLength: string;
    passwordMaxLength: string;
    confirmNotMatch: string;
    loginFailed: string;
    signingIn: string;
    back: string;
    backToLogin: string;
    oidcLoginButton: string;
    oidcError: string;
    sessionBoundary: string;
  };
  invite: {
    inviteCodes: string;
    generateCode: string;
    maxUses: string;
    copyCode: string;
    noCodes: string;
    usesLeft: string;
  };
  chat: {
    roomName: string;
    subtitle: string;
    dmLabel: string;
    leave: string;
    disconnect: string;
    publicChat: string;
    deletedMessage: string;
    guestWarning: string;
  };
  sidebar: {
    publicChat: string;
    publicChatSub: string;
    you: string;
    assistants: string;
    online: string;
    aiAssistants: string;
    closeSidebar: string;
    connecting: string;
    guestMode: string;
  };
  transcript: {
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    newMessages: string;
    loadingOlder: string;
    loadErrorRetry: string;
    newMessagesDivider: string;
    olderMessages: string;
    selected: string;
    contextSelect: string;
    contextCopy: string;
    contextDelete: string;
    selectAll: string;
    copySelected: string;
  };
  input: {
    placeholder: string;
    assistantPlaceholder: string;
    replyTo: string;
    characters: string;
    escapeToCancel: string;
    cancel: string;
    save: string;
    editingMessage: string;
    send: string;
    pasteFileUnsupported: string;
  };
  message: {
    edited: string;
    copy: string;
    delete: string;
    read: string;
    readBy: string;
    sent: string;
    copied: string;
    edit: string;
    pin: string;
    react: string;
    translate: string;
    contextMenu: string;
    seenBy: string;
  };
  system: {
    userJoined: string;
    userLeft: string;
    userOnline: string;
    connectionLost: string;
    reconnecting: string;
    reconnected: string;
    disconnected: string;
    reconnectFailed: string;
    kicked: string;
    typing: string;
    typingTwo: string;
    typingMany: string;
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
  more: {
    label: string;
  };
  mention: {
    mentionedYou: string;
    view: string;
    dismiss: string;
  };
  profile: {
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
    today: string;
    yesterday: string;
  };
  search: {
    placeholder: string;
    typeToSearch: string;
    notFound: string;
    notFoundInConversation: string;
    searchError: string;
    toggleSearch: string;
    inConversation: string;
    matchCount: string;
    noMatchesInConversation: string;
    pressCtrlF: string;
  };
  emoji: {
    search: string;
    recent: string;
    noResults: string;
    openPicker: string;
    smileys: string;
    gestures: string;
    hearts: string;
    objects: string;
    misc: string;
    custom: string;
    uploadEmoji: string;
    deleteEmoji: string;
    noCustomEmoji: string;
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
    profile: string;
    appearance: string;
    notifications: string;
    data: string;
    account: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    testSound: string;
    exportData: string;
    myAccount: string;
    openSettings: string;
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
    formatting: string;
  };
  export: {
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
  poll: {
    closed: string;
    finalResults: string;
    vote: string;
    votes: string;
  };
  a11y: {
    close: string;
    back: string;
    clearSearch: string;
    closeSidebar: string;
    openSidebar: string;
    moreActions: string;
    addAttachment: string;
    removeImage: string;
    ok: string;
    uploadFile: string;
    prevResult: string;
    nextResult: string;
    closeSearch: string;
    zoomOut: string;
    zoomIn: string;
    copyCode: string;
    audioSeek: string;
    exitSelect: string;
    prevMonth: string;
    nextMonth: string;
    hour: string;
    minute: string;
    scrollToBottom: string;
    online: string;
    showPassword: string;
    hidePassword: string;
  };
}

const zhCN: TranslationDict = {
  join: {
    title: "TokenDance Chat",
    subtitle: "公共聊天室 · AI 助手 @TokenBot 在线陪伴",
    placeholder: "你的用户名...",
    buttonJoin: "加入聊天",
    buttonConnecting: "连接中...",
    footer: "公共聊天室 · 文明交流",
    welcomeHint: "支持 Markdown · 图片拖拽 · 表情反应 · 公共聊天室 · AI 工作区",
    errorEmpty: "请输入用户名",
    errorTooShort: "用户名至少需要2个字符",
    errorTooLong: "用户名不能超过20个字符",
    errorInvalidChars: "用户名只能包含中文、英文、数字和下划线",
    buttonLogin: "登录",
    buttonRegister: "注册",
    buttonGuest: "游客加入",
    orText: "或者",
  },
  auth: {
    register: "注册账号",
    login: "登录",
    username: "用户名",
    password: "密码",
    confirmPassword: "确认密码",
    inviteCode: "邀请码",
    registerButton: "注册",
    loginButton: "登录",
    loginOrRegister: "登录 / 注册",
    guestUpgradeHint: "游客身份，登录后保留昵称与消息",
    haveAccount: "已有账号？去登录",
    noAccount: "还没有账号？去注册",
    guestLogin: "返回游客模式",
    invalidCode: "邀请码无效或已过期",
    codeUsed: "邀请码已达最大使用次数",
    fillAllFields: "请填写所有字段后点击注册",
    passwordMinLength: "密码至少需要6个字符",
    passwordMaxLength: "密码不能超过72个字符",
    confirmNotMatch: "两次输入的密码不一致",
    loginFailed: "用户名或密码错误",
    signingIn: "正在登录...",
    back: "返回",
    backToLogin: "返回登录",
    oidcLoginButton: "使用 TokenDance ID 登录",
    oidcError: "OIDC 登录失败",
    sessionBoundary: "受保护 REST 请求使用 Authorization: Bearer <session_token>；TokenDance ID 登录不能替代模型 API key。",
  },
  invite: {
    inviteCodes: "邀请码管理",
    generateCode: "生成邀请码",
    maxUses: "最大使用次数",
    copyCode: "复制",
    noCodes: "还没有生成邀请码",
    usesLeft: "{{used}}/{{max}}",
  },
  chat: {
    roomName: "公共聊天",
    subtitle: "在线聊天室",
    dmLabel: "私聊",
    leave: "离开",
    disconnect: "断开连接",
    publicChat: "公共聊天",
    deletedMessage: "此消息已被删除",
    guestWarning: "游客模式：你的身份未经验证，其他人可以使用相同用户名",
  },
  sidebar: {
    publicChat: "公共聊天",
    publicChatSub: "公共聊天室",
    you: "你",
    assistants: "助手",
    online: "在线",
    aiAssistants: "私人助手",
    closeSidebar: "关闭侧边栏",
    connecting: "连接中...",
    guestMode: "游客模式",
  },
  transcript: {
    loading: "加载消息中...",
    emptyTitle: "暂无消息",
    emptyDescription: "成为第一个发送消息的人吧！",
    newMessages: "{{count}} 条新消息",
    loadingOlder: "加载更早的消息...",
    loadErrorRetry: "加载失败，点击重试",
    newMessagesDivider: "新消息",
    olderMessages: "更早的消息",
    selected: "已选择 {{count}} 条",
    contextSelect: "选择",
    contextCopy: "复制",
    contextDelete: "删除",
    selectAll: "全选",
    copySelected: "复制选中",
  },
  input: {
    placeholder: "输入消息...",
    assistantPlaceholder: "发消息给 {{name}}...",
    replyTo: "回复",
    characters: "{{current}}/{{max}}",
    escapeToCancel: "按 Esc 取消",
    cancel: "取消",
    save: "保存",
    editingMessage: "编辑消息",
    send: "发送",
    pasteFileUnsupported: "暂不支持发送图片或文件",
  },
  message: {
    edited: "（已编辑）",
    copy: "复制",
    delete: "删除",
    read: "已读",
    readBy: "已读用户",
    sent: "已发送",
    copied: "已复制",
    edit: "编辑",
    pin: "置顶",
    react: "添加表情",
    translate: "翻译",
    contextMenu: "消息操作",
    seenBy: "{{n}} 人已读",
  },
  system: {
    userJoined: "{{username}} 加入了聊天室",
    userLeft: "{{username}} 离开了聊天室",
    userOnline: "{{username}} 上线了",
    connectionLost: "连接已断开，正在尝试重新连接...",
    reconnecting: "正在重新连接 (第 {{attempt}} 次)...",
    reconnected: "已重新连接",
    disconnected: "未连接 — 重新连接后重试",
    reconnectFailed: "连接已断开，请刷新页面。",
    kicked: "您的账号已在其他地方登录，当前连接已断开。",
    typing: "{{username}} 正在输入...",
    typingTwo: "{{name1}} 和 {{name2}} 正在输入...",
    typingMany: "{{name}} 和另外 {{count}} 人正在输入...",
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
  more: {
    label: "更多",
  },
  mention: {
    mentionedYou: "提到了你",
    view: "查看",
    dismiss: "关闭",
  },
  profile: {
    justNow: "刚刚",
    minutesAgo: "{{n}}分钟前",
    hoursAgo: "{{n}}小时前",
    daysAgo: "{{n}}天前",
    today: "今天",
    yesterday: "昨天",
  },
  search: {
    placeholder: "搜索消息...",
    typeToSearch: "输入关键词搜索消息",
    notFound: "未找到消息",
    notFoundInConversation: "此对话中无消息",
    searchError: "搜索出错，请重试",
    toggleSearch: "切换搜索",
    inConversation: "搜索当前对话",
    matchCount: "{{n}} 条匹配",
    noMatchesInConversation: "当前对话无匹配",
    pressCtrlF: "Ctrl+F 搜索",
  },
  emoji: {
    search: "搜索表情...",
    recent: "最近使用",
    noResults: "未找到表情",
    openPicker: "插入表情",
    smileys: "表情",
    gestures: "手势",
    hearts: "爱心",
    objects: "物品",
    misc: "其他",
    custom: "自定义表情",
    uploadEmoji: "上传表情",
    deleteEmoji: "删除表情",
    noCustomEmoji: "暂无自定义表情",
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
    profile: "个人资料",
    appearance: "外观",
    notifications: "通知",
    data: "数据",
    account: "账号",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    testSound: "测试提示音",
    exportData: "导出聊天记录",
    myAccount: "我的账号",
    openSettings: "打开设置",
  },
  slash: {
    me: "以动作方式发送消息",
    topic: "修改聊天室话题",
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
    formatting: "Markdown 格式",
  },
  export: {
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
  poll: {
    closed: "投票已关闭",
    finalResults: "最终结果",
    vote: "投票",
    votes: "{{count}} 票",
  },
  a11y: {
    close: "关闭",
    back: "返回",
    clearSearch: "清除搜索",
    closeSidebar: "关闭侧边栏",
    openSidebar: "打开侧边栏",
    moreActions: "更多操作",
    addAttachment: "添加附件",
    removeImage: "移除图片",
    ok: "确定",
    uploadFile: "上传文件",
    prevResult: "上一个结果",
    nextResult: "下一个结果",
    closeSearch: "关闭搜索",
    zoomOut: "缩小",
    zoomIn: "放大",
    copyCode: "复制代码",
    audioSeek: "音频进度条",
    exitSelect: "退出选择模式",
    prevMonth: "上个月",
    nextMonth: "下个月",
    hour: "小时",
    minute: "分钟",
    scrollToBottom: "回到底部",
    online: "在线",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
  },

};


const enUS: TranslationDict = {
  join: {
    title: "TokenDance Chat",
    subtitle: "Public chat · AI assistant @TokenBot at your service",
    placeholder: "Your username...",
    buttonJoin: "Join Chat",
    buttonConnecting: "Connecting...",
    footer: "Public Chat Room · Be respectful",
    welcomeHint: "Markdown · Image drag-drop · Emoji reactions · Public room · AI workspaces",
    errorEmpty: "Please enter a username",
    errorTooShort: "Username must be at least 2 characters",
    errorTooLong: "Username cannot exceed 20 characters",
    errorInvalidChars:
      "Username can only contain letters, numbers, Chinese characters, and underscores",
    buttonLogin: "Login",
    buttonRegister: "Register",
    buttonGuest: "Join as Guest",
    orText: "or",
  },
  auth: {
    register: "Register Account",
    login: "Login",
    username: "Username",
    password: "Password",
    confirmPassword: "Confirm Password",
    inviteCode: "Invite Code",
    registerButton: "Register",
    loginButton: "Login",
    loginOrRegister: "Log in / Sign up",
    guestUpgradeHint: "Guest mode — log in to keep your name and messages",
    haveAccount: "Already have an account? Log in",
    noAccount: "Don't have an account? Register",
    guestLogin: "Back to Guest Mode",
    invalidCode: "Invalid or expired invite code",
    codeUsed: "Invite code has reached maximum uses",
    fillAllFields: "Please fill in all fields to register",
    passwordMinLength: "Password must be at least 6 characters",
    passwordMaxLength: "Password must be at most 72 characters",
    confirmNotMatch: "Passwords do not match",
    loginFailed: "Invalid username or password",
    signingIn: "Signing in...",
    back: "Back",
    backToLogin: "Back to Login",
    oidcLoginButton: "Login with TokenDance ID",
    oidcError: "OIDC login failed",
    sessionBoundary: "Protected REST requests use Authorization: Bearer <session_token>; TokenDance ID login is not a model API key.",
  },
  invite: {
    inviteCodes: "Invite Codes",
    generateCode: "Generate Code",
    maxUses: "Max Uses",
    copyCode: "Copy",
    noCodes: "No invite codes generated yet",
    usesLeft: "{{used}}/{{max}}",
  },
  chat: {
    roomName: "Public Chat",
    subtitle: "Online Chat Room",
    dmLabel: "Direct message",
    leave: "Leave",
    disconnect: "Disconnect",
    publicChat: "Public Chat",
    deletedMessage: "This message was deleted",
    guestWarning: "Guest mode: your identity is unverified. Others may use the same username.",
  },
  sidebar: {
    publicChat: "Public Chat",
    publicChatSub: "Public Chat Room",
    you: "You",
    assistants: "Assistants",
    online: "Online",
    aiAssistants: "Private Assistant",
    closeSidebar: "Close sidebar",
    connecting: "Connecting...",
    guestMode: "Guest mode",
  },
  transcript: {
    loading: "Loading messages...",
    emptyTitle: "No messages yet",
    emptyDescription: "Be the first to send a message!",
    newMessages: "{{count}} new messages",
    loadingOlder: "Loading older messages...",
    loadErrorRetry: "Failed to load — tap to retry",
    newMessagesDivider: "New messages",
    olderMessages: "Older messages",
    selected: "{{count}} selected",
    contextSelect: "Select",
    contextCopy: "Copy",
    contextDelete: "Delete",
    selectAll: "Select All",
    copySelected: "Copy Selected",
  },
  input: {
    placeholder: "Type a message...",
    assistantPlaceholder: "Message {{name}}...",
    replyTo: "Reply to",
    characters: "{{current}}/{{max}}",
    escapeToCancel: "Escape to cancel",
    cancel: "Cancel",
    save: "Save",
    editingMessage: "Edit message",
    send: "Send",
    pasteFileUnsupported: "Sending images or files is not supported",
  },
  message: {
    edited: "(edited)",
    copy: "Copy",
    delete: "Delete",
    read: "Read",
    readBy: "Read by",
    sent: "Sent",
    copied: "Copied",
    edit: "Edit",
    pin: "Pin",
    react: "React",
    translate: "Translate",
    contextMenu: "Message actions",
    seenBy: "Seen by {{n}}",
  },
  system: {
    userJoined: "{{username}} joined the chat",
    userLeft: "{{username}} left the chat",
    userOnline: "{{username}} is now online",
    connectionLost: "Connection lost, attempting to reconnect...",
    reconnecting: "Reconnecting (attempt {{attempt}})...",
    reconnected: "Reconnected",
    disconnected: "Not connected — retrying...",
    reconnectFailed: "Connection lost. Please reload the page.",
    kicked: "Your account was logged in elsewhere. This connection has been closed.",
    typing: "{{username}} is typing...",
    typingTwo: "{{name1}} and {{name2}} are typing...",
    typingMany: "{{name}} and {{count}} others are typing...",
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
  more: {
    label: "More",
  },
  mention: {
    mentionedYou: "mentioned you",
    view: "View",
    dismiss: "Dismiss",
  },
  profile: {
    justNow: "just now",
    minutesAgo: "{{n}}m ago",
    hoursAgo: "{{n}}h ago",
    daysAgo: "{{n}}d ago",
    today: "Today",
    yesterday: "Yesterday",
  },
  search: {
    placeholder: "Search messages...",
    typeToSearch: "Type to search messages",
    notFound: "No messages found",
    notFoundInConversation: "No messages in this conversation",
    searchError: "Search error — please try again",
    toggleSearch: "toggle search",
    inConversation: "Search in conversation",
    matchCount: "{{n}} matches",
    noMatchesInConversation: "No matches in conversation",
    pressCtrlF: "Ctrl+F Search",
  },
  emoji: {
    search: "Search emoji...",
    recent: "Recent",
    noResults: "No emojis found",
    openPicker: "Insert emoji",
    smileys: "Smileys",
    gestures: "Gestures",
    hearts: "Hearts",
    objects: "Objects",
    misc: "Misc",
    custom: "Custom Emoji",
    uploadEmoji: "Upload Emoji",
    deleteEmoji: "Delete Emoji",
    noCustomEmoji: "No custom emojis",
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
    profile: "Profile",
    appearance: "Appearance",
    notifications: "Notifications",
    data: "Data",
    account: "Account",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    testSound: "Test sound",
    exportData: "Export chat history",
    myAccount: "My Account",
    openSettings: "Open Settings",
  },
  slash: {
    me: "Send as action message",
    topic: "Change chat topic",
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
    formatting: "Markdown formatting",
  },
  export: {
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
  poll: {
    closed: "Poll closed",
    finalResults: "Final Results",
    vote: "Vote",
    votes: "{{count}} votes",
  },
  a11y: {
    close: "Close",
    back: "Back",
    clearSearch: "Clear search",
    closeSidebar: "Close sidebar",
    openSidebar: "Open sidebar",
    moreActions: "More actions",
    addAttachment: "Add attachment",
    removeImage: "Remove image",
    ok: "OK",
    uploadFile: "Upload file",
    prevResult: "Previous result",
    nextResult: "Next result",
    closeSearch: "Close search",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    copyCode: "Copy code",
    audioSeek: "Audio seek",
    exitSelect: "Exit select mode",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    hour: "Hour",
    minute: "Minute",
    scrollToBottom: "Scroll to bottom",
    online: "Online",
    showPassword: "Show password",
    hidePassword: "Hide password",
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
