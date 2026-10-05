import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import BiometricSettings from './BiometricSettings.jsx';

const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
const amountCents = value => Math.round(Number(String(value || '0').replaceAll('.', '').replace(',', '.')) * 100);
const monthLabel = value => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));

export default function Settings({ data, billing, token, onRefresh, onToast, viewer }) {
  const [prefs, setPrefs] = useState(data.preferences || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => setPrefs(data.preferences || {}), [data.preferences]);

  async function save() {
    setBusy(true);
    try {
      await api('/finance/preferences', { token, method: 'PUT', body: JSON.stringify(prefs) });
      await onRefresh();
      onToast('Suas definições foram guardadas neste dispositivo.');
    } catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }

  async function openBilling(path) {
    setBusy(true);
    try {
      const result = await api(path, { token, method: 'POST', body: '{}' });
      location.assign(result.url);
    } catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }

  function photo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { onToast('Escolha uma imagem PNG, JPEG ou WebP de até 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setPrefs({ ...prefs, avatarDataUrl: reader.result });
    reader.readAsDataURL(file);
  }

  async function exportFile(format) {
    setBusy(true);
    try {
      const result = await api(`/finance/export?format=${format}&month=${data.month}`, { token });
      const content = format === 'backup' ? JSON.stringify(result, null, 2) : result.text;
      const blob = new Blob([content], { type: format === 'backup' ? 'application/json' : 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = format === 'backup' ? 'xitolinos-backup.json' : `xitolinos-${data.month}.txt`;
      link.click(); URL.revokeObjectURL(url);
    } catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }

  async function restoreFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { onToast('O backup excede o limite de 25 MB.'); event.target.value = ''; return; }
    if (!window.confirm('Adicionar os registros deste backup ao aparelho atual? Os itens que já existem serão preservados.')) { event.target.value = ''; return; }
    setBusy(true);
    try {
      const backup = JSON.parse(await file.text());
      const result = await api('/finance/restore', { token, method: 'POST', body: JSON.stringify(backup) });
      await onRefresh(); onToast(result.message);
    } catch (error) { onToast(error.message || 'Esse arquivo não pôde ser restaurado.'); }
    finally { setBusy(false); event.target.value = ''; }
  }

  return <>
    <header className="page-title"><div><span className="eyebrow">DO SEU JEITO</span><h1>Definições</h1><p>Personalize sua experiência, preserve seu histórico e ajuste seus avisos.</p></div></header>
    <div className="settings-grid">
      <section className="surface settings-card">
        <div className="section-head"><div><span className="eyebrow">APARÊNCIA</span><h2>Personalize sua página</h2></div></div>
        <div className="profile-edit"><div className="profile-avatar">{prefs.avatarDataUrl ? <img src={prefs.avatarDataUrl} alt="Sua foto de perfil"/> : <img src="/brand/icon-on-light.png" alt="Marca Xitolinos"/>}</div><label className="button button-quiet">Escolher foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={photo}/></label><small>A imagem fica salva no banco local deste aparelho.</small></div>
        <label>Visualização<select value={prefs.theme || 'light'} onChange={event => setPrefs({ ...prefs, theme: event.target.value })}><option value="light">Claro</option><option value="dark">Escuro</option><option value="system">Usar sistema</option></select></label>
        <fieldset className="swatch-field"><legend>Cor de destaque</legend><label><input type="radio" name="accent" value="green" checked={(prefs.accent || 'green') === 'green'} onChange={event => setPrefs({ ...prefs, accent: event.target.value })}/><i className="swatch swatch-green"/> Verde folha</label><label><input type="radio" name="accent" value="lime" checked={prefs.accent === 'lime'} onChange={event => setPrefs({ ...prefs, accent: event.target.value })}/><i className="swatch swatch-lime"/> Verde claro</label><label><input type="radio" name="accent" value="gold" checked={prefs.accent === 'gold'} onChange={event => setPrefs({ ...prefs, accent: event.target.value })}/><i className="swatch swatch-gold"/> Amarelo atenção</label></fieldset>
        {!viewer && <button className="button button-primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Guardar definições'}</button>}
      </section>
      <section className="surface settings-card">
        <div className="section-head"><div><span className="eyebrow">AVISOS E PROTEÇÃO</span><h2>Seus limites</h2></div></div>
        <label>Margem mínima após os compromissos<span className="currency-input"><b>R$</b><input inputMode="decimal" value={(Number(prefs.minimumReserveCents || 0) / 100).toFixed(2).replace('.', ',')} onChange={event => setPrefs({ ...prefs, minimumReserveCents: amountCents(event.target.value) })}/></span></label>
        <label>Parar de comprar antes do fechamento<select value={prefs.cardStopDaysBefore ?? 3} onChange={event => setPrefs({ ...prefs, cardStopDaysBefore: Number(event.target.value) })}><option value="0">No próprio dia</option><option value="1">1 dia antes</option><option value="2">2 dias antes</option><option value="3">3 dias antes</option><option value="5">5 dias antes</option><option value="7">1 semana antes</option></select></label>
        <label>Dia de revisar e fechar o mês<select value={prefs.closeoutDay || 1} onChange={event => setPrefs({ ...prefs, closeoutDay: Number(event.target.value) })}>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>Dia {index + 1}</option>)}</select></label>
        {!viewer && <button className="button button-primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Guardar definições'}</button>}
      </section>
    </div>
    <BiometricSettings token={token} viewer={viewer} onToast={onToast}/>
    <section className="surface data-tools"><div className="section-head"><div><span className="eyebrow">SEUS ARQUIVOS</span><h2>Compartilhar e guardar</h2><p>Transfira seus arquivos para outro aparelho quando estiverem lado a lado.</p></div></div><div className="data-tool-actions"><button className="button button-quiet" onClick={() => exportFile('text')} disabled={busy}><Icon name="download"/>Exportar {monthLabel(data.month)}</button><button className="button button-primary" onClick={() => exportFile('backup')} disabled={busy}><Icon name="download"/>Baixar backup dos dados</button>{!viewer && <label className="button button-quiet"><Icon name="import"/>Restaurar em outro aparelho<input type="file" accept="application/json,.json" onChange={restoreFile} disabled={busy}/></label>}</div><p className="muted">Sem rede entre os aparelhos, a transferência é manual pelo arquivo de backup. O app adiciona itens que faltam e preserva os registros que já existem.</p></section>
        <section className="surface billing-panel">
      <span className="billing-mark">X</span>
      <div>
        <span className="eyebrow">ASSINATURA DO APLICATIVO</span>
        <h2>{billing?.mode === 'local' ? 'Plano local ativo' : billing?.subscription?.status === 'active' ? 'Assinatura ativa' : 'Assinatura do aplicativo'}</h2>
        <p>{billing?.message || 'Cobran\u00e7as de assinatura est\u00e3o desligadas no modo offline.'}</p>
        <small>{'O Stripe fica restrito \u00e0 assinatura do aplicativo; cart\u00f5es e despesas pessoais nunca s\u00e3o enviados a ele.'}</small>
      </div>
      <div className="billing-actions">
        {billing?.checkoutReady && <button className="button button-primary" onClick={() => openBilling('/finance/billing/checkout')} disabled={busy}>Assinar</button>}
        {billing?.manageReady && <button className="button button-quiet" onClick={() => openBilling('/finance/billing/portal')} disabled={busy}>Gerenciar assinatura</button>}
        {!billing?.checkoutReady && !billing?.manageReady && <button className="button button-quiet" disabled title={'Dispon\u00edvel quando a vers\u00e3o online estiver configurada.'}>Assinatura online indispon\u00edvel</button>}
      </div>
    </section>
    <section className="local-storage-note"><span className="local-indicator"/><strong>Este aplicativo está configurado para uso local</strong><span>Sem serviços em nuvem ou envio de dados financeiros.</span></section>
  </>;
}
