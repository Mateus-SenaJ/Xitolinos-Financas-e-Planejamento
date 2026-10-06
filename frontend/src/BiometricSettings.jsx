import React, { useEffect, useState } from 'react';
import { api, authenticateNativeBiometry, checkNativeBiometry } from './api.js';
import { Icon } from './icons.jsx';

export default function BiometricSettings({ token, viewer, onToast }) {
  const [security, setSecurity] = useState(null);
  const [supported, setSupported] = useState(false);
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api('/finance/security/status', { token, sensitive: false }),
      import('@capacitor/core').then(({ Capacitor }) => Capacitor.isNativePlatform()),
      import('@simplewebauthn/browser').then(module => module.browserSupportsWebAuthn())
    ]).then(async ([status, isNative, webAuthnSupported]) => {
      if (!active) return;
      setNativeAndroid(isNative);
      setSecurity(status);
      if (isNative) setSupported((await checkNativeBiometry()).isAvailable);
      else setSupported(webAuthnSupported);
    }).catch(error => { if (active) onToast(error.message); });
    return () => { active = false; };
  }, [token]);

  async function register() {
    setBusy(true);
    try {
      const options = await api('/finance/security/registration/options', { token, sensitive: false });
      if (options.nativeBiometric) {
        const available = await checkNativeBiometry();
        if (!available.isAvailable) throw new Error(available.reason || 'Configure uma biometria nas definições do Android antes de ativá-la.');
        await authenticateNativeBiometry('Ative a biometria do Xitolinos neste aparelho.');
        const result = await api('/finance/security/registration/verify', { token, method: 'POST', body: JSON.stringify({ native: true, deviceName: 'Este aparelho' }) });
        setSecurity({ enabled: true, credentialCount: result.credentialCount, credentials: [{ id: 'android-device', deviceName: 'Este aparelho' }], nativeBiometric: true });
        onToast(result.message);
        return;
      }
      const { startRegistration } = await import('@simplewebauthn/browser');
      const credential = await startRegistration({ optionsJSON: options });
      const result = await api('/finance/security/registration/verify', { token, method: 'POST', body: JSON.stringify({ credential, deviceName: 'Este dispositivo' }) });
      setSecurity({ enabled: true, credentialCount: result.credentialCount, userVerification: 'required', localOnly: true });
      onToast(result.message);
    } catch (error) { onToast(error.message || 'Não foi possível cadastrar a biometria.'); }
    finally { setBusy(false); }
  }

  async function remove(credential) {
    const password = window.prompt('Digite a senha da conta para remover esta biometria deste aparelho.');
    if (password === null) return;
    setBusy(true);
    try {
      const result = await api('/finance/security/credential/remove', { token, method: 'POST', sensitive: false, body: JSON.stringify({ credentialId: credential.id, password }) });
      setSecurity({ ...security, enabled: result.credentialCount > 0, credentialCount: result.credentialCount, credentials: security.credentials.filter(item => item.id !== credential.id) });
      onToast('A biometria foi removida deste perfil. A senha continua ativa.');
    } catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }

  return <section className="surface biometric-panel"><span className="biometric-icon"><Icon name="reserve"/></span><div className="biometric-main"><span className="eyebrow">SEGURANÇA DO DISPOSITIVO</span><h2>{nativeAndroid ? 'Biometria do aparelho' : 'Biometria e Windows Hello'}</h2><p>Confirma a entrada na sessão e operações que alteram o histórico ou exportam seus dados. A confirmação acontece neste aparelho e os dados financeiros permanecem locais.</p>{security === null ? <small>Verificando o dispositivo local…</small> : security.enabled ? <div className="credential-list"><span className="security-enabled"><i/>Ativa neste aparelho · confirmação obrigatória</span>{(security.credentials || []).map(credential => <div className="credential-row" key={credential.id}><span>{credential.deviceName || 'Dispositivo local'}</span>{!viewer && <button className="button button-small" onClick={() => remove(credential)} disabled={busy}>Remover com senha</button>}</div>)}</div> : <small>A biometria ainda não está cadastrada neste perfil.</small>}</div>{!viewer && !security?.enabled && <button className="button button-primary" onClick={register} disabled={busy || !supported}>{busy ? 'Aguardando o aparelho…' : supported ? 'Cadastrar biometria' : 'Biometria não disponível'}</button>}</section>;
}
