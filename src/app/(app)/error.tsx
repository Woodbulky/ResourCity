"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/kit";
import { Button, buttonVariants } from "@/components/ui/button";

// PRD 16 plain language: what happened, why, what to do next. Nothing was changed by a failed render.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div role="alert">
      <EmptyState
        icon={TriangleAlert}
        title="This page didn't load"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>Go to my dashboard</Link>
          </div>
        }
      >
        Something went wrong while we fetched it, usually a dropped connection. Nothing you did was lost or
        changed. Try again; if it keeps happening, tell an Admin
        {digest ? <> and quote code <span className="font-mono">{digest}</span></> : null}.
      </EmptyState>
    </div>
  );
}
