import { vi } from "vitest";

/**
 * Creates a standard i18n mock compatible with useTranslation().
 * Pass optional overrides for specific translation keys.
 */
export function mockI18n(overrides?: Record<string, string>) {
  const base: Record<string, string> = {
    // Auth
    "auth.login": "登录",
    "auth.register": "注册",
    "auth.username": "用户名",
    "auth.password": "密码",
    "auth.confirmPassword": "确认密码",
    "auth.inviteCode": "邀请码",
    "auth.loginButton": "登录",
    "auth.registerButton": "注册",
    "auth.noAccount": "还没有账号？去注册",
    "auth.haveAccount": "已有账号？去登录",
    "auth.guestLogin": "返回游客模式",
    "auth.passwordMinLength": "密码不能少于6位",
    "auth.confirmNotMatch": "两次密码不一致",
    "auth.invalidCode": "邀请码无效",
    "auth.codeUsed": "邀请码已被使用",
    // Join
    "join.title": "加入聊天室",
    "join.subtitle": "输入昵称加入公共聊天",
    "join.errorEmpty": "用户名不能为空",
    "join.errorTooShort": "用户名至少2个字符",
    "join.errorTooLong": "用户名最多20个字符",
    "join.errorInvalidChars": "用户名只能包含中英文、数字和下划线",
    "join.placeholder": "你的用户名...",
    "join.buttonGuest": "游客加入",
    "join.buttonConnecting": "连接中...",
    "join.buttonLogin": "登录",
    "join.buttonRegister": "注册",
    "join.orText": "或者",
    "join.footer": "公共聊天室 · 文明交流",
    // System
    "system.userJoined": "{{username}} 加入了聊天室",
    "system.userLeft": "{{username}} 离开了聊天室",
    "system.connectionLost": "连接已断开，正在尝试重新连接...",
    "system.kicked": "您的账号已在其他地方登录，当前连接已断开。",
    // Error
    "error.unknown": "未知错误",
    "error.timeout": "连接超时",
    "error.closed": "连接已关闭",
    "error.cannotConnect": "无法连接到服务器",
    // File
    "file.downloadFile": "Download file",
    // Search
    "search.placeholder": "搜索消息...",
    // Lang
    "lang.label": "切换语言",
    "lang.switchTo": "English",
    // Sidebar
    "sidebar.adminDashboard": "Admin Dashboard",
    "sidebar.closeSidebar": "Close sidebar",
    "sidebar.clearSearch": "Clear search",
    // Admin
    "admin.totalMessages": "Total Messages",
    "admin.activeConnections": "Active Connections",
    "admin.registeredUsers": "Registered Users",
    "admin.rooms": "Rooms",
    "admin.groups": "Groups",
    "admin.friends": "Friends",
    "admin.serverStats": "TokenDanceChat Server Stats",
  };
  const map = { ...base, ...overrides };
  return {
    t: (key: string, params?: Record<string, string>) => {
      let val = map[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          val = val.replace(`{{${k}}}`, v);
        }
      }
      return val;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  };
}

/**
 * Installs the i18n mock on `@/i18n/context` with default zh-CN translations.
 * Usage in test files (MUST be at module top level):
 *
 *   vi.mock("@/i18n/context", () => ({
 *     useTranslation: () => mockI18n(),
 *   }));
 *
 * Or with custom translations:
 *
 *   vi.mock("@/i18n/context", () => ({
 *     useTranslation: () => mockI18n({ "forward.title": "转发" }),
 *   }));
 */
