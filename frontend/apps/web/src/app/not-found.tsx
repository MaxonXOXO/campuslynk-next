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

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle className="text-lg">Page not found</CardTitle>
          <CardDescription>
            The page you requested does not exist or has moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Check the URL or return to your workspace home.
          </p>
        </CardContent>
        <CardFooter>
          <Link href="/home">
            <Button type="button">Return home</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

