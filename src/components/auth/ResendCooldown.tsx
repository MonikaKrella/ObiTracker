import { useEffect, useState } from "react";

const COOLDOWN_SECONDS = 60;

export default function ResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [secondsLeft]);

  if (secondsLeft > 0) {
    return <p className="text-sm text-blue-100/40">Resend link ({secondsLeft}s)</p>;
  }

  return (
    <a href="/auth/forgot-password" className="text-sm text-purple-300 hover:underline">
      Resend link
    </a>
  );
}
