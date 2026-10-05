export default function Brand({ className = 'brand-lockup' }) {
  return <div className={className} role="img" aria-label="Xitolinos — Finanças e Planejamento">
    <img className="brand-logo brand-logo-on-light" src="/brand/wordmark-on-light.png" alt="" aria-hidden="true" />
    <img className="brand-logo brand-logo-on-dark" src="/brand/wordmark-on-dark.png" alt="" aria-hidden="true" />
  </div>;
}
