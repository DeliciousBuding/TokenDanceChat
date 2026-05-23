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
    haveAccount: string;
    noAccount: string;
    guestLogin: string;
    invalidCode: string;
    codeUsed: string;
    passwordsMatch: string;
    registerSuccess: string;
    passwordMinLength: string;
    confirmNotMatch: string;
  };
  invite: {
    inviteCodes: string;
    generateCode: string;
    maxUses: string;
    copyCode: string;
    noCodes: string;
    codeCopied: string;
    usesLeft: string;
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
    emptyGroupMembers: string;
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
    react: string;
    translate: string;
    contextMenu: string;
  };
  system: {
    userJoined: string;
    userLeft: string;
    userOnline: string;
    connectionLost: string;
    kicked: string;
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
    webhooks: string;
    webhookDescription: string;
    createWebhook: string;
    webhookSecretOnce: string;
    webhookSecretHint: string;
    webhookCopied: string;
    noWebhooks: string;
    copyWebhook: string;
    rotateWebhook: string;
    deleteWebhook: string;
    webhookCreatedBy: string;
    webhookRotatedBy: string;
    webhookAudit: string;
    refreshWebhookAudit: string;
    webhookAuditEmpty: string;
    webhookAuditCreated: string;
    webhookAuditRotated: string;
    webhookAuditDeleted: string;
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
    inConversation: string;
    matchCount: string;
    noMatchesInConversation: string;
    pressCtrlF: string;
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
    custom: string;
    addCustomEmoji: string;
    emojiName: string;
    emojiNamePlaceholder: string;
    uploadEmoji: string;
    deleteEmoji: string;
    noCustomEmoji: string;
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
    scheduledCount: string;
    myAccount: string;
    openSettings: string;
    title: string;
  };
  folders: {
    create: string;
    delete: string;
    rename: string;
    addToFolder: string;
    removeFromFolder: string;
    newFolder: string;
    folderName: string;
    noFolders: string;
    manageFolders: string;
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
  gif: {
    searchGifs: string;
    trending: string;
    stickers: string;
    gifs: string;
    noResults: string;
    poweredBy: string;
  };
  call: {
    incomingCall: string;
    calling: string;
    callRejected: string;
    missedCall: string;
    voiceCall: string;
    videoCall: string;
    groupCall: string;
    muteMic: string;
    unmuteMic: string;
    muteCamera: string;
    unmuteCamera: string;
    endCall: string;
    screenShare: string;
    switchCamera: string;
    acceptCall: string;
    rejectCall: string;
    remoteVideoOff: string;
    callEnded: string;
    joiningRoom: string;
    participants: string;
    leaveRoom: string;
  };
}

const zhCN: TranslationDict = {
  join: {
    title: "TokenDance Chat",
    subtitle: "加入公共聊天室",
    placeholder: "你的用户名...",
    buttonJoin: "加入聊天",
    buttonConnecting: "连接中...",
    footer: "公共聊天室 · 文明交流",
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
    haveAccount: "已有账号？去登录",
    noAccount: "还没有账号？去注册",
    guestLogin: "返回游客模式",
    invalidCode: "邀请码无效或已过期",
    codeUsed: "邀请码已达最大使用次数",
    passwordsMatch: "两次输入的密码不一致",
    registerSuccess: "注册成功",
    passwordMinLength: "密码至少需要6个字符",
    confirmNotMatch: "两次输入的密码不一致",
  },
  invite: {
    inviteCodes: "邀请码管理",
    generateCode: "生成邀请码",
    maxUses: "最大使用次数",
    copyCode: "复制",
    noCodes: "还没有生成邀请码",
    codeCopied: "邀请码已复制到剪贴板",
    usesLeft: "{{used}}/{{max}}",
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
    emptyGroupTitle: "群聊已就绪",
    emptyGroupDescription: "向 {{name}} 发送第一条消息，开始同步上下文。",
    emptyGroupMembers: "{{count}} 名成员",
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
    react: "添加表情",
    translate: "翻译",
    contextMenu: "消息操作",
  },
  system: {
    userJoined: "{{username}} 加入了聊天室",
    userLeft: "{{username}} 离开了聊天室",
    userOnline: "{{username}} 上线了",
    connectionLost: "连接已断开，正在尝试重新连接...",
    kicked: "您的账号已在其他地方登录，当前连接已断开。",
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
    webhooks: "传入 Webhook",
    webhookDescription: "让外部系统向本群发送消息",
    createWebhook: "新建",
    webhookSecretOnce: "请立即复制，密钥只显示一次",
    webhookSecretHint: "列表不会再次显示 secret；丢失后请重新创建。",
    webhookCopied: "已复制",
    noWebhooks: "暂无 webhook",
    copyWebhook: "复制 webhook 地址",
    rotateWebhook: "轮换 webhook 密钥",
    deleteWebhook: "删除 webhook",
    webhookCreatedBy: "创建者：{{name}}",
    webhookRotatedBy: "轮换：{{name}} · {{time}}",
    webhookAudit: "Webhook 审计",
    refreshWebhookAudit: "刷新",
    webhookAuditEmpty: "暂无审计记录",
    webhookAuditCreated: "创建 webhook",
    webhookAuditRotated: "轮换密钥",
    webhookAuditDeleted: "删除 webhook",
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
    inConversation: "搜索当前对话",
    matchCount: "{{n}} 条匹配",
    noMatchesInConversation: "当前对话无匹配",
    pressCtrlF: "Ctrl+F 搜索",
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
    custom: "自定义表情",
    addCustomEmoji: "添加自定义表情",
    emojiName: "表情名称",
    emojiNamePlaceholder: "输入表情名称...",
    uploadEmoji: "上传表情",
    deleteEmoji: "删除表情",
    noCustomEmoji: "暂无自定义表情",
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
    scheduledCount: "{{n}} 条定时消息",
    myAccount: "我的账号",
    openSettings: "打开设置",
    title: "设置",
  },
  folders: {
    create: "新建文件夹",
    delete: "删除文件夹",
    rename: "重命名",
    addToFolder: "添加到文件夹",
    removeFromFolder: "从文件夹移除",
    newFolder: "文件夹名称",
    folderName: "名称",
    noFolders: "暂无文件夹",
    manageFolders: "管理文件夹",
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
  gif: {
    searchGifs: "搜索 GIF 和贴纸...",
    trending: "热门",
    stickers: "贴纸",
    gifs: "GIF",
    noResults: "未找到结果",
    poweredBy: "由 GIPHY 提供支持",
  },
  call: {
    incomingCall: "{{name}} 正在呼叫你",
    calling: "正在呼叫 {{name}}...",
    callRejected: "通话已拒绝",
    missedCall: "未接来电",
    voiceCall: "语音通话",
    videoCall: "视频通话",
    groupCall: "群组通话",
    muteMic: "关闭麦克风",
    unmuteMic: "打开麦克风",
    muteCamera: "关闭摄像头",
    unmuteCamera: "打开摄像头",
    endCall: "结束通话",
    screenShare: "屏幕共享",
    switchCamera: "切换摄像头",
    acceptCall: "接听",
    rejectCall: "拒绝",
    remoteVideoOff: "对方已关闭摄像头",
    callEnded: "通话已结束",
    joiningRoom: "正在加入通话...",
    participants: "人",
    leaveRoom: "离开通话",
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
    haveAccount: "Already have an account? Log in",
    noAccount: "Don't have an account? Register",
    guestLogin: "Back to Guest Mode",
    invalidCode: "Invalid or expired invite code",
    codeUsed: "Invite code has reached maximum uses",
    passwordsMatch: "Passwords do not match",
    registerSuccess: "Registration successful",
    passwordMinLength: "Password must be at least 6 characters",
    confirmNotMatch: "Passwords do not match",
  },
  invite: {
    inviteCodes: "Invite Codes",
    generateCode: "Generate Code",
    maxUses: "Max Uses",
    copyCode: "Copy",
    noCodes: "No invite codes generated yet",
    codeCopied: "Invite code copied to clipboard",
    usesLeft: "{{used}}/{{max}}",
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
    emptyGroupTitle: "Group is ready",
    emptyGroupDescription: "Send the first message to {{name}} and start syncing context.",
    emptyGroupMembers: "{{count}} members",
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
    react: "React",
    translate: "Translate",
    contextMenu: "Message actions",
  },
  system: {
    userJoined: "{{username}} joined the chat",
    userLeft: "{{username}} left the chat",
    userOnline: "{{username}} is now online",
    connectionLost: "Connection lost, attempting to reconnect...",
    kicked: "Your account was logged in elsewhere. This connection has been closed.",
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
    webhooks: "Incoming Webhooks",
    webhookDescription: "Let external systems post into this group",
    createWebhook: "New",
    webhookSecretOnce: "Copy now; the secret is shown once",
    webhookSecretHint: "The list will not show the secret again. Create a new webhook if it is lost.",
    webhookCopied: "Copied",
    noWebhooks: "No webhooks yet",
    copyWebhook: "Copy webhook URL",
    rotateWebhook: "Rotate webhook secret",
    deleteWebhook: "Delete webhook",
    webhookCreatedBy: "Created by {{name}}",
    webhookRotatedBy: "Rotated by {{name}} · {{time}}",
    webhookAudit: "Webhook Audit",
    refreshWebhookAudit: "Refresh",
    webhookAuditEmpty: "No audit events yet",
    webhookAuditCreated: "Created webhook",
    webhookAuditRotated: "Rotated secret",
    webhookAuditDeleted: "Deleted webhook",
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
    inConversation: "Search in conversation",
    matchCount: "{{n}} matches",
    noMatchesInConversation: "No matches in conversation",
    pressCtrlF: "Ctrl+F Search",
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
    custom: "Custom Emoji",
    addCustomEmoji: "Add Custom Emoji",
    emojiName: "Emoji Name",
    emojiNamePlaceholder: "Enter emoji name...",
    uploadEmoji: "Upload Emoji",
    deleteEmoji: "Delete Emoji",
    noCustomEmoji: "No custom emojis",
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
    scheduledCount: "{{n}} scheduled",
    myAccount: "My Account",
    openSettings: "Open Settings",
    title: "Settings",
  },
  folders: {
    create: "New Folder",
    delete: "Delete Folder",
    rename: "Rename",
    addToFolder: "Add to Folder",
    removeFromFolder: "Remove from Folder",
    newFolder: "Folder name",
    folderName: "Name",
    noFolders: "No folders",
    manageFolders: "Manage Folders",
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
  gif: {
    searchGifs: "Search GIFs & Stickers...",
    trending: "Trending",
    stickers: "Stickers",
    gifs: "GIFs",
    noResults: "No results found",
    poweredBy: "Powered by GIPHY",
  },
  call: {
    incomingCall: "{{name}} is calling you",
    calling: "Calling {{name}}...",
    callRejected: "Call rejected",
    missedCall: "Missed call",
    voiceCall: "Voice Call",
    videoCall: "Video Call",
    groupCall: "Group Call",
    muteMic: "Mute Mic",
    unmuteMic: "Unmute Mic",
    muteCamera: "Mute Camera",
    unmuteCamera: "Unmute Camera",
    endCall: "End Call",
    screenShare: "Screen Share",
    switchCamera: "Switch Camera",
    acceptCall: "Accept",
    rejectCall: "Reject",
    remoteVideoOff: "Camera is off",
    callEnded: "Call ended",
    joiningRoom: "Joining call...",
    participants: "participants",
    leaveRoom: "Leave Call",
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
