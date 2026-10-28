"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/kit";

// Phone-camera QR scanner (PRD 10). A ResourCity code is a link to one of our own pages (Owner
// scan, door check-in), so a successful scan just opens it; the server verifies everything.
export function QrScanner({ hint }: { hint: string }) {
  const router = useRouter();
  const regionId = useId().replace(/:/g, "");
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string>();
  const [code, setCode] = useState("");
  const opened = useRef(false);

  const open = (text: string) => {
    try {
      const url = new URL(text.trim(), window.location.origin);
      if (url.origin !== window.location.origin) return setError("That QR code is not from ResourCity.");
      opened.current = true;
      router.push(`${url.pathname}${url.search}`);
    } catch {
      setError("That is not a ResourCity code.");
    }
  };

  useEffect(() => {
    if (!on) return;
    let scanner: import("html5-qrcode").Html5Qrcode | undefined;
    let stopped = false;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (stopped) return;
      scanner = new Html5Qrcode(regionId);
      scanner
        .start({ facingMode: "environment" }, { fps: 10, qrbox: 240 }, (text) => {
          if (!opened.current) open(text);
        }, undefined)
        .catch(() => {
          setError("The camera could not start. Allow camera access, or paste the code below.");
          setOn(false);
        });
    });
    return () => {
      stopped = true;
      scanner?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per toggle
  }, [on, regionId]);

  return (
    <div className="grid gap-4">
      <div id={regionId} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-pine-deep/90 [&_video]:h-full [&_video]:object-cover">
        {!on && (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-[#c3d0c6]">
            <p>{hint}</p>
          </div>
        )}
      </div>
      <Button type="button" size="lg" className="mx-auto w-full max-w-sm" variant={on ? "outline" : "default"} onClick={() => { setError(undefined); setOn(!on); }}>
        {on ? <><CameraOff aria-hidden /> Stop camera</> : <><Camera aria-hidden /> Start camera</>}
      </Button>
      <form
        className="mx-auto grid w-full max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          open(code);
        }}
      >
        <label htmlFor={`${regionId}-code`} className="text-sm font-semibold">No camera? Paste the code</label>
        <div className="flex gap-2">
          <input id={`${regionId}-code`} value={code} onChange={(e) => setCode(e.target.value)} className={field} placeholder="https://…" />
          <Button type="submit" variant="outline">Open</Button>
        </div>
      </form>
      {error && <p role="alert" className="mx-auto max-w-sm rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{error}</p>}
    </div>
  );
}
