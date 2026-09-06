import { useEffect, useState } from "react";

const COOLDOWN_SECONDS = 60;

export default function ResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  if (secondsLeft > 0) {
    return <p className="text-sm text-blue-100/40">Resend link ({secondsLeft}s)</p>;
  }

  return (
    <a href="/auth/forgot-password" className="text-sm text-purple-300 hover:underline">
      Resend link
    </a>
  );
}
