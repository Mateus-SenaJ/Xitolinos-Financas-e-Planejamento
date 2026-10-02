import React from 'react';

const paths = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></>,
  movements: <><path d="M12 3v18"/><path d="m17 8-5-5-5 5"/><path d="m7 16 5 5 5-5"/></>,
  planning: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
  reserve: <><path d="M12 3v18M5 7h14M7 7c0 4 2 5 5 5s5-1 5-5M7 17c0-3 2-5 5-5s5 2 5 5"/></>,
  goals: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  import: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></>,
  ask: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.8c-1.1 1.1-1.8 1.4-1.8 3.2M12 17h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H3.7a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  arrow: <><path d="m9 18 6-6-6-6"/></>,
  chevron: <><path d="m6 9 6 6 6-6"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h.01"/></>,
  card: <><rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M2.5 10h19"/></>,
  search: <><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.3 4.3"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
  moon: <><path d="M20.7 15.1A8.5 8.5 0 0 1 8.9 3.3a8.7 8.7 0 1 0 11.8 11.8Z"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>
};

export function Icon({ name, size = 20, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
