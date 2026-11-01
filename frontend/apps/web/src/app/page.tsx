import Link from "next/link";
import { fetchApiHealth } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  StatusBadge,
  Button,
} from "@academic-suite/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await fetchApiHealth();
  const isHealthy = health.ok && health.status === "ok";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-background text-foreground">
      <Card className="max-w-xl w-full border-border shadow-sm">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                Academic Suite
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                Multi-tenant Academic Management Platform (CampusLynk / Carmel LINX)
              </CardDescription>
            </div>
            <StatusBadge status={isHealthy ? "success" : "warning"}>
              {health.status.toUpperCase()}
            </StatusBadge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            System Status
          </h2>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40 border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">
                API Health Probe (<code className="text-xs font-mono">/api/v1/health</code>)
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`inline-block size-2.5 rounded-full ${
                  isHealthy ? "bg-primary" : "bg-destructive"
                }`}
              />
              <span className="font-mono text-sm font-semibold uppercase">
                {health.status}
              </span>
            </div>
          </div>

          {health.timestamp && (
            <p className="text-xs text-muted-foreground text-right">
              Server timestamp: <span className="font-mono">{health.timestamp}</span>
            </p>
          )}

          {health.error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 font-mono">
              Notice: {health.error}
            </p>
          )}

          <div className="pt-2">
            <Link href="/design-system">
              <Button variant="outline" className="w-full">
                Open Frontend Design System Showcase &rarr;
              </Button>
            </Link>
          </div>
        </CardContent>

        <CardFooter className="pt-4 border-t border-border text-xs text-muted-foreground flex justify-between items-center">
          <span>Sprint 0 • Preset b2BnwmRcY</span>
          <span>Next.js App Router • Server Component</span>
        </CardFooter>
      </Card>
    </main>
  );
}
