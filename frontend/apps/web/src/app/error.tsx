"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@academic-suite/ui";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    void error;
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle className="text-lg">Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred while rendering this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You can try reloading this view or return to your home workspace.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link href="/home">
            <Button type="button" variant="outline">
              Go to home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

