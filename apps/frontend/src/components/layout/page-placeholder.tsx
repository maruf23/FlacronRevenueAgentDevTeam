import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          {title}
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Coming online</CardTitle>
            <Badge variant="secondary">Placeholder</Badge>
          </div>
          <CardDescription>
            This surface is wired into navigation and will connect to the API
            next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Backend target:{' '}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs text-navy">
              {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
