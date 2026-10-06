import React, { useEffect, useState } from 'react';
import { api, login, parseStatement, parseStatementText, saveLocalFile } from './api.js';
import { Icon } from './icons.jsx';
import Settings from './Settings.jsx';
import DeviceUnlock from './DeviceUnlock.jsx';
import Brand from './Brand.jsx';
import { formatMoneyEntry, isRealDate, parseMoneyToCents } from './form-values.js';
import { readReceipt } from './receipt-ocr.js';
import { parseLocalCsv, toShoppingCsv } from './shopping-csv.js';

const todayDateString = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const monthLabel = (value, compact = false) => new Intl.DateTimeFormat('pt-BR', { month: compact ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
const money = (cents, keepVisible = false) => document.documentElement.dataset.valuesHidden === 'true' && !keepVisible
  ? '•••••'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
const amountCents = parseMoneyToCents;
const addMonths = (value, amount) => {
  const date = new Date(`${value}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
};
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Sem data';
const navItems = [
  ['dashboard', 'dashboard', 'Visão geral', 'planning'], ['flow', 'movements', 'Fluxo de caixa', 'planning'],
  ['shopping', 'shopping', 'Compras', 'planning'],
  ['movements', 'movements', 'Transações', 'planning'], ['calendar', 'planning', 'Calendário', 'planning'],
  ['cards', 'card', 'Cartões e faturas', 'planning'], ['reserve', 'reserve', 'Reservas', 'planning'],
  ['planning', 'planning', 'Planejamento', 'manage'], ['goals', 'goals', 'Metas', 'manage'],
  ['settings', 'settings', 'Definições', 'manage'],
  ['reports', 'movements', 'Relatórios', 'tools'],
  ['import', 'import', 'Importar extrato', 'tools'], ['ask', 'ask', 'Dúvidas', 'tools'],
];

function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState('demo@xitolinos.local');
  const [password, setPassword] = useState('Xitolinos-Demo-2026!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="login-screen"><section className="login-art"><Brand/><div className="login-quote"><span className="eyebrow">POR TRÁS DA BELEZA, UM PLANO</span><h1>A vida é o<br/><em>seu projeto.</em></h1><p>Um cuidado de cada vez. Veja o que já foi gasto, o que vem pela frente e quanto precisa cobrir.</p><div className="login-art-footer"><span>PLANEJAMENTO QUE ACOMPANHA SUA VIDA</span><span>01 — FINANÇAS PESSOAIS</span></div></div></section><section className="login-panel"><div className="login-form-wrap"><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Seu plano, no lugar certo.</h2><p>Entre para acompanhar seu mês com clareza.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onLogin(identifier, password); } catch (reason) { setError(reason.message); } finally { setBusy(false); } }}><label>E-mail<input autoComplete="username" type="email" value={identifier} onChange={event => setIdentifier(event.target.value)} required/></label><label>Senha<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary button-wide" disabled={busy}>{busy ? 'Entrando…' : 'Entrar na minha conta'}<Icon name="arrow" size={17}/></button></form><div className="demo-note"><Icon name="wallet"/><span><strong>Conta local de demonstração</strong><small>Os dados ficam neste dispositivo e não saem pela internet.</small></span></div></div><footer>SEU RITMO. SEU PROJETO. UM PLANO.</footer></section></main>;
}

function MonthRail({ data, month, onChange }) {
  const [touchStart, setTouchStart] = useState(null);
  const entries = [-1, 0, 1].map(offset => {
    const period = addMonths(month, offset);
    return data.monthSummaries.find(item => item.month === period) || { month: period, available: false };
  });
  const chosen = entries.find(item => item.month === month);
  return <section className="month-section" aria-label="Meses do planejamento"><div className="section-head"><div><span className="eyebrow">SEU DINHEIRO NO TEMPO</span><h2>Saldo por mês</h2></div><div className="rail-legend"><span><i className="dot dot-green"/>Saldo projetado</span><span><i className="dot dot-gold"/>Precisa de cobertura</span></div></div><div className="month-rail" onTouchStart={event => setTouchStart({ x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY })} onTouchEnd={event => { if (!touchStart) return; const dx = event.changedTouches[0].clientX - touchStart.x; const dy = event.changedTouches[0].clientY - touchStart.y; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) onChange(addMonths(month, dx < 0 ? 1 : -1)); setTouchStart(null); }}><button className="rail-arrow" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}><span>‹</span></button><div className="month-track">{entries.map((item, index) => <button key={item.month} aria-pressed={item.month === month} className={'month-card ' + (item.month === month ? 'selected ' : '') + (item.month === data.currentMonth ? 'month-current' : '')} onClick={() => onChange(item.month)}><span className="month-card-head">{item.month === data.currentMonth ? 'ATUAL' : index === 0 ? 'ANTERIOR' : index === 1 ? 'SELECIONADO' : 'POSTERIOR'}</span><strong>{monthLabel(item.month).split(' ')[0]}</strong><small>{index === 1 && item.month === data.currentMonth ? 'Saldo disponível' : 'Saldo projetado'}</small><span className="month-card-total">{item.available === false ? '—' : index === 1 && item.month === data.currentMonth ? money(data.currentCashCents) : money(item.projectedEndBalanceCents)}</span><span className="month-status">Despesas {item.available === false ? '—' : money(item.expenseCents, true)}</span><span className="month-status reserve-withdrawal">Retiradas da reserva {item.available === false ? '—' : money(item.reserveWithdrawalCents)}</span><span className={'month-status ' + (item.hasDeficit ? 'status-attention' : '')}>{item.available === false ? 'Sem dados' : item.hasDeficit ? 'Cobertura ' + money(item.coverageNeededCents) : 'Entradas ' + money(item.incomeCents)}</span></button>)}</div><button className="rail-arrow" aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}><span>›</span></button></div><p className="month-selection"><strong>{monthLabel(month)}</strong><span>{chosen && chosen.available !== false ? chosen.expenseCount + ' lançamentos · ' + money(chosen.expenseCents, true) + ' em despesas previstas · ' + money(chosen.reserveWithdrawalCents) + ' retirados das reservas' : 'Sem dados para este mês'}</span></p></section>;
}

function SummaryCard({ icon, label, value, detail, kind = '', keepVisible = false, onClick }) {
  return <button type="button" className={`summary-card ${kind} summary-card-link`} onClick={onClick} aria-label={`${label}: ${money(value, keepVisible)}. Abrir detalhes`}><span className="summary-icon"><Icon name={icon}/></span><span className="summary-label">{label}</span><strong>{money(value, keepVisible)}</strong><small>{detail}</small><span className="summary-link-hint">Abrir detalhes <Icon name="arrow" size={13}/></span></button>;
}

function BalanceOverviewCard({ data, onClick }) {
  return <button type="button" className="balance-overview-card summary-card-link" onClick={onClick} aria-label={`Saldo disponível ${money(data.currentCashCents)}; saldo projetado ${money(data.totals.projectedEndBalanceCents)}. Abrir fluxo de caixa`}><span className="summary-icon"><Icon name="wallet"/></span><span className="summary-label">Saldo da conta</span><span className="balance-overview-values"><span><small>Disponível</small><strong>{money(data.currentCashCents)}</strong></span><i/><span><small>Projetado no mês</small><strong>{money(data.totals.projectedEndBalanceCents)}</strong></span></span><small className="balance-overview-detail">{money(data.totals.incomeCents - data.totals.paidIncomeCents)} ainda a receber</small><span className="summary-link-hint">Abrir fluxo de caixa <Icon name="arrow" size={13}/></span></button>;
}

function ExpenseTrends({ history = [] }) {
  const width = 600, height = 190, padX = 24, padY = 24;
  const max = Math.max(1, ...history.map(point => point.totalCents));
  const y = value => height - padY - value / max * (height - padY * 2);
  const x = index => padX + index * (width - padX * 2) / Math.max(1, history.length - 1);
  const line = key => history.map((point, index) => `${x(index)},${y(point[key])}`).join(' ');
  return <section className="surface expense-trends"><div className="section-head"><div><span className="eyebrow">HISTÓRICO PAGO</span><h2>Despesas ao longo do tempo</h2><p>Valores efetivamente contabilizados nos últimos 12 meses.</p></div></div>{history.length ? <><svg className="expense-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de despesas totais, de rotina e extras, por mês"><polyline className="trend-total" points={line('totalCents')}/><polyline className="trend-routine" points={line('routineCents')}/><polyline className="trend-extra" points={line('extraCents')}/>{history.map((point, index) => <text key={point.month} x={x(index)} y={height - 3} textAnchor="middle">{monthLabel(point.month, true).split(' ')[0]}</text>)}</svg><div className="expense-chart-legend"><span><i className="legend-total"/>Total</span><span><i className="legend-routine"/>Rotina mensal</span><span><i className="legend-extra"/>Fora da rotina</span></div></> : <p className="muted">O gráfico aparecerá depois que houver despesas pagas.</p>}</section>;
}

function ExpenseCategories({ categories = [], onOpen }) {
  const palette = ['#15371D', '#58AB2F', '#A1DC67', '#F4D03F', '#D9D9D9', '#457B39'];
  const total = categories.reduce((sum, row) => sum + row.amountCents, 0);
  let current = 0;
  const gradient = categories.map((row, index) => { const start = current; current += total ? row.amountCents / total * 100 : 0; return `${palette[index % palette.length]} ${start}% ${current}%`; }).join(', ');
  return <section className="surface expense-category-chart"><div className="section-head"><div><span className="eyebrow">COMPOSIÇÃO DO MÊS</span><h2>Por categoria</h2><p>Despesas previstas e pagas, por categoria.</p></div><button className="button button-text" onClick={onOpen}>Abrir lançamentos<Icon name="arrow" size={14}/></button></div>{categories.length ? <div className="expense-donut-layout"><div className="expense-donut" role="img" aria-label={`Despesas por categoria, total ${money(total, true)}`} style={{ background: `conic-gradient(${gradient})` }}><span><small>Total</small><strong>{money(total, true)}</strong></span></div><div className="expense-donut-legend">{categories.slice(0, 6).map((row, index) => <button key={row.name} onClick={onOpen}><i style={{ background: palette[index % palette.length] }}/><span>{row.name}</span><small>{total ? Math.round(row.amountCents / total * 100) : 0}%</small><strong>{money(row.amountCents, true)}</strong></button>)}</div></div> : <p className="muted">As categorias aparecem conforme os lançamentos forem adicionados.</p>}</section>;
}

function FinanceAgenda({ data, month, setPage }) {
  const entries = [
    ...data.details.filter(row => (row.dueDate || row.date || '').startsWith(month)).map(row => ({
      id: row.id, date: row.dueDate || row.date, title: row.description,
      subtitle: `${row.projected ? 'Programado' : row.status === 'paid' ? 'Pago' : 'Em aberto'} · ${row.accountName || 'conta principal'}`,
      amountCents: row.amountCents, type: row.type
    })),
    ...data.cards.filter(card => card.invoiceCents > 0).map(card => ({
      id: `card-${card.id}`, date: `${month}-${String(Math.min(card.dueDay, new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate())).padStart(2, '0')}`,
      title: `Fatura do ${card.name}`, subtitle: `Vencimento dia ${card.dueDay} · conta principal`, amountCents: card.invoiceCents, type: 'card'
    }))
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  return <section className="surface finance-agenda"><div className="section-head"><div><span className="eyebrow">COMPROMISSOS E RECEBIMENTOS</span><h2>Agenda financeira</h2><p>{monthLabel(month)}</p></div><button className="button button-text" onClick={() => setPage('planning')}>Calendário<Icon name="arrow" size={15}/></button></div>{entries.length ? <div className="agenda-list">{entries.map(item => <article className="agenda-row" key={item.id}><span className={`agenda-date ${item.type === 'income' ? 'income-date' : item.type === 'card' ? 'card-date' : ''}`}>{item.date.slice(-2)}</span><span className="agenda-label"><strong>{item.title}</strong><small>{item.subtitle}</small></span><strong className={`agenda-amount ${item.type === 'income' ? 'income-green' : ''}`}>{item.type === 'income' ? '+ ' : ''}{money(item.amountCents, item.type !== 'income')}</strong></article>)}</div> : <div className="agenda-empty">Nenhuma movimentação programada para {monthLabel(month)}.</div>}</section>;
}

function MonthDetail({ data, month, setPage }) {
  const expenses = data.details.filter(row => row.type === 'expense').slice(0, 3);
  const incomes = data.details.filter(row => row.type === 'income').slice(0, 3);
  const groups = [['expense', 'Despesas programadas', expenses], ['income', 'Entradas programadas', incomes]];
  return <section className="surface month-detail"><div className="section-head"><div><span className="eyebrow">PLANO DO MÊS</span><h2>{monthLabel(month)} em detalhes</h2><p>Compromissos e recebimentos que formam seu saldo projetado.</p></div><strong className="month-detail-total">Saldo projetado <span className={data.totals.projectedEndBalanceCents < 0 ? 'attention-value' : ''}>{money(data.totals.projectedEndBalanceCents)}</span></strong></div><div className="month-detail-groups">{groups.map(([type, label, rows]) => <section className="month-detail-group" key={type}><div className="month-detail-heading"><h3>{label}</h3><strong className={type === 'income' ? 'income-green' : ''}>{type === 'income' ? '+ ' : ''}{money(type === 'income' ? data.totals.incomeCents : data.totals.expenseCents, type === 'expense')}</strong></div>{rows.length ? rows.map(row => <article className="month-detail-row" key={`${type}-${row.id}`}><span className={`month-detail-icon ${type}`}><Icon name={type === 'income' ? 'arrow' : row.method === 'card' ? 'card' : 'wallet'} size={17}/></span><span><strong>{row.description}</strong><small>{dateLabel(row.dueDate || row.date)} · {row.projected ? 'Previsto' : row.status === 'paid' ? 'Pago' : 'Em aberto'}</small></span><strong className={type === 'income' ? 'income-green' : ''}>{type === 'income' ? '+ ' : ''}{money(row.amountCents, row.type !== 'income')}</strong></article>) : <p className="month-detail-empty">{type === 'income' ? 'Ainda não há entradas programadas.' : 'Ainda não há despesas programadas.'}</p>}</section>)}</div>{data.totals.coverageNeededCents > 0 && <div className="month-coverage-note"><Icon name="bell" size={16}/><span>Em {monthLabel(month)}, faltam <strong>{money(data.totals.coverageNeededCents)}</strong> para cobrir as despesas previstas.</span><button className="button button-text" onClick={() => setPage('reserve')}>Ver reservas<Icon name="arrow" size={14}/></button></div>}</section>;
}

function CashflowForecast({ data, month }) {
  const entries = data.monthSummaries.filter(item => item.month >= month).slice(0, 7);
  const maxAmount = Math.max(1, ...entries.flatMap(item => [item.incomeCents, item.expenseCents]));
  return <section className="surface cashflow-forecast" aria-label="Previsão de caixa">
    <div className="section-head"><div><span className="eyebrow">CONFIRMADO E PREVISTO</span><h2>Previsão de caixa</h2><p>Entradas e despesas · próximos meses</p></div><span className="cashflow-legend"><i/>Entradas <i/>Despesas</span></div>
    <div className="cashflow-chart" role="img" aria-label={`Comparação mensal de entradas e despesas a partir de ${monthLabel(month)}`}>
      {entries.map(item => <div className="cashflow-month" key={item.month} title={`${monthLabel(item.month)}: entradas ${money(item.incomeCents)}, despesas ${money(item.expenseCents, true)}`}>
        <div className="cashflow-bars"><i className="cashflow-income" style={{ height: `${Math.max(3, item.incomeCents / maxAmount * 100)}%` }}/><i className="cashflow-expense" style={{ height: `${Math.max(3, item.expenseCents / maxAmount * 100)}%` }}/></div>
        <span>{monthLabel(item.month, true).split(' ')[0]}</span>
      </div>)}
    </div>
  </section>;
}

function ReservePreview({ data, setPage }) {
  return <section className="surface reserve-preview"><div className="section-head"><div><span className="eyebrow">SEGURANÇA FINANCEIRA</span><h2>Reservas e objetivos</h2><p>Patrimônio protegido: {money(data.reserveSummary.totalCents)}</p></div><button className="button button-text" onClick={() => setPage('reserve')}>Gerenciar<Icon name="arrow" size={15}/></button></div><div className="reserve-runway"><span className="eyebrow">COBERTURA DE EMERGÊNCIA</span><strong>{data.reserveSummary.emergencyCoverageMonths.toLocaleString('pt-BR')} meses</strong><small>Meta recomendada: {data.reserveSummary.recommendedCoverageMonths} meses</small></div><div className="reserve-preview-list">{data.reserves.map(item => <div className="reserve-preview-row" key={item.id}><div><span>{item.name}</span><strong>{money(item.balanceCents)}</strong></div><span className="reserve-preview-track"><i className={`reserve-color-${item.kind}`} style={{ width: `${Math.min(100, item.targetCents ? item.balanceCents / item.targetCents * 100 : 0)}%` }}/></span></div>)}</div></section>;
}

function QuickAccess({ setPage }) {
  return <nav className="quick-access" aria-label="Acessos rápidos">{[['movements', 'movements', 'Extrato'], ['reserve', 'reserve', 'Reservas'], ['import', 'import', 'Importar'], ['ask', 'ask', 'Dúvidas']].map(([page, icon, label]) => <button className="quick-access-link" key={page} onClick={() => setPage(page)}><span><Icon name={icon} size={20}/></span><strong>{label}</strong></button>)}</nav>;
}

function DeliveryPreview({ data, onOpen }) {
  return <section className="delivery-preview"><span className="delivery-mark"><Icon name="ask" size={20}/></span><span className="eyebrow">PRÉVIA PARA QUINTA E FIM DE SEMANA</span><h3>Posso pedir delivery?</h3><p>{data.deliveryRecommendation.maximumAmountCents > 0 ? `Até ${money(data.deliveryRecommendation.maximumAmountCents)} cabe na projeção atual, preservando a margem mínima.` : 'A projeção pede cautela. Aguarde uma entrada ou reveja os compromissos antes de pedir.'}</p><button className="button button-dark" onClick={onOpen}>Simular outro gasto<Icon name="arrow" size={15}/></button></section>;
}

function Row({ row, viewer, onEdit, onDelete, onReceipt }) {
  const receipt = row.receiptExtracted || {};
  const receiptReference = receipt.transactionCode || receipt.receiptNumber;
  return <article className="transaction-row"><span className={`transaction-icon ${row.type === 'income' ? 'is-income' : row.projected ? 'is-projected' : ''}`}><Icon name={row.type === 'income' ? 'arrow' : row.method === 'card' ? 'card' : 'wallet'} size={19}/></span><span className="transaction-main"><strong>{row.description}</strong><small>{row.category || (row.source === 'recurrence' ? 'Despesa fixa' : 'Movimentação')} <i>·</i> {row.method === 'card' ? row.cardName || 'Cartão de crédito' : row.method === 'pix' ? 'Pix' : row.method === 'cash' ? 'Dinheiro' : row.method === 'transfer' ? 'Transferência' : 'Conta'}</small>{row.hasReceipt && onReceipt && <button className="receipt-link" onClick={() => onReceipt(row)}><Icon name="file" size={14}/>Abrir comprovante</button>}{receiptReference && <small className="receipt-reference">Referência: {receiptReference}</small>}<details className="transaction-details"><summary>Ver detalhes</summary><div className="transaction-details-body"><span><small>Data</small><strong>{dateLabel(row.dueDate || row.date)}</strong></span><span><small>Status</small><strong>{row.projected ? 'Previsto' : row.status === 'paid' ? 'Pago' : 'Em aberto'}</strong></span><span><small>Forma de pagamento</small><strong>{row.method === 'card' ? row.cardName || 'Cartão de crédito' : row.method === 'pix' ? 'Pix' : row.method === 'cash' ? 'Dinheiro' : row.method === 'transfer' ? 'Transferência' : 'Conta bancária'}</strong></span>{row.installmentCount > 1 && <span><small>Parcela</small><strong>{row.installmentNumber}/{row.installmentCount}</strong></span>}{row.memo && <span><small>Observação</small><strong>{row.memo}</strong></span>}{receipt.transactionCode && <span><small>Código da transação</small><strong>{receipt.transactionCode}</strong></span>}{receipt.receiptNumber && <span><small>Número do comprovante</small><strong>{receipt.receiptNumber}</strong></span>}{receipt.date && <span><small>Data no comprovante</small><strong>{dateLabel(receipt.date)}</strong></span>}{Number.isSafeInteger(receipt.amountCents) && <span><small>Valor lido</small><strong>{money(receipt.amountCents, row.type !== 'income')}</strong></span>}{!viewer && !row.projected && <span className="transaction-detail-actions"><button className="button button-small" onClick={() => onEdit(row)}>Editar valor e dados</button><button className="button button-small" onClick={() => onDelete(row)}>Remover</button></span>}</div></details></span><span className="transaction-date">{dateLabel(row.dueDate || row.date)}{row.installmentCount > 1 && <small>{row.installmentNumber}/{row.installmentCount} parcelas</small>}</span><span className={`transaction-value ${row.type === 'income' ? 'positive' : ''}`}>{row.type === 'income' ? '+ ' : '− '}{money(row.amountCents, row.type !== 'income')}<small>{row.projected ? 'Previsto' : row.status === 'paid' ? 'Pago' : 'Em aberto'}</small></span>{!viewer && !row.projected && <button className="row-action" aria-label={`Editar ${row.description}`} title="Editar" onClick={() => onEdit(row)}>···</button>}{!viewer && !row.projected && <button className="row-delete" aria-label={`Remover ${row.description}`} title="Remover" onClick={() => onDelete(row)}>×</button>}</article>;
}

function ItemList({ rows, viewer, onEdit, onDelete, onReceipt, empty = 'Ainda não há itens para mostrar neste período.' }) {
  return rows.length ? <div className="transaction-list">{rows.map(row => <Row key={row.id} row={row} viewer={viewer} onEdit={onEdit} onDelete={onDelete} onReceipt={onReceipt}/>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="movements" size={24}/></span><strong>Tudo tranquilo por aqui</strong><p>{empty}</p></div>;
}

function Dashboard({ data, month, onMonthChange, viewer, onOpenForm, onOpenAdvice, onEdit, onDelete, onSettleCard, onCloseMonth, setPage }) {
  const topCategories = data.categoryTotals.slice(0, 4);
  const topAmount = Math.max(1, ...topCategories.map(item => item.amountCents));
  const hasOverdue = data.details.some(row => row.type === 'expense' && row.status !== 'paid' && (row.dueDate || row.date) < todayDateString());
  const firstName = (data.profile?.username || 'Olá').split(/[ @]/)[0];
  return <>
    <header className="page-title dashboard-greeting"><div><span className="eyebrow">VISÃO CONSOLIDADA DE HOJE</span><h1>Olá, {firstName}. {data.totals.coverageNeededCents > 0 ? 'Há despesas sem cobertura suficiente.' : hasOverdue ? 'Há compromissos que pedem atenção.' : 'Seu planejamento está em dia.'}</h1><p>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date())} · {data.accounts[0]?.name || 'Conta principal'} · {monthLabel(month)}</p></div><div className="title-actions">{!viewer && <><button className="button button-quiet" onClick={onCloseMonth}><Icon name="check"/>Fechar mês</button><button className="button button-primary" onClick={() => onOpenForm('movement-choice')}><Icon name="plus"/>Adicionar movimentação</button></>}</div></header>
    <section className="summary-grid dashboard-summary" aria-label="Resumo financeiro">
      <BalanceOverviewCard data={data} onClick={() => setPage('flow')}/>
      <SummaryCard icon="card" label="Despesas previstas" value={data.totals.expenseCents} detail={Math.min(100, Math.round(data.totals.paidExpenseCents / Math.max(1, data.totals.expenseCents) * 100)) + '% já contabilizadas'} keepVisible kind="expense-summary-card" onClick={() => setPage('movements')}/>
      <SummaryCard icon={data.totals.coverageNeededCents > 0 ? 'bell' : 'check'} label="Falta para cobrir" value={data.totals.coverageNeededCents} detail={data.totals.coverageNeededCents > 0 ? 'Despesas sem cobertura suficiente' : 'Todas as despesas estão cobertas'} kind={data.totals.coverageNeededCents > 0 ? 'attention' : 'covered-card'} onClick={() => setPage(data.totals.coverageNeededCents > 0 ? 'reserve' : 'movements')}/>
    </section>
    <MonthRail data={data} month={month} onChange={onMonthChange}/>
    <MonthDetail data={data} month={month} setPage={setPage}/>
    <div className="dashboard-highlight-grid"><FinanceAgenda data={data} month={month} setPage={() => setPage('calendar')}/></div>
    <QuickAccess setPage={destination => destination === 'ask' ? onOpenAdvice('purchase') : setPage(destination)}/>
    <div className="dashboard-secondary-grid"><DeliveryPreview data={data} onOpen={() => onOpenAdvice('delivery')}/><ReservePreview data={data} setPage={setPage}/></div>
    <div className="content-columns"><section className="surface details-panel"><div className="section-head panel-head"><div><span className="eyebrow">LANÇAMENTOS RECENTES</span><h2>Extrato recente</h2><p>{monthLabel(month)} · despesas, entradas e compras no cartão</p></div><button className="button button-text" onClick={() => setPage('movements')}>Extrato completo<Icon name="arrow" size={16}/></button></div><ItemList rows={data.details.slice(0, 8)} viewer={viewer} onEdit={onEdit} onDelete={onDelete}/>{data.details.length > 8 && <button className="button button-show-more" onClick={() => setPage('movements')}>Ver todos os lançamentos <Icon name="arrow" size={16}/></button>}</section>
      <aside className="insight-column">
        {data.cards.filter(card => card.active !== false).map(card => <section className="invoice-card" key={card.id}><div className="invoice-card-head"><Icon name="card"/><span>FATURA DO CARTÃO</span><button className="invoice-more" aria-label="Ver faturas do cartão" onClick={() => setPage('cards')}>···</button></div><strong>{card.name}</strong><span className="invoice-total">{money(Math.max(0, card.invoiceCents - card.paidCents), true)}</span><span className="invoice-sub">Fecha dia {card.closingDay} · vence dia {card.dueDay}</span><div className="invoice-bar"><i style={{ width: String(card.limitCents ? Math.min(100, card.invoiceCents / card.limitCents * 100) : 0) + '%' }}/></div><div className="invoice-foot"><span>{money(card.paidCents, true)} pagos</span><span>Limite {money(card.limitCents)}</span></div>{data.cardAlerts.find(alert => alert.cardId === card.id) && <p className="invoice-alert"><Icon name="bell" size={15}/>{data.cardAlerts.find(alert => alert.cardId === card.id).message}</p>}{!viewer && card.invoiceCents > card.paidCents && <button className="button button-light" onClick={() => onSettleCard(card)}>Registrar pagamento da fatura</button>}</section>)}
        {!data.cards.some(card => card.active !== false) && <section className="surface invoice-empty"><span className="eyebrow">CARTÕES</span><strong>Nenhuma fatura cadastrada</strong><button className="button button-text" onClick={() => setPage('cards')}>Configurar cartão<Icon name="arrow" size={15}/></button></section>}
        <section className="surface income-card"><span className="eyebrow">ENTRADAS DO MÊS</span><strong>{money(data.totals.incomeCents)}</strong><p>{money(data.totals.paidIncomeCents)} já recebidos · {data.incomeSources.length} recebimentos programados</p><button className="button button-text" onClick={() => setPage('planning')}>Acompanhar recebimentos<Icon name="arrow" size={16}/></button></section>
        <section className="surface category-card"><div className="section-head"><div><span className="eyebrow">SEUS HÁBITOS</span><h3>Para onde vai mais</h3></div></div>{topCategories.length ? topCategories.map(item => <div className="category-progress" key={item.name}><div><span>{item.name}</span><strong>{money(item.amountCents, item.type !== 'income')}</strong></div><span className="progress-track"><i style={{ width: String(Math.max(4, item.amountCents / topAmount * 100)) + '%' }}/></span></div>) : <p className="muted">As categorias aparecem conforme as despesas forem registradas.</p>}<button className="button button-text" onClick={() => setPage('reports')}>Abrir relatórios<Icon name="arrow" size={16}/></button></section>
      </aside>
    </div>
  </>;
}

function ReportsPage({ data, month, onMonthChange, setPage }) {
  return <><header className="page-title"><div><span className="eyebrow">LEITURA DO SEU HISTÓRICO</span><h1>Relatórios</h1><p>Compare despesas por mês e veja como cada categoria participa do total.</p></div></header><MonthRail data={data} month={month} onChange={onMonthChange}/><div className="dashboard-analytics-grid"><ExpenseTrends history={data.spendingHistory}/><ExpenseCategories categories={data.categoryTotals} onOpen={() => setPage('movements')}/></div><CashflowForecast data={data} month={month}/></>;
}

function MovementHistory({ data, month, onMonthChange, token, viewer, onOpenForm, onEdit, onDelete, onRestore, onReset, onReceipt, onToast, search, setSearch }) {
  const [contextFilter, setContextFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  useEffect(() => { setCategoryFilter('all'); }, [month]);
  const [showTrash, setShowTrash] = useState(false);
  const categories = [...new Set(data.details.filter(row => row.type === 'expense').map(row => row.category || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const rows = data.details.filter(row => (row.description + ' ' + (row.category || '') + ' ' + (row.cardName || '') + ' ' + (row.accountName || '')).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (typeFilter === 'all' || row.type === typeFilter) && (statusFilter === 'all' || (row.projected ? 'planned' : row.status) === statusFilter) && (categoryFilter === 'all' || (row.category || 'Outros') === categoryFilter) && (contextFilter === 'all' || row.type === 'expense' && (contextFilter === 'unclassified' ? !row.spendingContext : row.spendingContext === contextFilter)));
  return <><header className="page-title"><div><span className="eyebrow">HISTÓRICO ORGANIZADO</span><h1>Transações</h1><p>Cada lançamento, com data, categoria e situação atualizada.</p></div><div className="title-actions"><button className="button button-quiet" onClick={async () => { try { const result = await api('/finance/export?month=' + month, { token }); await saveLocalFile('xitolinos-' + month + '.txt', result.text, 'text/plain;charset=utf-8'); } catch (error) { onToast(error.message); } }}><Icon name="download"/>Exportar para compartilhar</button>{!viewer && <button className="button button-primary" onClick={() => onOpenForm('movement-choice')}><Icon name="plus"/>Adicionar movimentação</button>}</div></header><MonthRail data={data} month={month} onChange={onMonthChange}/><div className="history-toolbar"><button className="button button-quiet" onClick={() => setShowTrash(!showTrash)}>{showTrash ? 'Voltar ao histórico' : 'Lixeira (' + (data.trash || []).length + ')'}</button>{!viewer && !showTrash && <button className="button button-quiet" onClick={onReset}>Resetar lançamentos</button>}</div><section className="surface history-extra"><div className="section-head"><div><span className="eyebrow">DESPESAS E ENTRADAS</span><h2>{monthLabel(month)}</h2><p>{showTrash ? (data.trash || []).length : rows.length} registros no período</p></div>{!showTrash && <div className="history-filters"><label>Tipo de despesa<select aria-label="Filtrar despesas por rotina" value={contextFilter} onChange={event => setContextFilter(event.target.value)}><option value="all">Todas as despesas</option><option value="routine">Rotina mensal</option><option value="extra">Fora da rotina</option><option value="unclassified">Sem classificação</option></select></label><label>Movimentação<select aria-label="Filtrar tipo de movimentação" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">Todos os tipos</option><option value="expense">Despesas</option><option value="income">Recebimentos</option><option value="transfer">Transferências</option></select></label><label>Situação<select aria-label="Filtrar por situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todas</option><option value="paid">Pago</option><option value="pending">Em aberto</option><option value="planned">Previsto</option></select></label><label>Categoria<select aria-label="Filtrar por categoria" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">Todas</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label className="search-box"><Icon name="search"/><input id="history-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Descrição, categoria ou cartão"/></label></div>}</div>{showTrash ? ((data.trash || []).length ? <div className="transaction-list">{data.trash.map(row => <article className="transaction-row" key={row.id}><span className="transaction-icon"><Icon name="trash" size={18}/></span><span className="transaction-main"><strong>{row.description}</strong><small>Removido · {dateLabel(row.date)}</small></span><strong className="transaction-value">{money(row.amountCents, row.type !== 'income')}</strong>{!viewer && <button className="button button-small" onClick={() => onRestore(row)}>Restaurar</button>}</article>)}</div> : <div className="empty-state"><strong>Lixeira vazia</strong><p>Os lançamentos removidos aparecerão aqui para restauração.</p></div>) : <ItemList rows={rows} viewer={viewer} onEdit={onEdit} onDelete={onDelete} onReceipt={onReceipt}/>}</section></>;
}

function CashflowPage({ data, month, onMonthChange, setPage }) {
  return <><header className="page-title"><div><span className="eyebrow">SALDO CONFIRMADO E PREVISTO</span><h1>Fluxo de caixa</h1><p>Acompanhe como as entradas e despesas mudam seu saldo nos próximos meses.</p></div></header><MonthRail data={data} month={month} onChange={onMonthChange}/><section className="summary-grid" aria-label="Resumo do fluxo de caixa"><SummaryCard icon="wallet" label="Saldo disponível" value={data.currentCashCents} detail="Saldo confirmado nas suas contas" kind="balance-card" onClick={() => setPage('flow')}/><SummaryCard icon="movements" label="Saldo projetado" value={data.totals.projectedEndBalanceCents} detail={`Ao final de ${monthLabel(month)}`} kind={data.totals.projectedEndBalanceCents < 0 ? 'attention' : 'balance-card'} onClick={() => setPage('flow')}/><SummaryCard icon="card" label="Despesas previstas" value={data.totals.expenseCents} detail={`${money(data.totals.paidExpenseCents, true)} já contabilizados`} onClick={() => setPage('movements')}/></section><div className="cashflow-page-grid"><CashflowForecast data={data} month={month}/><FinanceAgenda data={data} month={month} setPage={() => setPage('calendar')}/></div>{data.totals.coverageNeededCents > 0 && <section className="coverage-banner"><span className="coverage-spark">!</span><div><strong>Há despesas sem cobertura suficiente</strong><p>Considere suas entradas e reservas antes de assumir novos compromissos.</p></div><button className="button button-light" onClick={() => setPage('reserve')}>Ver reservas<Icon name="arrow"/></button></section>}</>;
}

function CalendarPage({ data, month, onMonthChange, viewer, onOpenForm, onEdit }) {
  const firstDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const [selectedDay, setSelectedDay] = useState(`${month}-01`);
  useEffect(() => { setSelectedDay(`${month}-01`); }, [month]);
  const invoices = data.cards.filter(card => card.active !== false && card.invoiceCents > card.paidCents).map(card => {
    const dueDate = `${month}-${String(Math.min(Number(card.dueDay), days)).padStart(2, '0')}`;
    return { id: `card-${card.id}-${month}`, dueDate, date: dueDate, description: `Fatura do ${card.name}`, amountCents: card.invoiceCents - card.paidCents, type: 'card', method: 'card', category: 'Fatura do cartão', status: 'planned', projected: true };
  });
  const entries = [...data.details.filter(row => (row.dueDate || row.date || '').startsWith(month)), ...invoices];
  const forDay = entries.filter(row => (row.dueDate || row.date) === selectedDay).sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  const dailyCounts = entries.reduce((counts, row) => { const day = (row.dueDate || row.date).slice(-2); counts[day] = (counts[day] || 0) + 1; return counts; }, {});
  return <><header className="page-title"><div><span className="eyebrow">DATAS IMPORTANTES</span><h1>Calendário financeiro</h1><p>Veja quando vencimentos e recebimentos alteram seu mês.</p></div>{!viewer && <button className="button button-primary" onClick={() => onOpenForm('movement-choice', selectedDay)}><Icon name="plus"/>{'Adicionar movimenta\u00E7\u00E3o'}</button>}</header><MonthRail data={data} month={month} onChange={onMonthChange}/><div className="calendar-layout"><section className="surface calendar-panel" aria-label={`Calendário de ${monthLabel(month)}`}><div className="calendar-weekdays" aria-hidden="true">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days" role="group" aria-label={`Dias de ${monthLabel(month)}`}>{Array.from({ length: firstDay }, (_, index) => <span aria-hidden="true" className="calendar-blank" key={`blank-${index}`}/>)}{Array.from({ length: days }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, '0')}`; const count = dailyCounts[date.slice(-2)] || 0; return <button aria-label={count > 0 ? `${index + 1} de ${monthLabel(month)}, ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}` : `${index + 1} de ${monthLabel(month)}`} aria-pressed={selectedDay === date} className={`calendar-day ${count ? 'has-entry' : ''}`} key={date} onClick={() => setSelectedDay(date)}><span>{index + 1}</span>{count > 0 && <i aria-label={`${count} lançamentos`}/>}</button>; })}</div></section><section className="surface calendar-day-panel"><div className="section-head"><div><span className="eyebrow">COMPROMISSOS DO DIA</span><h2>{dateLabel(selectedDay)}</h2><p>{forDay.length} {forDay.length === 1 ? 'item' : 'itens'} planejados</p></div></div>{forDay.length ? <div className="agenda-list">{forDay.map(row => <button type="button" className="agenda-row calendar-edit-row" key={row.id} disabled={viewer || row.projected} title={row.projected ? "Este compromisso é uma previsão" : "Editar movimentação"} onClick={() => onEdit(row)}><span className={`agenda-date ${row.type === 'income' ? 'income-date' : ''}`}><Icon name={row.type === 'income' ? 'arrow' : row.method === 'card' ? 'card' : 'wallet'} size={16}/></span><span className="agenda-label"><strong>{row.description}</strong><small>{row.projected ? 'Previsto' : row.status === 'paid' ? 'Pago' : 'Em aberto'} · {row.category || 'Movimentação'}</small></span><strong className={`agenda-amount ${row.type === 'income' ? 'income-green' : ''}`}>{row.type === 'income' ? '+ ' : ''}{money(row.amountCents, row.type !== 'income')}</strong></button>)}</div> : <div className="agenda-empty">Nenhum lançamento previsto para esta data.</div>}</section></div></>;
}

function CardsPage({ data, month, onMonthChange, viewer, onSettleCard, onOpenForm, onEdit }) {
  return <><header className="page-title"><div><span className="eyebrow">CONTROLE DE FATURAS</span><h1>Cartões e faturas</h1><p>Confira compras, limite utilizado, fechamento e vencimento.</p></div>{!viewer && <button className="button button-primary" onClick={() => onOpenForm('card')}><Icon name="plus"/>Adicionar cartão</button>}</header><MonthRail data={data} month={month} onChange={onMonthChange}/><div className="cards-page-grid">{data.cards.filter(card => card.active !== false).map(card => { const remaining = Math.max(0, card.invoiceCents - card.paidCents); return <section className="surface card-page-item" key={card.id}><div className="card-page-head"><span className="summary-icon"><Icon name="card"/></span><span><span className="eyebrow">FATURA DE {monthLabel(month).toLocaleUpperCase('pt-BR')}</span><h2>{card.name}{card.lastFour ? ` ···· ${card.lastFour}` : ''}</h2></span></div><strong className="card-page-total">{money(remaining, true)} <small>em aberto</small></strong><div className="invoice-bar"><i style={{ width: `${card.limitCents ? Math.min(100, card.invoiceCents / card.limitCents * 100) : 0}%` }}/></div><div className="invoice-foot"><span>Fecha dia {card.closingDay} · vence dia {card.dueDay}</span><span>{card.limitCents ? `Limite ${money(card.limitCents)}` : 'Limite não informado'}</span></div>{card.lineItems.length ? <div className="card-purchases">{card.lineItems.slice(0, 5).map(row => <div className="card-purchase-row" key={row.id}><span><strong>{row.description}</strong><small>{dateLabel(row.dueDate || row.date)} · {row.status === 'paid' ? 'Pago' : row.projected ? 'Previsto' : 'Em aberto'}</small></span><strong>{money(row.amountCents, row.type !== 'income')}</strong></div>)}</div> : <p className="muted">Nenhuma compra lançada nesta fatura.</p>}{!viewer && <button className="button button-quiet" onClick={() => onEdit(card)}>Editar cartão</button>}{!viewer && remaining > 0 && <button className="button button-primary" onClick={() => onSettleCard(card)}>Registrar pagamento de {money(remaining, true)}</button>}</section>; })}{!data.cards.some(card => card.active !== false) && <section className="surface empty-state"><strong>Nenhum cartão cadastrado</strong><p>Cadastre um cartão para acompanhar faturas e compras parceladas.</p></section>}</div></>;
}

function Planning({ data, viewer, onOpenForm, onAction, onReceive, onEdit }) {
  return <><header className="page-title"><div><span className="eyebrow">PREVISIBILIDADE</span><h1>Planejamento</h1><p>Despesas fixas e entradas programadas, lado a lado.</p></div><div className="title-actions">{!viewer && <><button className="button button-quiet" onClick={() => onOpenForm('income')}><Icon name="plus"/>Programar entrada</button><button className="button button-primary" onClick={() => onOpenForm('recurrence')}><Icon name="plus"/>Despesa fixa</button></>}</div></header><div className="planning-grid"><section className="surface planning-list"><div className="section-head"><div><span className="eyebrow">TODO MÊS</span><h2>Despesas recorrentes</h2><p>Fixas e personalizadas</p></div></div>{data.recurrences.map(item => <article className="schedule-row" key={item.id}><span className="schedule-date">{String(item.dayOfMonth).padStart(2, '0')}</span><span><strong>{item.name}</strong><small>{item.category?.name || item.categoryName || 'Despesa fixa'} · {item.frequency === 'monthly' ? 'Todo mês' : item.frequency}</small></span><strong className="schedule-amount">{money(item.amountCents, item.type !== 'income')}</strong>{!viewer && <><button className="button button-small" onClick={() => onEdit('recurrence', item)}>Editar</button><button className="button button-small" onClick={() => onAction(`/finance/recurrences/${item.id}`, { active: !item.active }, item.active ? 'Despesa fixa pausada.' : 'Despesa fixa reativada.', 'PUT')}>{item.active ? 'Pausar' : 'Reativar'}</button><button className="button button-small" onClick={() => onAction(`/finance/recurrences/${item.id}/complete`, { date: todayDateString() }, `${item.name} foi contabilizada.`)}>Marcar paga</button></>}</article>)}{!data.recurrences.length && <div className="empty-state"><strong>Nenhuma despesa fixa programada</strong><p>Adicione seguro, garagem, celular ou qualquer compromisso recorrente.</p></div>}</section><section className="surface planning-list"><div className="section-head"><div><span className="eyebrow">A RECEBER</span><h2>Entradas programadas</h2><p>Datas para acompanhar e cobrar</p></div></div>{data.incomeSources.map(item => <article className="schedule-row" key={item.id}><span className="schedule-date schedule-date-income">{dateLabel(item.nextDate).split(' ')[0]}</span><span><strong>{item.name}</strong><small>{dateLabel(item.nextDate)} · {item.frequency === 'monthly' ? 'Todo mês' : item.frequency === 'once' ? 'Recebimento único' : item.frequency}</small></span><strong className="schedule-amount income-green">{money(item.amountCents)}</strong>{!viewer && <><button className="button button-small" onClick={() => onEdit('income', item)}>Editar</button><button className="button button-small" onClick={() => onAction(`/finance/incomes/${item.id}`, { active: !item.active }, item.active ? 'Recebimento pausado.' : 'Recebimento reativado.', 'PUT')}>{item.active ? 'Pausar' : 'Reativar'}</button>{item.active && <button className="button button-small" onClick={() => onReceive(item)}>Recebi</button>}</>}</article>)}{!data.incomeSources.length && <div className="empty-state"><strong>Nenhuma entrada programada</strong><p>Cadastre renda fixa ou pagamentos que ainda estão por receber.</p></div>}</section></div><section className="surface invoice-details"><div className="section-head"><div><span className="eyebrow">CICLO DO CARTÃO</span><h2>Faturas por mês</h2></div></div>{data.cards.map(card => <div className="card-invoice-detail" key={card.id}><strong>{card.name}</strong><span>Fecha dia {card.closingDay} · vencimento dia {card.dueDay}</span><strong>{money(card.invoiceCents, true)}</strong><span>{card.lineItems.length} compras consideradas</span></div>)}</section></>;
}

function Reserves({ data, viewer, onMove, onOpenForm }) {
  return <><header className="page-title"><div><span className="eyebrow">FUTURO COM TRANQUILIDADE</span><h1>Reservas e investimentos</h1><p>Veja seus saldos, metas de reserva e rendimento configurado.</p></div>{!viewer && <button className="button button-primary" onClick={() => onOpenForm('reserve')}><Icon name="plus"/>Adicionar reserva</button>}</header><div className="reserve-grid">{data.reserves.map(item => <article className={`surface reserve-tile ${item.kind}`} key={item.id}><span className="reserve-symbol"><Icon name={item.kind === 'emergency' ? 'reserve' : 'wallet'} size={22}/></span><span className="eyebrow">{item.kind === 'emergency' ? 'PROTEÇÃO' : item.kind === 'savings' ? 'PLANOS' : 'PATRIMÔNIO'}</span><h2>{item.name}</h2><strong className="reserve-amount">{money(item.balanceCents)}</strong>{item.targetCents > 0 && <><div className="reserve-progress"><i style={{ width: `${Math.min(100, item.balanceCents / item.targetCents * 100)}%` }}/></div><div className="reserve-target"><span>Meta {money(item.targetCents)}</span><span>{Math.min(100, Math.round(item.balanceCents / item.targetCents * 100))}%</span></div></>}<p>{item.annualYieldBasisPoints ? `Rendimento anual configurado: ${(item.annualYieldBasisPoints / 100).toLocaleString('pt-BR')}%` : item.kind === 'emergency' ? 'Reserva para imprevistos e meses de menor entrada.' : 'Rendimento definido nas configurações desta reserva.'}</p>{!viewer && <div className="reserve-actions"><button className="button button-primary" onClick={() => onMove(item, 'deposit')}>Guardar valor</button><button className="button button-quiet" onClick={() => onMove(item, 'withdraw')}>Retirar valor</button></div>}</article>)}</div><section className="surface reserve-hint"><span className="reserve-symbol"><Icon name="ask"/></span><div><strong>Quando usar a reserva?</strong><p>Se uma despesa passar das entradas previstas, confira o valor necessário primeiro. A retirada atualiza seu saldo, registra a transferência e fica no histórico.</p></div></section></>;
}

function Goals({ data, viewer, onOpenForm }) {
  return <><header className="page-title"><div><span className="eyebrow">NO SEU TEMPO</span><h1>Metas financeiras</h1><p>Transforme planos em marcos que você consegue acompanhar.</p></div>{!viewer && <button className="button button-primary" onClick={() => onOpenForm('goal')}><Icon name="plus"/>Criar meta</button>}</header><div className="goals-grid">{data.goals.map(item => <article className="surface goal-tile" key={item.id}><span className="goal-icon"><Icon name="goals"/></span><span className="eyebrow">META PESSOAL</span><h2>{item.name}</h2><strong>{money(item.savedCents)} <small>de {money(item.targetCents)}</small></strong><div className="goal-progress"><i style={{ width: `${Math.min(100, item.savedCents / item.targetCents * 100)}%` }}/></div><span className="goal-percent">{Math.min(100, Math.round(item.savedCents / item.targetCents * 100))}% alcançado {item.dueDate && `· até ${dateLabel(item.dueDate)}`}</span></article>)}{!data.goals.length && <div className="surface empty-state"><strong>Seus planos começam por aqui</strong><p>Crie uma meta para acompanhar seus próximos objetivos.</p></div>}</div><section className="surface account-summary"><div><span className="eyebrow">CONTAS CONECTADAS AO SEU PLANO</span><h2>Seus saldos de referência</h2></div>{data.accounts.map(item => <div className="account-row" key={item.id}><span className="account-avatar"><Icon name="wallet"/></span><span><strong>{item.name}</strong><small>{item.institution || item.type}</small></span><strong>{money(item.openingBalanceCents)}</strong></div>)}</section></>;
}

function ImportPage({ token, viewer, onRefresh, onToast }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [review, setReview] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function importFile(file) {
    if (!file) return;
    setBusy(true); setError(''); setFileName(file.name);
    try {
      const parsedRows = await parseStatement(file);
      const result = await api('/finance/import/rows', { token, method: 'POST', body: JSON.stringify({ fileName: file.name, rows: parsedRows }) });
      setRows(result.added || []); setReview(result.review || []); setBatchId(result.batchId);
      onRefresh();
      onToast(`${result.added.length} lançamentos adicionados · ${result.duplicates.length} duplicados ignorados`);
    } catch (reason) { setError(reason.message || 'Não foi possível ler esse arquivo.'); }
    finally { setBusy(false); }
  }
  async function confirmSelected() {
    setBusy(true); setError('');
    try {
      const result = await api('/finance/import/confirm', { token, method: 'POST', body: JSON.stringify({ batchId, rows: review.filter((_, index) => document.getElementById(`import-${index}`)?.checked) }) });
      setRows([...rows, ...result.items]); setReview([]); await onRefresh(); onToast(`${result.count} lançamentos selecionados foram adicionados.`);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <><header className="page-title"><div><span className="eyebrow">SEU HISTÓRICO CONTINUA SEU</span><h1>Importar extrato</h1><p>PDF, CSV ou JSON. Confira duplicados e valide os lançamentos antigos antes de adicionar.</p></div></header><section className="surface import-drop"><span className="import-icon"><Icon name="import" size={28}/></span><h2>Traga seu extrato para cá</h2><p>O arquivo é lido no próprio dispositivo e comparado com seu histórico salvo localmente.</p>{!viewer && <label className="button button-primary file-button"><Icon name="file"/>{busy ? 'Lendo extrato…' : 'Selecionar arquivo'}<input type="file" accept=".pdf,.csv,.txt,.json,.png,.jpg,.jpeg,.webp,text/plain,text/csv,application/pdf,application/json,image/*" disabled={busy} onChange={event => importFile(event.target.files?.[0])}/></label>}<small>OCR local para imagens e PDFs digitalizados ainda não está disponível.</small><small>O processamento não envia documentos a serviços externos.</small>{fileName && <span className="file-selected"><Icon name="check" size={16}/>{fileName}</span>}{error && <p className="form-error" role="alert">{error}</p>}</section>{review.length > 0 && <section className="surface import-review"><div className="section-head"><div><span className="eyebrow">VALIDAÇÃO NECESSÁRIA</span><h2>Itens anteriores ao último lançamento</h2><p>Confira e marque apenas os itens que não existem no seu histórico.</p></div><button className="button button-primary" onClick={confirmSelected} disabled={busy}>Adicionar selecionados</button></div>{review.map((row, index) => <label className="import-review-row" key={`${row.date}-${row.description}-${index}`}><input id={`import-${index}`} type="checkbox"/><span><strong>{row.description}</strong><small>{dateLabel(row.date)} · {row.type === 'income' ? 'Entrada' : 'Despesa'}</small></span><strong>{money(row.amountCents, row.type !== 'income')}</strong></label>)}</section>}{rows.length > 0 && <section className="surface import-review"><div className="section-head"><div><span className="eyebrow">ADICIONADOS AO SEU HISTÓRICO</span><h2>{rows.length} lançamentos novos</h2></div></div>{rows.map((row, index) => <div className="import-review-row" key={`${row.id}-${index}`}><Icon name="check"/><span><strong>{row.description}</strong><small>{dateLabel(row.date)}</small></span><strong>{money(row.amountCents, row.type !== 'income')}</strong></div>)}</section>}<section className="surface import-guide"><span className="eyebrow">COMO A CONFERÊNCIA FUNCIONA</span><div className="guide-steps"><p><strong>1</strong><span>Data, valor e descrição são comparados com os registros existentes.</span></p><p><strong>2</strong><span>Duplicados são ignorados para não contar a despesa duas vezes.</span></p><p><strong>3</strong><span>Itens depois da data mais recente entram direto; itens mais antigos pedem sua revisão.</span></p></div><details><summary>Também pode colar texto da fatura</summary><textarea aria-label="Texto do extrato" rows="5" placeholder="Ex.: 09/09 Drogasil 34,90" onChange={event => setRows(parseStatementText(event.target.value))}/></details></section></>;
}

const shoppingCatalog = [
  ['Mercearia', 'Arroz'], ['Mercearia', 'Feij\u00E3o'], ['Mercearia', 'Macarr\u00E3o'], ['Mercearia', 'Farinha de trigo'], ['Mercearia', 'A\u00E7\u00FAcar'], ['Mercearia', 'Sal'], ['Mercearia', '\u00D3leo de cozinha'], ['Mercearia', 'Caf\u00E9'],
  ['Latic\u00EDnios e ovos', 'Leite'], ['Latic\u00EDnios e ovos', 'Ovos'], ['Latic\u00EDnios e ovos', 'Manteiga'], ['Latic\u00EDnios e ovos', 'Queijo'], ['Padaria', 'P\u00E3o'],
  ['A\u00E7ougue', 'Frango'], ['A\u00E7ougue', 'Carne'], ['Peixaria', 'Peixe'], ['Hortifruti', 'Batata'], ['Hortifruti', 'Tomate'], ['Hortifruti', 'Cebola'], ['Hortifruti', 'Alho'], ['Hortifruti', 'Alface'], ['Hortifruti', 'Banana'], ['Hortifruti', 'Ma\u00E7\u00E3'], ['Hortifruti', 'Laranja'],
  ['Limpeza', 'Detergente'], ['Limpeza', 'Sab\u00E3o em p\u00F3'], ['Limpeza', 'Desinfetante'], ['Limpeza', '\u00C1gua sanit\u00E1ria'], ['Limpeza', 'Esponja'], ['Limpeza', 'Saco de lixo'], ['Higiene', 'Papel higi\u00EAnico'], ['Higiene', 'Creme dental'], ['Higiene', 'Sabonete'], ['Higiene', 'Shampoo'], ['Higiene', 'Condicionador'], ['Higiene', 'Desodorante'],
  ['Medicamentos', 'Analg\u00E9sico'], ['Medicamentos', 'Antit\u00E9rmico'], ['Medicamentos', 'Antial\u00E9rgico'], ['Medicamentos', 'Soro fisiol\u00F3gico'], ['Medicamentos', 'Curativo adesivo'], ['Cuidados pessoais', 'Protetor solar'], ['Cuidados pessoais', '\u00C1lcool em gel'], ['Cuidados pessoais', 'Gaze'], ['Cuidados pessoais', 'Algod\u00E3o'], ['Cuidados pessoais', 'Sabonete l\u00EDquido']
];
const itemId = () => globalThis.crypto?.randomUUID?.() || `item_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const unitOptions = [['un', 'un.'], ['kg', 'kg'], ['g', 'g'], ['l', 'L'], ['ml', 'ml'], ['pack', 'pacote']];
const shoppingStatuses = [['planned', 'Na lista'], ['purchased', 'Comprado'], ['not-found', 'Não encontrado'], ['buy-elsewhere', 'Comprar em outro lugar'], ['postponed', 'Adiado']];
const formatCentsInput = cents => (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
const optionalCents = value => String(value ?? '').trim() ? amountCents(value) : 0;
function MoneyInput({ cents, onChange, onError, allowEmpty = false, ...props }) {
  const formatted = () => allowEmpty && !cents ? '' : formatCentsInput(cents);
  const [draft, setDraft] = useState(formatted);
  useEffect(() => { setDraft(formatted()); }, [cents, allowEmpty]);
  return <input {...props} inputMode="numeric" value={draft} onChange={event => setDraft(formatMoneyEntry(event.target.value))} onBlur={() => {
    if (allowEmpty && !draft.trim()) { if (Number(cents || 0) !== 0) onChange(0); setDraft(''); return; }
    try { const next = amountCents(draft); onChange(next); setDraft(formatCentsInput(next)); }
    catch (error) { onError?.(error.message); setDraft(formatted()); }
  }}/>;
}
const parseQuantityMilli = value => Math.round(Number(String(value || '1').replace(',', '.')) * 1000);
function ShoppingPage({ token, data, month, onMonthChange, onToast, onRefresh, viewer, shoppingOnly = false }) {
  const [board, setBoard] = useState({ lists: [], stock: [] });
  const [kind, setKind] = useState('market');
  const [selectedListId, setSelectedListId] = useState('');
  const [newName, setNewName] = useState('');
  const [newSection, setNewSection] = useState('Outros');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newUnit, setNewUnit] = useState('un');
  const [newPrice, setNewPrice] = useState('');
  const [stockName, setStockName] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingCsv, setPendingCsv] = useState(null);
  const [accountImport, setAccountImport] = useState(false);
  const [accountCategory, setAccountCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayDateString());
  const [showHistoryPrices, setShowHistoryPrices] = useState(true);
  useEffect(() => { api('/finance/shopping', { token }).then(result => setBoard({ lists: result.lists || [], stock: result.stock || [] })).catch(error => onToast(error.message)); }, [token]);
  useEffect(() => { const today = todayDateString(); const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(); setPurchaseDate(month === today.slice(0, 7) ? today : `${month}-${String(Math.min(Number(today.slice(8, 10)), monthEnd)).padStart(2, '0')}`); }, [month]);
  useEffect(() => { setAccountId(data.accounts?.[0]?.id ? String(data.accounts[0].id) : ''); setAccountCategory(String(data.categories?.find(item => item.type === 'expense')?.id || '')); }, [data.accounts, data.categories]);
  const listsInPeriod = board.lists.filter(list => list.month === month && list.kind === kind);
  const currentList = listsInPeriod.find(list => list.id === selectedListId) || listsInPeriod[0];
  useEffect(() => { if (!listsInPeriod.some(list => list.id === selectedListId)) setSelectedListId(listsInPeriod[0]?.id || ''); }, [month, kind, board.lists, selectedListId]);
  const priorLists = board.lists.filter(list => list.month < month && list.kind === kind).sort((a, b) => b.month.localeCompare(a.month));
  const previousPriceFor = item => priorLists.flatMap(list => list.items.map(row => ({ ...row, month: list.month })))
    .find(row => row.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR') && row.unit === item.unit && row.status === 'purchased' && row.paidCents > 0);
  const sortedItems = [...(currentList?.items || [])].sort((a, b) => {
    const priority = { 'not-found': 0, 'buy-elsewhere': 1, postponed: 2, planned: 3, purchased: 4 };
    return priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, 'pt-BR');
  });
  const estimatedTotal = (currentList?.items || []).reduce((sum, item) => {
    const estimatedUnitCents = item.status === 'purchased' && item.paidCents > 0 ? item.paidCents : item.estimatedCents || previousPriceFor(item)?.paidCents || 0;
    return sum + Math.round(estimatedUnitCents * item.quantityMilli / 1000);
  }, 0);
  const payableTotal = (currentList?.items || []).filter(item => item.status === 'purchased' && item.paidCents > 0).reduce((sum, item) => sum + Math.round(item.paidCents * item.quantityMilli / 1000), 0);
  const hasHistoricalPrices = (currentList?.items || []).some(item => previousPriceFor(item));
  async function persist(next) {
    setBusy(true);
    try { const result = await api('/finance/shopping', { token, method: 'PUT', body: JSON.stringify(next) }); setBoard({ lists: result.lists || [], stock: result.stock || [] }); setDirty(false); return true; }
    catch (error) { onToast(error.message); return false; }
    finally { setBusy(false); }
  }
  async function createList() {
    const list = newList(kind, month, `${kind === 'market' ? 'Mercado' : kind === 'pharmacy' ? 'Farmácia' : 'Outras compras'} · Lista ${listsInPeriod.length + 1} · ${monthLabel(month)}`);
    const next = upsertList(board, list);
    if (await persist(next)) setSelectedListId(list.id);
  }
  function upsertList(base, list) {
    const index = base.lists.findIndex(item => item.id === list.id);
    return { ...base, lists: index < 0 ? [list, ...base.lists] : base.lists.map((item, at) => at === index ? list : item) };
  }
  function newList(listKind = kind, listMonth = month, listName = '') {
    return { id: itemId(), month: listMonth, kind: listKind, name: listName || `${{ market: 'Mercado', pharmacy: 'Farmácia', other: 'Outras compras' }[listKind]} · ${monthLabel(listMonth)}`, status: 'open', items: [] };
  }
  async function mutateItems(mutator) {
    if (viewer) return;
    let list = currentList;
    let base = board;
    if (!list) { list = newList(); base = upsertList(board, list); }
    if (list.financialTransactionId) { onToast('Esta lista já foi registrada no financeiro e não pode ser alterada.'); return; }
    const updated = { ...list, items: mutator([...list.items]) };
    setBoard(upsertList(base, updated)); setDirty(true);
  }
  async function addItem(name = newName, section = newSection) {
    if (!name.trim()) { onToast('Informe o nome do item.'); return; }
    const normalizedName = name.trim().toLocaleLowerCase('pt-BR');
    const previous = priorLists.flatMap(list => list.items).find(item => item.name.toLocaleLowerCase('pt-BR') === normalizedName && item.unit === 'un' && item.status === 'purchased' && item.paidCents > 0);
    await mutateItems(items => [...items, { id: itemId(), name: name.trim().slice(0, 100), section: section || 'Outros', quantityMilli: 1000, unit: 'un', estimatedCents: previous?.paidCents || 0, paidCents: 0, status: 'planned', addedToStock: false }]);
    setNewName('');
    setNewSection('Outros');
  }
  async function changeItem(id, patch) { await mutateItems(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); }
  async function addSuggestions() {
    const counts = new Map();
    for (const list of priorLists) for (const item of list.items) if (item.status === 'purchased') counts.set(item.name.toLocaleLowerCase('pt-BR'), (counts.get(item.name.toLocaleLowerCase('pt-BR')) || 0) + 1);
    const present = new Set((currentList?.items || []).map(item => item.name.toLocaleLowerCase('pt-BR')));
    const inStock = new Set(board.stock.filter(item => item.quantityMilli > 1000).map(item => item.name.toLocaleLowerCase('pt-BR')));
    const suggestions = [...counts].filter(([name, count]) => count >= 2 && !present.has(name) && !inStock.has(name)).map(([name]) => {
      const item = priorLists.flatMap(list => list.items).find(row => row.name.toLocaleLowerCase('pt-BR') === name);
      return { ...item, id: itemId(), quantityMilli: item.quantityMilli || 1000, estimatedCents: item.paidCents || item.estimatedCents || 0, paidCents: 0, status: 'planned', addedToStock: false };
    });
    if (!suggestions.length) { onToast('Ainda não há itens repetidos no histórico para sugerir.'); return; }
    await mutateItems(items => [...items, ...suggestions]);
  }
  async function saveStock(event) {
    event.preventDefault();
    if (!stockName.trim()) return;
    const next = { ...board, stock: [...board.stock, { id: itemId(), name: stockName.trim().slice(0, 100), section: newSection || 'Outros', quantityMilli: parseQuantityMilli(newQuantity), unit: newUnit }] };
    await persist(next); setStockName('');
  }
  async function addPurchasedToStock(item) {
    const existing = board.stock.find(row => row.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR') && row.unit === item.unit);
    const stock = existing ? board.stock.map(row => row.id === existing.id ? { ...row, quantityMilli: row.quantityMilli + item.quantityMilli } : row) : [...board.stock, { id: itemId(), name: item.name, section: item.section, quantityMilli: item.quantityMilli, unit: item.unit }];
    const updatedList = { ...currentList, items: currentList.items.map(row => row.id === item.id ? { ...row, addedToStock: true } : row) };
    await persist({ ...upsertList(board, updatedList), stock });
  }
  async function recordPurchase() {
    if (!currentList || currentList.financialTransactionId) return;
    if (dirty && !await persist(board)) return;
    if (!window.confirm(`Registrar ${money(payableTotal, true)} como despesa em ${monthLabel(month)}? Esta ação poderá ser feita uma única vez para esta lista.`)) return;
    setBusy(true);
    try { const result = await api('/finance/shopping/commit', { token, method: 'POST', body: JSON.stringify({ listId: currentList.id, month, date: purchaseDate, accountId: accountId || undefined, categoryId: accountCategory || undefined }) }); onToast(result.alreadyRecorded ? 'Esta lista já estava contabilizada.' : 'Compra registrada como despesa no financeiro.'); const boardResult = await api('/finance/shopping', { token }); setBoard({ lists: boardResult.lists || [], stock: boardResult.stock || [] }); await onRefresh(); }
    catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }
  async function acceptCsv() {
    if (!pendingCsv) return;
    if (accountImport && !pendingCsv.some(item => item.status === 'purchased' && item.paidCents > 0)) { onToast('Marque um item comprado e informe o preco pago para contabilizar.'); return; }
    const signature = JSON.stringify({ month, kind, items: pendingCsv });
    let hash = 14695981039346656037n;
    for (const byte of new TextEncoder().encode(signature)) hash = (hash ^ BigInt(byte)) * 1099511628211n & 0xffffffffffffffffn;
    const importId = 'csv_' + hash.toString(16).padStart(16, '0') + '_' + pendingCsv.length;
    const existing = board.lists.find(item => item.id === importId);
    if (existing) {
      setPendingCsv(null);
      setSelectedListId(existing.id);
      if (accountImport && !existing.financialTransactionId) {
        try { const recorded = await api('/finance/shopping/commit', { token, method: 'POST', body: JSON.stringify({ listId: existing.id, month, date: purchaseDate, accountId: accountId || undefined, categoryId: accountCategory || undefined }) }); const refreshed = await api('/finance/shopping', { token }); setBoard({ lists: refreshed.lists || [], stock: refreshed.stock || [] }); await onRefresh(); onToast(recorded.alreadyRecorded ? 'Importa\u00E7\u00E3o j\u00E1 contabilizada.' : 'CSV registrado no financeiro.'); } catch (error) { onToast(error.message); }
      } else onToast(existing.financialTransactionId ? 'Este CSV ja foi importado e contabilizado.' : 'Este CSV ja consta no historico; nenhum item foi duplicado.');
      return;
    }
    const list = { ...newList(kind, month, 'Importacao CSV'), id: importId };
    const updated = { ...list, items: pendingCsv.map(row => ({ ...row, id: itemId(), addedToStock: false })) };
    const next = upsertList(board, updated);
    setBusy(true);
    try {
      const result = await api('/finance/shopping', { token, method: 'PUT', body: JSON.stringify(next) });
      const saved = { lists: result.lists || [], stock: result.stock || [] }; setBoard(saved); setSelectedListId(updated.id); setDirty(false); setPendingCsv(null);
      if (accountImport) {
        const recorded = await api('/finance/shopping/commit', { token, method: 'POST', body: JSON.stringify({ listId: updated.id, month, date: purchaseDate, accountId: accountId || undefined, categoryId: accountCategory || undefined }) });
        const refreshed = await api('/finance/shopping', { token }); setBoard({ lists: refreshed.lists || [], stock: refreshed.stock || [] }); onToast(recorded.alreadyRecorded ? 'Esta lista já estava contabilizada.' : 'CSV importado e registrado no financeiro.');
      } else onToast('CSV importado somente para o histórico de compras.');
    } catch (error) { onToast(error.message); }
    finally { setBusy(false); }
  }
  function previewCsv(file) {
    if (!file) return;
    file.text().then(text => {
      const rows = parseLocalCsv(text);
      if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e ao menos um item.');
      const headers = rows[0].map(value => value.trim().toLocaleLowerCase('pt-BR'));
      const index = name => headers.indexOf(name.toLocaleLowerCase('pt-BR'));
      if (index('name') < 0) throw new Error('Este CSV não contém o cabeçalho name esperado.');
      const parsed = rows.slice(1).map(row => {
        const val = name => row[index(name)] || '';
        const paid = Number(val('paidCents')) || 0, estimated = Number(val('estimatedCents')) || 0;
        const status = shoppingStatuses.some(([value]) => value === val('status')) ? val('status') : 'planned';
        return { name: val('name').trim(), section: val('section').trim() || 'Outros', quantityMilli: parseQuantityMilli(val('quantity') || '1'), unit: unitOptions.some(([value]) => value === val('unit')) ? val('unit') : 'un', estimatedCents: estimated, paidCents: paid, status };
      }).filter(row => row.name);
      if (!parsed.length || parsed.some(row => !Number.isSafeInteger(row.quantityMilli) || row.quantityMilli < 1 || !Number.isSafeInteger(row.estimatedCents) || row.estimatedCents < 0 || !Number.isSafeInteger(row.paidCents) || row.paidCents < 0)) throw new Error('Revise nome, quantidade e valores do CSV.');
      setPendingCsv(parsed);
    }).catch(error => onToast(error.message));
  }
  function exportCsv() {
    if (!currentList) return;
    saveLocalFile(`xitolinos-compras-${month}-${kind}.csv`, `﻿${toShoppingCsv(currentList)}`, 'text/csv;charset=utf-8').catch(error => onToast(error.message));
  }
  return <><header className="page-title shopping-title"><div><span className="eyebrow">PLANEJAMENTO DO DIA A DIA</span><h1>Compras</h1>{shoppingOnly && <p className="shopping-scope-note">Conta de consulta: acesso somente à lista compartilhada.</p>}<p>Lista, previsão e histórico ficam salvos no perfil local.</p></div><label className="shopping-month">Mês<input aria-label="Mês da lista" type="month" value={month} onChange={event => onMonthChange(event.target.value)}/></label></header>
    <div className="shopping-tabs" role="group" aria-label="Tipo de lista">{[['market', 'Mercado'], ['pharmacy', 'Farmácia'], ['other', 'Outras compras']].map(([value, label]) => <button key={value} className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div>
    <section className="shopping-sticky-summary"><div><span className="eyebrow">PREVISÃO DE GASTO</span><strong>{money(estimatedTotal, true)}</strong><small>{currentList?.items.length || 0} itens · {monthLabel(month)} · {money(payableTotal, true)} pagos</small></div><div className="shopping-summary-actions">{hasHistoricalPrices && <button className="button button-quiet" aria-pressed={showHistoryPrices} onClick={() => setShowHistoryPrices(value => !value)}>{showHistoryPrices ? 'Ocultar preços anteriores' : 'Mostrar preços anteriores'}</button>}<label className="shopping-date-field">Data da compra<input type="date" min={`${month}-01`} max={`${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`} value={purchaseDate} onChange={event => setPurchaseDate(event.target.value)}/></label><button className="button button-quiet" disabled={!currentList} onClick={exportCsv}><Icon name="download"/>Exportar CSV</button>{!viewer && <>{dirty && <button className="button button-primary" disabled={busy} onClick={() => persist(board)}>Salvar lista</button>}<label className="button button-quiet shopping-file"><Icon name="import"/>Prévia CSV<input type="file" accept=".csv,text/csv" onChange={event => previewCsv(event.target.files?.[0])}/></label><button className="button button-primary" disabled={!currentList || !currentList.items.some(item => item.status === 'purchased' && item.paidCents > 0) || busy || dirty || Boolean(currentList?.financialTransactionId)} onClick={recordPurchase}>{currentList?.financialTransactionId ? 'Já contabilizada' : 'Registrar despesa'}</button></>}</div></section>
    {currentList?.financialTransactionId && <p className="shopping-lock-note">Esta lista já foi registrada no financeiro e está bloqueada para edição.</p>}
    {!viewer && <section className="surface shopping-add-panel"><div className="shopping-panel-heading"><div><span className="eyebrow">NOVA MOVIMENTAÇÃO DA LISTA</span><h2>Adicionar item</h2></div><button className="button button-text" onClick={addSuggestions}>Sugerir pelo histórico<Icon name="arrow" size={15}/></button></div><div className="shopping-add-grid"><label>Item<input list="shopping-catalog" value={newName} onChange={event => { const value = event.target.value; setNewName(value); const match = shoppingCatalog.find(([, name]) => name === value); if (match) setNewSection(match[0]); }} placeholder="Ex.: Arroz"/><datalist id="shopping-catalog">{shoppingCatalog.filter(([section]) => kind === 'market' ? !section.startsWith('Medicamentos') && !section.startsWith('Cuidados pessoais') : kind === 'pharmacy' ? section.startsWith('Medicamentos') || section.startsWith('Cuidados pessoais') : true).map(([section, name]) => <option key={name} value={name}>{section}</option>)}</datalist></label><button className="button button-primary" onClick={() => addItem()} disabled={busy}><Icon name="plus"/>Adicionar</button></div><small className="shopping-catalog-note">Catálogo genérico disponível neste aparelho. Itens sugeridos podem ser ajustados antes de salvar.</small></section>}
    {pendingCsv && <section className="surface shopping-csv-preview"><div><span className="eyebrow">REVISÃO LOCAL</span><h2>CSV: {pendingCsv.length} itens</h2><p>Esta importação cria uma lista separada para não misturar itens existentes.</p></div>{pendingCsv.slice(0, 5).map(item => <p key={`${item.name}-${item.id || ''}`}>{item.name} · {item.quantityMilli / 1000} {item.unit} · {money(item.paidCents || item.estimatedCents, true)}</p>)}{!viewer && <><label className="checkline"><input type="checkbox" checked={accountImport} onChange={event => setAccountImport(event.target.checked)}/><span><strong>Registrar também como despesa</strong><small>Desmarcado, o CSV fica somente no histórico de compras.</small></span></label>{accountImport && <div className="form-two"><label>Conta<select value={accountId} onChange={event => setAccountId(event.target.value)}>{data.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Categoria<select value={accountCategory} onChange={event => setAccountCategory(event.target.value)}>{data.categories.filter(item => item.type === 'expense').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}<button className="button button-primary" onClick={acceptCsv} disabled={busy}>Confirmar importação{accountImport ? ' e contabilizar' : ''}</button><button className="button button-quiet" onClick={() => setPendingCsv(null)}>Cancelar</button></>}</section>}
    <div className="shopping-layout"><section className="surface shopping-list-panel"><div className="section-head"><div><span className="eyebrow">{kind === 'market' ? 'MERCADO' : kind === 'pharmacy' ? 'FARMÁCIA' : 'OUTRAS COMPRAS'}</span><h2>{currentList?.name || 'Sua lista começa aqui'}</h2><p>{currentList ? `${currentList.items.length} itens salvos para ${monthLabel(month)}` : `Nenhuma lista de ${monthLabel(month)} ainda.`}</p></div><div className="shopping-list-controls"><select aria-label="Selecionar lista deste mês" value={currentList?.id || ''} onChange={event => setSelectedListId(event.target.value)}>{listsInPeriod.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select>{!viewer && <button className="button button-small" onClick={createList}>Nova lista</button>}</div></div>{sortedItems.length ? sortedItems.map(item => { const label = shoppingStatuses.find(([value]) => value === item.status)?.[1] || 'Na lista'; const previous = previousPriceFor(item); const delta = previous && item.paidCents ? item.paidCents - previous.paidCents : 0; const totalUnitCents = item.status === 'purchased' && item.paidCents > 0 ? item.paidCents : item.estimatedCents || previous?.paidCents || 0; return <article className={`shopping-item status-${item.status} ${previous && showHistoryPrices ? 'history-visible' : ''}`} key={item.id}><span className="shopping-item-state" aria-label={label} title={label}><Icon name={item.status === 'purchased' ? 'check' : item.status === 'planned' ? 'shopping' : 'bell'} size={17}/></span><div className="shopping-item-main"><strong>{item.name}</strong><small>{item.section}{previous && showHistoryPrices && item.paidCents ? ` · ${delta > 0 ? 'Subiu' : delta < 0 ? 'Caiu' : 'Igual'} vs. ${money(previous.paidCents, true)}` : ''}</small></div>{!viewer && !currentList?.financialTransactionId ? <><label className="shopping-item-field">Qtd.<input inputMode="decimal" value={item.quantityMilli / 1000} onChange={event => changeItem(item.id, { quantityMilli: parseQuantityMilli(event.target.value) })}/></label>{previous && showHistoryPrices && <span className="shopping-item-history-price"><small>Último valor</small><strong>{money(previous.paidCents, true)}</strong></span>}<label className="shopping-item-field">Preço pago<MoneyInput cents={item.paidCents} allowEmpty onChange={value => changeItem(item.id, { paidCents: value, status: value > 0 ? 'purchased' : item.status === 'purchased' ? 'planned' : item.status })} onError={onToast}/></label><span className="shopping-item-total"><small>Total</small><strong>{money(Math.round(totalUnitCents * item.quantityMilli / 1000), true)}</strong></span><details className="shopping-status-menu"><summary><span>Status</span><small>{label}</small></summary><select aria-label={`Situação de ${item.name}`} value={item.status} onChange={event => changeItem(item.id, { status: event.target.value })}>{shoppingStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></details>{item.status === 'purchased' && !item.addedToStock && <button className="row-action" title="Adicionar ao estoque de casa" aria-label={`Adicionar ${item.name} ao estoque de casa`} onClick={() => addPurchasedToStock(item)}>+</button>}</> : <strong className="shopping-readonly-price">{money(Math.round(totalUnitCents * item.quantityMilli / 1000), true)}</strong>}</article>; }) : <div className="empty-state"><span className="empty-icon"><Icon name="shopping" size={24}/></span><strong>Lista vazia por enquanto</strong><p>Escolha itens do catálogo, recupere sugestões do histórico ou digite um produto.</p></div>}</section>
      <aside className="shopping-aside"><section className="surface shopping-stock"><div className="section-head"><div><span className="eyebrow">O QUE JÁ TEM EM CASA</span><h2>Estoque doméstico</h2></div></div><form className="shopping-stock-form" onSubmit={saveStock}><input aria-label="Item que já tem em casa" value={stockName} onChange={event => setStockName(event.target.value)} placeholder="Ex.: Arroz"/><button className="button button-small" disabled={viewer || busy}>Adicionar</button></form>{board.stock.length ? board.stock.map(item => <div className="shopping-stock-row" key={item.id}><span>{item.name}<small>{item.quantityMilli / 1000} {item.unit} · {item.section}</small></span>{!viewer && <button className="row-delete" aria-label={`Remover ${item.name} do estoque`} onClick={() => persist({ ...board, stock: board.stock.filter(row => row.id !== item.id) })}>×</button>}</div>) : <p className="muted">Registre o que já tem para ajustar as próximas sugestões.</p>}</section>
        <section className="surface shopping-history"><div className="section-head"><div><span className="eyebrow">HISTÓRICO</span><h2>Compras anteriores</h2></div></div>{priorLists.length ? priorLists.slice(0, 8).map(list => <details className="shopping-history-list" key={list.id}><summary>{monthLabel(list.month)} · {list.name}<small>{list.items.filter(item => item.status === 'purchased').length} itens comprados</small></summary>{list.items.filter(item => item.status === 'purchased').map(item => <p key={item.id}>{item.name} <span>{money(item.paidCents, true)} / {item.unit}</span></p>)}</details>) : <p className="muted">O histórico aparecerá depois da primeira lista mensal.</p>}</section></aside></div>
    {busy && <p className="shopping-saving" role="status">Salvando lista neste perfil…</p>}
  </>;
}

function Advice({ token, data, onToast, mode = 'purchase' }) {
  const [decision, setDecision] = useState(null);
  const [amount, setAmount] = useState(mode === 'delivery' && data.deliveryRecommendation.maximumAmountCents ? (data.deliveryRecommendation.maximumAmountCents / 100).toFixed(2).replace('.', ',') : '');
  const [category, setCategory] = useState(mode === 'delivery' ? 'Alimentação' : 'Necessidade');
  const [urgency, setUrgency] = useState('normal');
  const [delivery, setDelivery] = useState(mode === 'delivery');
  const deliveryAmount = (() => { if (!amount.trim()) return money(0); try { return money(amountCents(amount)); } catch { return 'R$ ?'; } })();
  async function check(event) {
    event.preventDefault();
    try { setDecision(await api('/finance/decision', { token, method: 'POST', body: JSON.stringify({ amountCents: amountCents(amount), month: data.month, category, urgency }) })); }
    catch (error) { onToast(error.message); }
  }
  return <><header className="page-title"><div><span className="eyebrow">RESPOSTA BASEADA NO SEU ORÇAMENTO</span><h1>Posso fazer esse gasto?</h1><p>Uma checagem simples usando suas despesas, suas entradas e a margem que você configurou.</p></div></header><div className="advice-grid"><form className="surface advice-form" onSubmit={check}><label>Quanto você pretende gastar?<span className="currency-input"><b>R$</b><input inputMode="numeric" value={amount} onChange={event => setAmount(formatMoneyEntry(event.target.value))} placeholder="0,00" required/></span></label><label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}><option>Necessidade</option>{data.categories.filter(item => item.type === 'expense').map(item => <option key={item.id}>{item.name}</option>)}</select></label><label>Qual a urgência?<select value={urgency} onChange={event => setUrgency(event.target.value)}><option value="normal">Pode esperar</option><option value="high">Preciso comprar agora</option></select></label><button className="button button-primary button-wide">Analisar com meu mês<Icon name="arrow"/></button></form><section className={`surface advice-result ${decision ? decision.recommended ? 'advice-yes' : 'advice-no' : ''}`}>{decision ? <><span className="eyebrow">COM BASE NA PROJEÇÃO DE {monthLabel(decision.month).toLocaleUpperCase('pt-BR')}</span><div className="advice-answer">{decision.recommended ? 'Cabe no plano' : 'Melhor aguardar'}</div><p>{decision.message}</p><div className="advice-numbers"><span><small>Saldo projetado</small><strong>{money(decision.projectedAfterCents)}</strong></span><span><small>Necessário cobrir</small><strong>{money(decision.coverageNeededCents)}</strong></span></div><p className="advice-footnote">Limite recomendado para {category.toLocaleLowerCase('pt-BR')}: <strong>{money(decision.maximumRecommendedCents)}</strong>. Esse valor preserva a margem mínima configurada.</p></> : <><span className="advice-star"><Icon name="ask" size={26}/></span><h2>Sua decisão, com os números à vista.</h2><p>Conte o valor e a categoria. A resposta usa seu saldo projetado, as despesas previstas e a margem mínima das suas definições.</p><div className="advice-numbers"><span><small>Disponível agora</small><strong>{money(data.currentCashCents)}</strong></span><span><small>Depois das despesas</small><strong>{money(data.totals.projectedEndBalanceCents)}</strong></span></div></>}</section></div><section className="surface delivery-check"><div><span className="eyebrow">UM OLHAR PARA QUINTA-FEIRA</span><h2>Hoje é dia de pedir delivery?</h2><p>{data.deliverySpending?.length ? `No mês, alimentação soma ${money(data.deliverySpending.filter(item => item.name.toLocaleLowerCase('pt-BR').includes('aliment')).reduce((sum, item) => sum + item.amountCents, 0))}. A decisão abaixo usa o mesmo saldo disponível.` : 'Confira seu histórico de alimentação e o saldo do mês antes de decidir.'}</p></div><label className="toggle-line"><span>Incluir no plano uma refeição de <strong>{deliveryAmount}</strong></span><input type="checkbox" checked={delivery} onChange={event => setDelivery(event.target.checked)}/></label><strong className={`delivery-answer ${delivery && decision && !decision.recommended ? 'needs-care' : ''}`}>{delivery ? decision ? decision.recommended ? 'Cabe na projeção atual' : 'O saldo pede cautela' : 'Preencha um valor acima para conferir' : 'Veja seu orçamento antes de pedir'}</strong></section></>;
}

function CloseMonthModal({ data, month = data.month, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><span className="eyebrow">REVISÃO DO MÊS</span><h2 id="modal-title">Fechar {monthLabel(month)}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close"/></button></div>
      <form onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError('');
        try { await onSave(month, Object.fromEntries(new FormData(event.currentTarget))); }
        catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
      }}>
        <p className="closeout-intro">Confirme as faturas e informe se alguma retirada de reserva cobriu o saldo negativo. Só os valores confirmados serão atualizados.</p>
        <label className="checkline"><input name="cardPaid" type="checkbox" defaultChecked={data.close?.cardPaid || false}/><span><strong>As faturas do cartão foram pagas?</strong><small>Os lançamentos em aberto passam para pagos.</small></span></label>
        <label className="checkline"><input name="deficitCovered" type="checkbox" defaultChecked={data.close?.deficitCovered || false}/><span><strong>O saldo negativo foi coberto?</strong><small>Marque após confirmar de onde veio o valor que faltava.</small></span></label>
        <label>Retirada da reserva de emergência<span className="currency-input"><b>R$</b><input name="reserveWithdrawal" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} defaultValue={data.close?.reserveWithdrawalCents ? (data.close.reserveWithdrawalCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00"/></span></label>
        <div className="form-two">
          <label>Retirada da poupança<span className="currency-input"><b>R$</b><input name="savingsWithdrawal" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} defaultValue={data.close?.savingsWithdrawalCents ? (data.close.savingsWithdrawalCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00"/></span></label>
          <label>Retirada de investimentos<span className="currency-input"><b>R$</b><input name="investmentWithdrawal" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} defaultValue={data.close?.investmentWithdrawalCents ? (data.close.investmentWithdrawalCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00"/></span></label>
        </div>
        <label>Observação<input name="notes" defaultValue={data.close?.notes || ''} placeholder="Ex.: valor coberto com renda extra" maxLength="1000"/></label>
        <label className="checkline"><input name="confirmedWithdrawals" type="checkbox" required/><span><strong>Confirmo que revisei os valores acima</strong><small>As retiradas serão descontadas das reservas e registradas no histórico.</small></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Atualizando…' : 'Confirmar fechamento'}</button></div>
      </form>
    </section>
  </div>;
}

function Modal({ type, data, month = data.month, initialDate, onClose, onSave, onChoose, editRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState(editRow?.method || 'account');
  const [receiptData, setReceiptData] = useState(null);
  const [ocrProgress, setOcrProgress] = useState('');
  const [dateEdited, setDateEdited] = useState(false);
  if (type === 'month-close') return <CloseMonthModal data={data} month={month} onClose={onClose} onSave={onSave}/>;
  if (type === 'movement-choice') return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card movement-choice" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">NO SEU PLANO</span><h2 id="modal-title">Adicionar movimentação</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close"/></button></div><p>Escolha o tipo de registro que deseja adicionar.</p><div className="movement-choice-grid">{[['transaction', 'wallet', 'Despesa'], ['income', 'arrow', 'Recebimento'], ['transfer', 'movements', 'Transferência'], ['recurrence', 'planning', 'Despesa fixa'], ['reserve', 'reserve', 'Reserva'], ['goal', 'goals', 'Meta'], ['card', 'card', 'Cartão']].map(([value, icon, label]) => <button key={value} className="movement-choice-option" onClick={() => onChoose(value)}><Icon name={icon}/><span>{label}</span><Icon name="arrow" size={15}/></button>)}</div></section></div>;
  async function attachReceipt(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = event.target.form;
    const dateInput = form.elements.namedItem("date");
    const dateAtStart = dateInput?.value;
    const dateWasUntouched = dateInput && dateInput.value === dateInput.defaultValue;
    setBusy(true); setError(''); setOcrProgress('Preparando leitura local…');
    try {
      const result = await readReceipt(file, progress => setOcrProgress(progress.status === 'recognizing text' ? `Lendo comprovante… ${Math.round(progress.progress * 100)}%` : 'Preparando leitura local…'));
      setReceiptData(result);
      const fields = result.extracted;
      if (!editRow && fields.description && !form.elements.namedItem('description')?.value) form.elements.namedItem('description').value = fields.description;
      if (!editRow && fields.amountCents && !form.elements.namedItem('amount')?.value) form.elements.namedItem('amount').value = formatCentsInput(fields.amountCents);
      if (!editRow && !initialDate && !dateEdited && fields.date && dateWasUntouched && dateInput?.value === dateAtStart) dateInput.value = fields.date;
      setOcrProgress(result.source === 'pdf-text' ? 'Texto extraído do PDF; confira os campos antes de salvar.' : `Leitura local concluída · confiança aproximada ${result.confidence}%. Confira os campos antes de salvar.`);
    } catch (reason) { setReceiptData(null); setError(reason.message || 'Não foi possível ler esse comprovante.'); setOcrProgress(''); }
    finally { setBusy(false); event.target.value = ''; }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">XITOLINOS PLANEJAMENTO</span><h2 id="modal-title">{type === 'income-receipt' ? 'Registrar recebimento' : type === 'income' ? (editRow ? 'Editar recebimento' : 'Programar uma entrada') : type === 'recurrence' ? (editRow ? 'Editar despesa fixa' : 'Nova despesa fixa') : type === 'reserve' ? 'Adicionar reserva' : type === 'goal' ? 'Criar uma meta' : type === 'card' ? (editRow ? 'Editar cartão' : 'Adicionar cartão') : type === 'transfer' ? 'Nova transferência' : editRow ? 'Editar lançamento' : 'Adicionar despesa'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close"/></button></div><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const form = new FormData(event.currentTarget); await onSave(type, { ...Object.fromEntries(form), ...(receiptData ? { receiptData } : {}) }, editRow); } catch (reason) { setError(reason.message); } finally { setBusy(false); } }}>
    {type === 'card' && <><label>Nome do cartão<input name="name" placeholder="Ex.: Cartão principal" defaultValue={editRow?.name || ''} required maxLength="60"/></label><div className="form-two"><label>Bandeira<input name="network" placeholder="Visa, Mastercard..." defaultValue={editRow?.network || ''} maxLength="30"/></label><label>Últimos quatro dígitos<input name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" placeholder="0000" defaultValue={editRow?.lastFour || ''}/></label></div><div className="form-two"><label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" defaultValue={editRow?.closingDay || ''} required/></label><label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={editRow?.dueDay || ''} required/></label></div><label>Limite do cartão<span className="currency-input"><b>R$</b><input name="limit" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} placeholder="0,00" defaultValue={editRow?.limitCents ? formatCentsInput(editRow.limitCents) : ''}/></span></label></>}
    {(type === 'transaction' || type === 'income' || type === 'income-receipt' || type === 'recurrence') && <><label>{type === 'income' ? 'Nome de quem vai pagar' : type === 'income-receipt' ? 'Fonte do recebimento' : 'Descrição'}<input name="description" placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado, plano de celular'} defaultValue={editRow?.description || editRow?.name || ''} required maxLength="120"/></label><div className="form-two"><label>Valor total<span className="currency-input"><b>R$</b><input name="amount" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} placeholder="0,00" defaultValue={editRow ? (editRow.amountCents / 100).toFixed(2).replace('.', ',') : ''} required/></span></label><label>{type === 'income' ? 'Próximo recebimento' : type === 'recurrence' ? 'Começa em' : 'Data'}<input name="date" type="date" defaultValue={type === 'income-receipt' ? initialDate || todayDateString() : editRow?.date || editRow?.nextDate || editRow?.startDate || initialDate || todayDateString()} onChange={() => setDateEdited(true)} required/></label></div>{type === 'transaction' && <><div className="form-two"><label>Forma<select name="method" value={method} onChange={event => setMethod(event.target.value)}><option value="account">Conta bancária</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="card">Cartão de crédito</option></select></label><label>Categoria<select name="categoryId" defaultValue={editRow?.categoryId || ''}><option value="">Outros</option>{data.categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>{method === 'card' && <div className="form-two"><label>Cartão<select name="cardId" required>{data.cards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Parcelas<select name="installmentCount" defaultValue={1}>{Array.from({ length: 24 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}x</option>)}</select></label></div>}<label>Classificação<select name="spendingContext" defaultValue={editRow?.spendingContext || 'routine'}><option value="routine">Rotina mensal</option><option value="extra">Fora da rotina (viagens e outros)</option></select></label><label>Observação<input name="memo" defaultValue={editRow?.memo || ''} maxLength="500" placeholder="Opcional"/></label></>}{type === 'recurrence' && <div className="form-two"><label>Repetição<select name="frequency" defaultValue={editRow?.frequency || 'monthly'}><option value="monthly">Todo mês</option><option value="weekly">Toda semana</option><option value="fortnightly">A cada 15 dias</option><option value="yearly">Todo ano</option></select></label><label>Dia do mês<input name="dayOfMonth" type="number" min="1" max="31" defaultValue={editRow?.dayOfMonth || new Date().getDate()}/></label></div>}{type === 'income' && <div className="form-two"><label>Frequência<select name="frequency" defaultValue={editRow?.frequency || 'monthly'}><option value="once">Uma vez</option><option value="monthly">Todo mês</option><option value="weekly">Toda semana</option><option value="fortnightly">A cada 15 dias</option><option value="yearly">Todo ano</option></select></label><label>Lembrete<select name="reminderDaysBefore" defaultValue={editRow?.reminderDaysBefore ?? 0}><option value="0">No dia do recebimento</option><option value="1">1 dia antes</option><option value="2">2 dias antes</option><option value="5">5 dias antes</option></select></label></div>}</>}
    {type === 'transfer' && <><label>Descrição<input name="description" required maxLength="120" placeholder="Ex.: Transferência entre contas"/></label><div className="form-two"><label>Valor<span className="currency-input"><b>R$</b><input name="amount" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} required placeholder="0,00"/></span></label><label>Data<input name="date" type="date" defaultValue={initialDate || editRow?.date || todayDateString()} required/></label></div><div className="form-two"><label>Conta de origem<select name="accountId" required>{data.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Conta de destino<select name="counterpartyAccountId" required>{data.accounts.filter(item => item.id !== Number(data.accounts[0]?.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><p className="muted">A transferência atualiza os saldos das duas contas sem ser contada como renda ou despesa.</p></>}
    {['transaction', 'transfer', 'income-receipt'].includes(type) && <section className="receipt-upload"><div><strong>Comprovante ou recibo</strong><small>Imagem ou PDF · leitura offline em português · máximo 2 MB guardados</small></div><label className="button button-quiet file-button"><Icon name="file"/>{busy ? 'Lendo…' : receiptData ? 'Trocar comprovante' : 'Anexar e ler'}<input type="file" accept="image/*,application/pdf" disabled={busy} onChange={attachReceipt}/></label>{editRow?.hasReceipt && !receiptData && <small>Já existe um comprovante anexado: {editRow.receiptFileName}. Anexar outro irá substituí-lo.</small>}{ocrProgress && <small role="status">{ocrProgress}</small>}{receiptData?.extracted && <div className="receipt-extracted"><strong>Confira os dados sugeridos antes de salvar</strong><span>{receiptData.extracted.transactionCode && `Código: ${receiptData.extracted.transactionCode}`}{receiptData.extracted.receiptNumber && ` · Comprovante: ${receiptData.extracted.receiptNumber}`}</span></div>}</section>}
    {type === 'reserve' && <><label>Nome<input name="name" placeholder="Ex.: Fundo para imprevistos" required/></label><div className="form-two"><label>Tipo<select name="kind"><option value="emergency">Reserva de emergência</option><option value="savings">Poupança</option><option value="investment">Investimentos</option></select></label><label>Saldo atual<span className="currency-input"><b>R$</b><input name="balance" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} placeholder="0,00" required/></span></label></div><div className="form-two"><label>Meta de saldo<span className="currency-input"><b>R$</b><input name="target" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} placeholder="0,00"/></span></label><label>Rendimento ao ano (%)<input name="yield" inputMode="decimal" placeholder="0,00"/></label></div></>}
    {type === 'goal' && <><label>Nome da meta<input name="name" placeholder="Ex.: Viagem de férias" required/></label><div className="form-two"><label>Quanto deseja guardar?<span className="currency-input"><b>R$</b><input name="target" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} required/></span></label><label>Prazo<input name="date" type="date"/></label></div></>}
    {type === 'month-close' && <><p className="closeout-intro">Revise as informações de {monthLabel(data.month)}. Esta confirmação atualiza as faturas e as reservas no seu histórico local.</p><label className="checkline"><input name="cardPaid" type="checkbox" defaultChecked={data.close?.cardPaid || false}/><span><strong>As faturas do cartão foram pagas?</strong><small>Ao marcar, os lançamentos pendentes serão atualizados como pagos.</small></span></label><label className="checkline"><input name="deficitCovered" type="checkbox" defaultChecked={data.close?.deficitCovered || false}/><span><strong>O saldo negativo foi coberto?</strong><small>Marque após confirmar de onde veio o valor que faltava.</small></span></label><div className="form-two"><label>Retirada da reserva de emergência<span className="currency-input"><b>R$</b><input name="reserveWithdrawal" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} defaultValue={data.close?.reserveWithdrawalCents ? (data.close.reserveWithdrawalCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00"/></span></label><label>Retirada de investimentos<span className="currency-input"><b>R$</b><input name="investmentWithdrawal" inputMode="numeric" onInput={event => { event.currentTarget.value = formatMoneyEntry(event.currentTarget.value); }} defaultValue={data.close?.investmentWithdrawalCents ? (data.close.investmentWithdrawalCents / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00"/></span></label></div><label>Observação<input name="notes" defaultValue={data.close?.notes || ''} placeholder="Ex.: valor coberto com renda extra" maxLength="1000"/></label><label className="checkline"><input name="confirmedWithdrawals" type="checkbox" required/><span><strong>Confirmo que revisei os valores acima</strong><small>Retiradas informadas serão descontadas das reservas e registradas como transferências.</small></span></label></>}
    {error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar no meu plano'}</button></div></form></section></div>;
}

function NotificationsPanel({ notifications, onClose, onOpen }) {
  return <section className="notification-popover" role="dialog" aria-label="Avisos deste dispositivo"><div className="notification-head"><span><span className="eyebrow">LEMBRETES LOCAIS</span><strong>Avisos do seu plano</strong></span><button className="icon-button" onClick={onClose} aria-label="Fechar avisos"><Icon name="close" size={16}/></button></div>{notifications.length ? <div className="notification-list">{notifications.map(item => <button className="notification-row" key={item.id} onClick={() => onOpen(item)}><span className={`notification-icon ${item.kind}`}><Icon name={item.kind === 'income-due' ? 'wallet' : item.kind === 'month-close' ? 'check' : 'card'} size={17}/></span><span><strong>{item.title}</strong><small>{item.message}</small></span><Icon name="arrow" size={15}/></button>)}</div> : <p className="notification-empty">Sem lembretes pendentes. Seus avisos aparecem aqui antes dos recebimentos, do fechamento e do vencimento do cartão.</p>}<small className="notification-local-note">Exibidos dentro deste aplicativo; não usam push, e-mail ou Internet.</small></section>;
}

function MobileBottomNav({ page, viewer, onPage, onAdd }) {
  return <nav className="mobile-bottom-nav" aria-label="Navegação principal"><button aria-current={page === 'dashboard' || page === 'flow' ? 'page' : undefined} onClick={() => onPage('dashboard')}><Icon name="dashboard" size={19}/><span>Início</span></button><button aria-current={['planning', 'calendar', 'cards', 'reserve', 'goals'].includes(page) ? 'page' : undefined} onClick={() => onPage('planning')}><Icon name="planning" size={19}/><span>Planejar</span></button><button aria-current={page === 'reports' ? 'page' : undefined} onClick={() => onPage('reports')}><Icon name="movements" size={19}/><span>Relatórios</span></button>{!viewer && <button className="mobile-nav-add" aria-label="Adicionar movimentação" onClick={onAdd}><Icon name="plus" size={25}/></button>}<button aria-current={page === 'shopping' ? 'page' : undefined} onClick={() => onPage('shopping')}><Icon name="shopping" size={19}/><span>Compras</span></button><button aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onPage('settings')}><Icon name="settings" size={19}/><span>Perfil</span></button></nav>;
}

function ThemeToggle({ theme, onClick }) {
  return <button className="icon-button theme-toggle" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title="Alternar tema" onClick={onClick}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18}/></button>;
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('xitolinos-session') || 'null'));
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(todayDateString().slice(0, 7));
  const [page, setPageState] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('xitolinos-theme') || 'light');
  const [hideValues, setHideValues] = useState(false);
  const [search, setSearch] = useState('');
  const [billing, setBilling] = useState(null);
  const [adviceMode, setAdviceMode] = useState('purchase');
  const shoppingOnly = session?.user?.profile === 'shopping_viewer';
  const viewer = session?.user?.profile === 'viewer' || shoppingOnly;

  function setPage(nextPage) { setPageState(shoppingOnly && nextPage !== 'shopping' ? 'shopping' : nextPage); }

  function openAdvice(mode) { setAdviceMode(mode); setPage('ask'); }

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('xitolinos-theme', nextTheme);
    setTheme(nextTheme);
  }

  function toggleValues() {
    const next = !hideValues;
    document.documentElement.dataset.valuesHidden = next ? 'true' : 'false';
    setHideValues(next);
  }

  function openAdd() { setModal({ type: 'movement-choice' }); }

  async function openNotification(item) {
    setNotificationsOpen(false);
    if (item.kind === 'month-close') {
      await loadDashboard(item.month, false);
      setModal({ type: 'month-close', month: item.month });
    } else setPage('planning');
  }

  async function loadDashboard(value = month, showError = true) {
    if (!session?.token) return;
    setBusy(true);
    try {
      if (shoppingOnly) {
        setData({ profile: session.user, accounts: [], categories: [], preferences: { theme: localStorage.getItem('xitolinos-theme') || 'light', accent: 'green' }, notifications: [] });
        setBilling(null); setMonth(value); setPage('shopping');
        return;
      }
      const result = await api(`/finance/dashboard?month=${value}`, { token: session.token });
      setData(result); setMonth(value);
      api('/finance/billing', { token: session.token }).then(setBilling).catch(() => {});
    } catch (error) {
      if (showError) setNotice(`${error.message} Talvez seja necessário entrar novamente.`);
      if (/sessão|entre/i.test(error.message)) { localStorage.removeItem('xitolinos-session'); setSession(null); }
    } finally { setBusy(false); }
  }

  useEffect(() => { if (session?.token) loadDashboard(month, false); }, [session?.token, month, shoppingOnly]);
  useEffect(() => { const nextTheme = localStorage.getItem('xitolinos-theme') || data?.preferences?.theme || 'light'; document.documentElement.dataset.theme = nextTheme; setTheme(nextTheme); }, [data?.preferences?.theme]);

  async function doLogin(identifier, password) {
    const next = await login(identifier, password);
    const value = { token: next.token, user: next.user };
    localStorage.setItem('xitolinos-session', JSON.stringify(value)); setSession(value);
  }

  function toast(message) {
    setNotice(message);
    window.clearTimeout(toast.timeout);
    toast.timeout = window.setTimeout(() => setNotice(''), 4600);
  }

  async function action(path, body, success, method = 'POST') {
    try { await api(path, { token: session.token, method, body: JSON.stringify(body) }); await loadDashboard(month, false); toast(success); }
    catch (error) { toast(error.message); }
  }

  async function saveForm(type, values, editRow) {
    const amount = values.amount === undefined ? 0 : amountCents(values.amount);
    if (values.date && !isRealDate(values.date)) throw new Error('Informe uma data válida.');
    if (type === 'card') await api(editRow ? `/finance/cards/${editRow.id}` : '/finance/cards', { token: session.token, method: editRow ? 'PUT' : 'POST', body: JSON.stringify({ name: values.name, network: values.network, lastFour: values.lastFour, closingDay: Number(values.closingDay), dueDay: Number(values.dueDay), limitCents: optionalCents(values.limit) }) });
    if (type === 'transaction') {
      const payload = { description: values.description, amountCents: amount, type: editRow ? undefined : 'expense', date: values.date, method: values.method, categoryId: values.categoryId ? Number(values.categoryId) : null, cardId: values.cardId ? Number(values.cardId) : null, installmentCount: Number(values.installmentCount || 1), memo: values.memo, spendingContext: values.spendingContext, ...(values.receiptData ? { receiptData: values.receiptData } : {}) };
      await api(editRow ? `/finance/transactions/${editRow.id}` : '/finance/transactions', { token: session.token, method: editRow ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    }
    if (type === 'transfer') await api('/finance/transactions', { token: session.token, method: 'POST', body: JSON.stringify({ description: values.description, amountCents: amount, type: 'transfer', date: values.date, method: 'transfer', accountId: Number(values.accountId), counterpartyAccountId: Number(values.counterpartyAccountId), ...(values.receiptData ? { receiptData: values.receiptData } : {}) }) });
    if (type === 'income-receipt') await api(`/finance/incomes/${editRow.id}/receive`, { token: session.token, method: 'POST', body: JSON.stringify({ date: values.date, amountCents: amount, ...(values.receiptData ? { receiptData: values.receiptData } : {}) }) });
    if (type === 'income') await api(editRow ? `/finance/incomes/${editRow.id}` : '/finance/incomes', { token: session.token, method: editRow ? 'PUT' : 'POST', body: JSON.stringify({ name: values.description, amountCents: amount, frequency: values.frequency, nextDate: values.date, reminderDaysBefore: Number(values.reminderDaysBefore), alertEnabled: true }) });
    if (type === 'recurrence') await api(editRow ? `/finance/recurrences/${editRow.id}` : '/finance/recurrences', { token: session.token, method: editRow ? 'PUT' : 'POST', body: JSON.stringify({ name: values.description, amountCents: amount, frequency: values.frequency, startDate: values.date, dayOfMonth: Number(values.dayOfMonth), categoryId: editRow?.categoryId || data.categories.find(item => item.name === 'Outros')?.id }) });
    if (type === 'reserve') await api('/finance/reserves', { token: session.token, method: 'POST', body: JSON.stringify({ name: values.name, kind: values.kind, balanceCents: amountCents(values.balance), targetCents: optionalCents(values.target), annualYieldBasisPoints: Math.round(Number(String(values.yield || 0).replace(',', '.')) * 100) }) });
      if (type === 'goal') await api('/finance/goals', { token: session.token, method: 'POST', body: JSON.stringify({ name: values.name, targetCents: optionalCents(values.target), dueDate: values.date || null }) });
    setModal(null); await loadDashboard(month, false); toast(type === 'card' ? (editRow ? 'Cartão atualizado.' : 'Cartão adicionado.') : editRow ? 'Registro atualizado.' : 'Adicionado ao seu planejamento.');
  }

  async function saveClose(period, values) {
    await api('/finance/month-close', { token: session.token, method: 'POST', body: JSON.stringify({ month: period, cardPaid: values.cardPaid === 'on', deficitCovered: values.deficitCovered === 'on', reserveWithdrawalCents: optionalCents(values.reserveWithdrawal), savingsWithdrawalCents: optionalCents(values.savingsWithdrawal), investmentWithdrawalCents: optionalCents(values.investmentWithdrawal), notes: values.notes, confirmedWithdrawals: values.confirmedWithdrawals === 'on' }) });
    setModal(null); await loadDashboard(period, false); toast('O fechamento atualizou as faturas, as reservas e o histórico.');
  }

  function moveReserve(reserve, direction) {
    const raw = window.prompt(`${direction === 'withdraw' ? 'Quanto retirar' : 'Quanto guardar'} em ${reserve.name}? Digite o valor em reais.`);
    if (raw === null) return;
    const cents = amountCents(raw);
    if (!cents) { toast('Informe um valor maior que zero.'); return; }
    if (!window.confirm(`${direction === 'withdraw' ? 'Confirmar retirada' : 'Confirmar depósito'} de ${money(cents)}? O saldo e o histórico serão atualizados.`)) return;
    action(`/finance/reserves/${reserve.id}/movement`, { amountCents: cents, direction, confirmed: true }, 'A movimentação da reserva foi registrada.');
  }

  function removeRow(row) {
    if (window.confirm(`Remover “${row.description}” do seu histórico? Você poderá restaurá-lo pela lixeira.`)) action(`/finance/transactions/${row.id}/delete`, {}, 'O lançamento foi removido do total do mês.');
  }

  async function openReceipt(row) {
    try {
      const result = await api(`/finance/transactions/${row.id}/receipt`, { token: session.token, sensitive: false });
      await saveLocalFile(result.receipt.fileName, result.receipt.dataUrl, result.receipt.mimeType);
    } catch (error) { toast(error.message); }
  }

  function resetTransactions() {
    const confirmation = window.prompt('Isso moverá todos os lançamentos ativos para a lixeira. Eles poderão ser restaurados individualmente. Digite RESETAR para continuar.');
    if (confirmation !== 'RESETAR') return;
    action('/finance/transactions/reset', {}, 'Os lançamentos foram movidos para a lixeira.');
  }

  function receiveIncome(source) {
    setModal({ type: 'income-receipt', editRow: source, initialDate: todayDateString() });
  }

  function settleCard(card) {
    if (window.confirm(`Confirmar pagamento de ${money(card.invoiceCents - card.paidCents, true)} da fatura ${card.name}?`)) action(`/finance/cards/${card.id}/settle`, { month }, 'Fatura registrada como paga.');
  }

  if (!session) return <Login onLogin={doLogin}/>;
  if (!unlocked && !shoppingOnly) return <DeviceUnlock session={session} onReplaceSession={setSession} onUnlock={() => setUnlocked(true)}/>;
  if (!data) return <main className="loading-screen"><Brand/><div className="loading-ring"/><p>{busy ? 'Abrindo seu planejamento local…' : 'Iniciando o aplicativo local…'}</p><small>O servidor local precisa estar aberto neste dispositivo.</small></main>;
  return <div className={`app-shell accent-${data.preferences?.accent || 'green'} ${shoppingOnly ? 'shopping-only' : ''}`}><aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}><Brand/><nav className="sidebar-navigation" aria-label="Navegação do planejamento">{navItems.filter(([key]) => !shoppingOnly || key === 'shopping').map(([key, icon, label, group], index) => <React.Fragment key={key}>{(index === 0 || navItems[index - 1][3] !== group) && <div className="sidebar-label">{group === 'planning' ? 'PLANEJAMENTO' : group === 'manage' ? 'ORGANIZACAO' : 'FERRAMENTAS'}</div>}<button className={`nav-link ${page === key ? 'active' : ''}`} aria-current={page === key ? 'page' : undefined} onClick={() => { key === 'ask' ? openAdvice('purchase') : setPage(key); setMenuOpen(false); }}><Icon name={icon} size={19}/><span>{label}</span>{key === 'ask' && <i className="nav-dot"/>}</button></React.Fragment>)}</nav><button className="sidebar-profile" onClick={() => { setPage('settings'); setMenuOpen(false); }}><span className="profile-avatar">{data.preferences?.avatarDataUrl ? <img src={data.preferences.avatarDataUrl} alt=""/> : (data.profile?.username || 'X').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR')}</span><span><strong>{data.profile?.username || session.user?.username}</strong>{viewer && <small>Acesso para consulta</small>}</span><Icon name="chevron" size={17}/></button><div className="sidebar-user"><span className="local-indicator"/><span>Dados salvos neste dispositivo</span><button title="Sair" aria-label="Sair da conta" onClick={() => { localStorage.removeItem('xitolinos-session'); setSession(null); setUnlocked(false); setData(null); setMenuOpen(false); }}><Icon name="logout" size={18}/></button></div></aside><main className="main-area"><div className="mobile-top"><button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu"><Icon name="menu"/></button><Brand/><button className="icon-button privacy-toggle" aria-label={hideValues ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} title={hideValues ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} onClick={toggleValues}><Icon name={hideValues ? 'eyeOff' : 'eye'}/></button><ThemeToggle theme={theme} onClick={toggleTheme}/><button className="icon-button" aria-label="Avisos" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-expanded={notificationsOpen}><Icon name="bell"/></button></div><div className="main-topbar"><form className="global-search" role="search" onSubmit={event => { event.preventDefault(); setPage('movements'); }}><Icon name="search" size={19}/><input aria-label="Buscar lançamento, categoria ou conta" value={search} onChange={event => { setSearch(event.target.value); if (event.target.value) setPage('movements'); }} placeholder="Buscar lançamento, categoria ou conta"/>{search && <button type="button" className="search-clear" aria-label="Limpar pesquisa" onClick={() => setSearch('')}><Icon name="close" size={15}/></button>}</form><div className="topbar-tools"><button className="icon-button privacy-toggle" aria-label={hideValues ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} title={hideValues ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'} onClick={toggleValues}><Icon name={hideValues ? 'eyeOff' : 'eye'}/></button><span className="local-pill"><i/>LOCAL · PRIVADO</span><ThemeToggle theme={theme} onClick={toggleTheme}/><button className="icon-button notification-button" aria-label="Avisos de recebimento e cartão" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-expanded={notificationsOpen}><Icon name="bell"/>{(data.notifications || []).length > 0 && <i/>}</button><button className="top-user" onClick={() => setPage('settings')}>{data.profile?.username || 'Conta'}<span className="top-avatar">{data.preferences?.avatarDataUrl ? <img src={data.preferences.avatarDataUrl} alt=""/> : 'X'}</span></button></div></div>{notificationsOpen && <NotificationsPanel notifications={data.notifications || []} onClose={() => setNotificationsOpen(false)} onOpen={openNotification}/>}<div className="page-content" style={{ '--ui-green': data.preferences?.accent === 'gold' ? '#F4D03F' : data.preferences?.accent === 'lime' ? '#A1DC67' : '#58AB2F' }}>
    {page === 'dashboard' && <Dashboard data={data} month={month} onMonthChange={setMonth} viewer={viewer} onOpenForm={type => setModal({ type })} onOpenAdvice={openAdvice} onEdit={editRow => setModal({ type: 'transaction', editRow })} onDelete={removeRow} onSettleCard={settleCard} onCloseMonth={() => setModal({ type: 'month-close' })} setPage={setPage}/>}
    {page === 'reports' && <ReportsPage data={data} month={month} onMonthChange={setMonth} setPage={setPage}/>}
    {page === 'flow' && <CashflowPage data={data} month={month} onMonthChange={setMonth} setPage={setPage}/>}
    {page === 'calendar' && <CalendarPage data={data} month={month} onMonthChange={setMonth} viewer={viewer} onOpenForm={(type, initialDate) => setModal({ type, initialDate })} onEdit={row => setModal({ type: 'transaction', editRow: row })}/>}
    {page === 'cards' && <CardsPage data={data} month={month} onMonthChange={setMonth} viewer={viewer} onSettleCard={settleCard} onOpenForm={(type, initialDate) => setModal({ type, initialDate })} onEdit={card => setModal({ type: 'card', editRow: card })}/>}
    {page === 'movements' && <MovementHistory data={data} month={month} onMonthChange={setMonth} token={session.token} viewer={viewer} onOpenForm={type => setModal({ type })} onEdit={editRow => setModal({ type: 'transaction', editRow })} onDelete={removeRow} onReceipt={openReceipt} onToast={toast} search={search} setSearch={setSearch} onReset={resetTransactions} onRestore={row => action(`/finance/transactions/${row.id}/restore`, {}, 'Lançamento restaurado.')}/>}
    {page === 'planning' && <Planning data={data} viewer={viewer} onOpenForm={(type, editRow) => setModal({ type, editRow })} onAction={action} onReceive={receiveIncome} onEdit={(type, editRow) => setModal({ type, editRow })}/>}
    {page === 'reserve' && <Reserves data={data} viewer={viewer} onMove={moveReserve} onOpenForm={(type, initialDate) => setModal({ type, initialDate })} onEdit={row => setModal({ type: 'transaction', editRow: row })}/>}
    {page === 'goals' && <Goals data={data} viewer={viewer} onOpenForm={(type, initialDate) => setModal({ type, initialDate })} onEdit={row => setModal({ type: 'transaction', editRow: row })}/>}
    {page === 'shopping' && <ShoppingPage token={session.token} data={data} month={month} onMonthChange={setMonth} onToast={toast} onRefresh={() => loadDashboard(month, false)} viewer={viewer} shoppingOnly={shoppingOnly}/> }
    {page === 'import' && <ImportPage token={session.token} viewer={viewer} onRefresh={() => loadDashboard(month, false)} onToast={toast}/>}
    {page === 'ask' && <Advice key={adviceMode} token={session.token} data={data} onToast={toast} mode={adviceMode}/>}
    {page === 'settings' && <Settings data={data} billing={billing} token={session.token} onRefresh={() => loadDashboard(month, false)} onToast={toast} onOpenImport={() => setPage('import')} viewer={viewer}/>}
  </div>{!viewer && <button className="floating-add" aria-label="Adicionar movimentação" onClick={openAdd}><Icon name="plus" size={23}/><span>Adicionar</span></button>}{!shoppingOnly && <MobileBottomNav page={page} viewer={viewer} onPage={setPage} onAdd={openAdd}/>}</main>{menuOpen && <button className="menu-shade" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}/>} {modal && <Modal type={modal.type} data={data} month={modal.month || month} initialDate={modal.initialDate} editRow={modal.editRow} onClose={() => setModal(null)} onSave={modal.type === 'month-close' ? saveClose : saveForm} onChoose={type => setModal({ type, initialDate: modal.initialDate })}/>} {notice && <div role="status" className="toast-message">{notice}<button aria-label="Dispensar aviso" onClick={() => setNotice('')}><Icon name="close" size={16}/></button></div>}</div>;
}
