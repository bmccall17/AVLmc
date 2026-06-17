"use client";

import { Coffee } from "lucide-react";

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/bmccall17";

export default function SupportButton() {
  return (
    <a
      aria-label="Support AVLmc — buy me a coffee"
      className="sandbox-support"
      href={BUY_ME_A_COFFEE_URL}
      rel="noreferrer"
      target="_blank"
    >
      <Coffee aria-hidden="true" size={18} strokeWidth={2.25} />
      <span className="sandbox-support-tooltip" role="tooltip">
        <strong>a project fueled by a love for music…</strong>
        <span>and coffee! if it&rsquo;s useful and you want to see it keep growing, consider buying me a coffee.</span>
        <em>buy me a coffee →</em>
      </span>
    </a>
  );
}
