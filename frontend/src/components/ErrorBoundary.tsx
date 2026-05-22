import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { translations, detectLanguage, type Language } from "@/i18n/translations";

function getT(): (key: string) => string {
  const lang: Language = detectLanguage();
  const dict = translations[lang] as unknown as Record<string, unknown>;
  return (key: string) => {
    const parts = key.split(".");
    let current: unknown = dict;
    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof current === "string" ? current : key;
  };
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  hasError: boolean;
  errorInfo: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, hasError: false, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    this.setState({ errorInfo: info.componentStack || "" });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const t = getT();
      return (
        <div className="flex min-h-screen items-center justify-center bg-[hsl(231,4%,12%)] p-8">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-[hsl(220,2.5%,20%)] bg-card p-8 text-center shadow-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{t("error.somethingWentWrong")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("error.reloadMessage")}
            </p>
            {this.state.error && (
              <>
                <pre className="max-h-24 w-full overflow-auto rounded-lg bg-muted p-3 text-left text-[11px] text-muted-foreground/60">
                  {this.state.error.message}
                </pre>
                {this.state.errorInfo && (
                  <details className="w-full">
                    <summary className="text-xs text-muted-foreground/40 cursor-pointer">Stack trace</summary>
                    <pre className="mt-1 max-h-32 w-full overflow-auto rounded-lg bg-muted p-2 text-left text-[10px] text-muted-foreground/40 whitespace-pre-wrap">
                      {this.state.errorInfo}
                    </pre>
                  </details>
                )}
              </>)}
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              {t("error.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
