import { toast as sonnerToast } from "sonner"
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"
import { createElement } from "react"

export type ToastVariant = "default" | "destructive" | "success" | "warning" | "info"

export interface ToastOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  duration?: number
}

const iconFor: Record<ToastVariant, React.ElementType> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
}

const iconColorFor: Record<ToastVariant, string> = {
  default: "#2563eb",
  info: "#2563eb",
  success: "#16a34a",
  warning: "#c4962a",
  destructive: "#dc2626",
}

function toast({ title, description, variant = "default", duration }: ToastOptions) {
  const Icon = iconFor[variant]
  const id = sonnerToast(title as string, {
    description,
    duration: duration ?? 4000,
    icon: createElement(Icon, { size: 18, style: { color: iconColorFor[variant] } }),
    className: `coop-toast coop-toast-${variant}`,
  })

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastOptions) => {
      const NextIcon = iconFor[next.variant ?? variant]
      sonnerToast(next.title as string, {
        id,
        description: next.description,
        icon: createElement(NextIcon, { size: 18, style: { color: iconColorFor[next.variant ?? variant] } }),
      })
    },
  }
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => sonnerToast.dismiss(toastId),
    toasts: [] as ToastOptions[],
  }
}

export { useToast, toast }
