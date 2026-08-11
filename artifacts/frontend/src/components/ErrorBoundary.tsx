import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; }
interface State { crashed: boolean; message: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      crashed: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(err: unknown, info: unknown) {
    console.error("[ErrorBoundary]", err, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm max-w-md w-full p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Une erreur est survenue</h2>
            <p className="text-sm text-gray-500">
              La page a rencontré un problème inattendu. Rafraîchissez la page pour réessayer.
            </p>
            {this.state.message && (
              <p className="text-xs text-red-400 bg-red-50 rounded-lg px-3 py-2 font-mono break-all">
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition"
            >
              <RefreshCw size={15} />
              Rafraîchir la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
