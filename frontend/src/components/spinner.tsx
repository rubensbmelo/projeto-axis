import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "size-6 animate-spin rounded-full border-2 border-muted border-t-primary",
        className
      )}
    />
  )
}

// Loading contextual: preserva a estrutura esperada da página em vez de
// um spinner genérico no centro da tela.
export function PageLoader() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-72" />
      <div className="rounded-lg border p-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}
