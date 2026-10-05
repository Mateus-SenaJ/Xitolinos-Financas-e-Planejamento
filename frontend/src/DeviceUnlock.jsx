import React, { useEffect, useState } from 'react';
import { api, authenticateDevice, login } from './api.js';
import { Icon } from './icons.jsx';
import Brand from './Brand.jsx';

export default function DeviceUnlock({ session, onUnlock, onReplaceSession }) {
  const [security, setSecurity] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/finance/security/status', { token: session.token, sensitive: false }).then(setSecurity).catch(reason => setError(reason.message)); }, [session.token]);

  async function unlock() {
    setBusy(true); setError('');
    try { await authenticateDevice(session.token); onUnlock(); }
    catch (reason) { setError(reason.message || 'A autenticação do aparelho não foi concluída.'); }
    finally { setBusy(false); }
  }

  async function passwordRecovery(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const next = await login(session.user.email, password);
      const replacement = { token: next.token, user: next.user };
      localStorage.setItem('xitolinos-session', JSON.stringify(replacement)); onReplaceSession(replacement); onUnlock();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return <main className="unlock-screen"><Brand className="brand-lockup unlock-brand"/><section className="unlock-card"><span className="unlock-mark"><Icon name="reserve" size={26}/></span><span className="eyebrow">SESSÃO PROTEGIDA</span><h1>Confirme seu acesso</h1><p>{security?.enabled ? 'Use a biometria deste dispositivo para abrir seu planejamento. O uso e os dados financeiros continuam locais.' : 'Entre novamente com a senha da conta. Você pode cadastrar a biometria nas definições de segurança.'}</p><button className="button button-primary button-wide" onClick={unlock} disabled={busy || security === null}>{busy ? 'Aguardando o dispositivo…' : security?.enabled ? 'Entrar com biometria' : 'Continuar para o aplicativo'}<Icon name="arrow" size={17}/></button>{security?.enabled && <form className="unlock-recovery" onSubmit={passwordRecovery}><details><summary>Não consigo usar a biometria</summary><label>Senha da conta<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></label><button className="button button-quiet button-wide" disabled={busy}>Entrar com senha</button></details></form>}{error && <p className="form-error" role="alert">{error}</p>}<span className="unlock-local"><i/>DADOS LOCAIS · ACESSO PROTEGIDO</span></section></main>;
}
