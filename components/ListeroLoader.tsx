"use client";

import { useEffect, useState } from "react";

// The Listero "L" mascot, bouncing while long operations run.
export function ListeroLoader({ messages }: { messages: string[] }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(
      () => setMsgIndex((i) => (i + 1) % messages.length),
      2600
    );
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center py-10" role="status">
      <div className="relative">
        {/* sparkles */}
        <span className="animate-listero-sparkle absolute -left-5 top-0 text-lg text-coral">
          ✦
        </span>
        <span className="animate-listero-sparkle-late absolute -right-5 top-6 text-sm text-sage">
          ✦
        </span>
        {/* the L */}
        <div className="animate-listero-bounce flex h-16 w-16 items-center justify-center rounded-2xl bg-coral shadow-lg">
          <span className="text-4xl font-black leading-none text-white">L</span>
        </div>
        {/* ground shadow */}
        <div className="animate-listero-shadow mx-auto mt-2 h-2 w-12 rounded-full bg-ink/40" />
      </div>
      <p className="mt-6 text-sm font-medium text-ink-soft" aria-live="polite">
        {messages[msgIndex]}
      </p>
    </div>
  );
}
