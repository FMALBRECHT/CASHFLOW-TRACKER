const STORAGE_KEY = 'cashflow-life-secure-v1';
const SESSION_KEY = 'cashflow-life-auth';
const AUTH_USERNAME = 'faizanmustafaalbrechtmahlik666333111';
const AUTH_PASSWORD = '1234QWERasdf.ASDF';

const defaultState = {
  profile: { playerName: '', profession: '', dreamGoal: '' },
  incomes: [],
  expenses: [],
  assets: [],
  liabilities: [],
  deals: [],
  milestones: { freedomShown: false }
};

let state = loadState();

const $ = (id) => document.getElementById(id);
const currency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n || 0));
const percent = (n) => `${Math.max(0, Math.min(100, Number(n || 0))).toFixed(0)}%`;
const sum = (arr, fn) => arr.reduce((acc, item) => acc + Number(fn(item) || 0), 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      profile: { ...structuredClone(defaultState).profile, ...(parsed.profile || {}) },
      milestones: { ...structuredClone(defaultState).milestones, ...(parsed.milestones || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function totals() {
  const activeIncome = sum(state.incomes.filter(i => i.type === 'active'), i => i.amount);
  const passiveIncome = sum(state.incomes.filter(i => i.type === 'passive'), i => i.amount) + sum(state.assets, a => a.cashflow);
  const totalIncome = activeIncome + passiveIncome;
  const totalExpenses = sum(state.expenses, e => e.amount) + sum(state.liabilities, l => l.payment);
  const assetsValue = sum(state.assets, a => a.value);
  const liabilitiesValue = sum(state.liabilities, l => l.amount);
  const cashflow = totalIncome - totalExpenses;
  const freedomGap = totalExpenses - passiveIncome;
  return {
    activeIncome,
    passiveIncome,
    totalIncome,
    totalExpenses,
    cashflow,
    netWorth: assetsValue - liabilitiesValue,
    freedomGap,
    assetsValue,
    liabilitiesValue,
    freedomPercent: totalExpenses > 0 ? clamp((passiveIncome / totalExpenses) * 100, 0, 100) : 0,
    goal10kPercent: clamp((passiveIncome / 10000) * 100, 0, 100),
    goal50kPercent: clamp((passiveIncome / 50000) * 100, 0, 100),
    goal100kPercent: clamp((passiveIncome / 100000) * 100, 0, 100)
  };
}

function dealScore(kind, cost, monthly, t = totals()) {
  cost = Number(cost || 0);
  monthly = Number(monthly || 0);
  const monthlyPositive = kind === 'debt' ? Math.abs(monthly) : monthly;
  const payback = monthlyPositive > 0 ? cost / monthlyPositive : Infinity;
  const cashCoverage = cost <= 0 ? 100 : clamp((Math.max(t.cashflow, 0) / cost) * 100, 0, 100);
  const roiYear = cost > 0 ? (monthlyPositive * 12 / cost) * 100 : 100;

  let score = 0;
  if (monthlyPositive > 0) score += 20;
  if (payback <= 6) score += 30;
  else if (payback <= 12) score += 22;
  else if (payback <= 24) score += 12;
  else if (payback <= 36) score += 6;

  if (roiYear >= 100) score += 20;
  else if (roiYear >= 50) score += 15;
  else if (roiYear >= 25) score += 10;
  else if (roiYear >= 10) score += 5;

  if (cashCoverage >= 100) score += 15;
  else if (cashCoverage >= 50) score += 10;
  else if (cashCoverage >= 25) score += 5;

  if (kind === 'debt') score += 8;
  if (kind === 'income' && monthlyPositive >= 500) score += 7;
  if (kind === 'asset' && monthlyPositive >= 200) score += 7;

  score = clamp(score, 0, 100);

  let label = 'Weak';
  if (score >= 85) label = 'Elite';
  else if (score >= 70) label = 'Strong';
  else if (score >= 55) label = 'Decent';

  let advice = 'This does not look attractive yet.';
  if (score >= 85) advice = 'Very attractive. Fast payback, strong monthly impact, and solid fit.';
  else if (score >= 70) advice = 'Good deal. Worth serious attention if the assumptions are real.';
  else if (score >= 55) advice = 'Reasonable deal, but tighten the cost or improve monthly output.';
  else if (score >= 35) advice = 'Mediocre. Be careful with long payback or weak cashflow impact.';

  return { score, label, advice, payback, roiYear, cashCoverage };
}

function renderProfile() {
  ['playerName', 'profession', 'dreamGoal'].forEach((key) => { $(key).value = state.profile[key] || ''; });
}

function bindProfile() {
  ['playerName', 'profession', 'dreamGoal'].forEach((key) => {
    $(key).addEventListener('input', (e) => {
      state.profile[key] = e.target.value;
      saveState();
    });
  });
}

function renderTable(tbodyId, rows, columns, removeFn, actionLabel = 'Delete') {
  const tbody = $(tbodyId);
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="muted">Nothing yet.</td></tr>`;
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map((c) => `<td>${c(row)}</td>`).join('') + `<td><button data-id="${row.id}">${actionLabel}</button></td>`;
    tr.querySelector('button').addEventListener('click', () => removeFn(row.id));
    tbody.appendChild(tr);
  });
}

function removeById(listName, id) {
  state[listName] = state[listName].filter((item) => item.id !== id);
  persistAndRender();
}

function applyOrRemoveDeal(id) {
  const deal = state.deals.find((d) => d.id === id);
  if (!deal) return;
  if (deal.kind === 'asset') {
    state.assets.push({ id: uuid(), name: deal.name, value: deal.cost, cashflow: deal.monthly });
  } else if (deal.kind === 'income') {
    state.incomes.push({ id: uuid(), name: deal.name, type: 'passive', amount: deal.monthly });
  } else if (deal.kind === 'debt') {
    state.expenses.push({ id: uuid(), name: `${deal.name} payoff`, amount: -Math.abs(deal.monthly) });
  }
  state.deals = state.deals.filter((d) => d.id !== id);
  persistAndRender();
}

function renderAllTables() {
  renderTable('incomeTable', state.incomes, [r => r.name, r => r.type, r => currency(r.amount)], (id) => removeById('incomes', id));
  renderTable('expenseTable', state.expenses, [r => r.name, r => currency(r.amount)], (id) => removeById('expenses', id));
  renderTable('assetTable', state.assets, [r => r.name, r => currency(r.value), r => currency(r.cashflow)], (id) => removeById('assets', id));
  renderTable('liabilityTable', state.liabilities, [r => r.name, r => currency(r.amount), r => currency(r.payment)], (id) => removeById('liabilities', id));
  renderTable('dealTable', state.deals, [r => r.name, r => r.kind, r => currency(r.cost), r => currency(r.monthly)], (id) => applyOrRemoveDeal(id), 'Apply');
}

function pulseMetrics() {
  document.querySelectorAll('.pulse-on-update').forEach((el) => {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  });
}

function updateProgressBars(t) {
  $('freedomProgress').style.width = `${t.freedomPercent}%`;
  $('goal10kProgress').style.width = `${t.goal10kPercent}%`;
  $('goal50kProgress').style.width = `${t.goal50kPercent}%`;
  $('goal100kProgress').style.width = `${t.goal100kPercent}%`;
  $('freedomPercentLabel').textContent = percent(t.freedomPercent);
  $('goal10kLabel').textContent = percent(t.goal10kPercent);
  $('goal50kLabel').textContent = percent(t.goal50kPercent);
  $('goal100kLabel').textContent = percent(t.goal100kPercent);
  $('runnerDot').style.left = `${t.freedomPercent}%`;

  let note = 'Add passive income to start escaping.';
  if (t.freedomPercent > 0 && t.freedomPercent < 100) note = `${currency(Math.abs(t.freedomGap))} left until freedom.`;
  if (t.freedomPercent >= 100) note = `You beat your monthly expense wall by ${currency(Math.abs(t.freedomGap))}.`;
  $('freedomNote').textContent = note;
}

function updateCoach(t) {
  const coachList = $('coachList');
  const tips = [];
  let score = 0;

  if (t.passiveIncome > 0) score += 20;
  if (t.passiveIncome >= t.totalExpenses && t.totalExpenses > 0) score += 35;
  else if (t.totalExpenses > 0) score += clamp((t.passiveIncome / t.totalExpenses) * 25, 0, 25);

  if (t.cashflow > 0) score += 20;
  else tips.push('Your monthly cashflow is negative. Fix that before taking risky deals.');

  if (t.netWorth > 0) score += 10;
  if (state.deals.length > 0) score += 5;

  let bestMove = 'Increase passive income';
  let riskWatch = 'Watch expenses';
  let dealRule = 'Aim for a 6–24 month payback';

  if (t.cashflow <= 0) {
    bestMove = 'Cut or restructure expenses';
    riskWatch = 'Negative cashflow';
  } else if (t.passiveIncome < t.totalExpenses) {
    bestMove = 'Buy or create cashflow assets';
    riskWatch = 'Freedom gap still open';
  } else {
    bestMove = 'Scale passive income aggressively';
    riskWatch = 'Do not drift into lifestyle inflation';
    dealRule = 'Prefer scalable, repeatable, high-margin deals';
  }

  if (state.liabilities.length) {
    const totalPayments = sum(state.liabilities, l => l.payment);
    if (totalPayments > t.totalIncome * 0.25) tips.push('Debt payments are eating a big chunk of income. Debt payoff deals deserve attention.');
  }

  if (!state.incomes.some(i => i.type === 'passive') && !state.assets.some(a => a.cashflow > 0)) {
    tips.push('You need at least one true passive stream. Start with the fastest realistic one.');
  }

  if (state.deals.length) {
    const scoredDeals = state.deals.map(d => ({ ...d, ...dealScore(d.kind, d.cost, d.monthly, t) })).sort((a, b) => b.score - a.score);
    const top = scoredDeals[0];
    tips.push(`Best current deal: ${top.name} (${top.label}, score ${top.score}).`);
    bestMove = `Consider ${top.name}`;
    dealRule = top.payback === Infinity ? 'Avoid deals with no monthly return.' : `Target payback around ${top.payback.toFixed(1)} months or faster.`;
  } else {
    tips.push('Create a few deals and compare them before making your next move.');
  }

  if (t.cashflow > 0) tips.push(`Your current cashflow is ${currency(t.cashflow)}. Use it intentionally, not randomly.`);
  if (t.passiveIncome < t.totalExpenses) tips.push(`You still need about ${currency(Math.abs(t.freedomGap))} more passive income to be free.`);
  if (t.passiveIncome >= t.totalExpenses && t.totalExpenses > 0) tips.push('You are free. Now focus on high-quality, scalable deals that multiply cashflow.');

  score = clamp(Math.round(score), 0, 100);
  $('coachScore').textContent = score;
  $('coachHeadline').textContent = score >= 80 ? 'You are operating like an owner.' : score >= 55 ? 'You are building momentum.' : 'Your system still needs tightening.';
  $('bestMove').textContent = bestMove;
  $('riskWatch').textContent = riskWatch;
  $('dealRule').textContent = dealRule;
  coachList.innerHTML = tips.slice(0, 5).map(tip => `<li>${tip}</li>`).join('');
}

function updateDealQuickCoach() {
  const kind = $('dealKind').value;
  const cost = Number($('dealCost').value || 0);
  const monthly = Number($('dealMonthly').value || 0);
  if (!cost && !monthly) {
    $('dealQualityLabel').textContent = 'Waiting for a deal';
    $('dealScoreBadge').textContent = '--';
    $('dealScoreBar').style.width = '0%';
    $('dealQuickAdvice').textContent = 'Enter a deal to see whether it looks weak, decent, strong, or elite.';
    return;
  }
  const scored = dealScore(kind, cost, monthly);
  $('dealQualityLabel').textContent = scored.label;
  $('dealScoreBadge').textContent = `${scored.score}`;
  $('dealScoreBar').style.width = `${scored.score}%`;
  $('dealQuickAdvice').textContent = `${scored.advice} ${Number.isFinite(scored.payback) ? `Payback: ${scored.payback.toFixed(1)} months.` : ''}`;
}

function updateMetrics() {
  const t = totals();
  $('metricPassive').textContent = currency(t.passiveIncome);
  $('metricExpenses').textContent = currency(t.totalExpenses);
  $('metricGap').textContent = currency(Math.abs(t.freedomGap));
  $('metricIncome').textContent = currency(t.totalIncome);
  $('metricExpenses2').textContent = currency(t.totalExpenses);
  $('metricCashflow').textContent = currency(t.cashflow);
  $('metricCashflowHero').textContent = currency(t.cashflow);
  $('metricNetWorth').textContent = currency(t.netWorth);
  $('turnSummary').textContent = `Freedom ${percent(t.freedomPercent)}`;

  const status = $('freedomStatus');
  const free = t.passiveIncome >= t.totalExpenses && t.totalExpenses > 0;
  status.textContent = free ? 'Free' : 'Rat Race';
  status.classList.toggle('free', free);

  document.querySelector('.metric-box.highlight strong').textContent = free ? `+${currency(Math.abs(t.freedomGap))}` : currency(Math.abs(t.freedomGap));
  $('snapshotChip').textContent = free ? 'Cashflow Day' : (t.freedomPercent >= 60 ? 'Closing In' : 'Starting Out');

  updateProgressBars(t);
  updateCoach(t);
  pulseMetrics();
  maybeShowFreedomOverlay(t, free);
}

function renderCharts() {
  const t = totals();
  const chartLayout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', color: '#f5f7ff' },
    margin: { l: 36, r: 14, t: 18, b: 34 }
  };

  Plotly.newPlot('cashflowChart', [{
    x: ['Passive Income', 'Expenses', 'Active Income', 'Cashflow'],
    y: [t.passiveIncome, t.totalExpenses, t.activeIncome, t.cashflow],
    type: 'bar',
    marker: { color: ['#61d8ff', '#ff5a6b', '#8f67ff', '#28c76f'], line: { width: 0 } },
    text: [currency(t.passiveIncome), currency(t.totalExpenses), currency(t.activeIncome), currency(t.cashflow)],
    textposition: 'outside',
    cliponaxis: false,
    hovertemplate: '%{x}<br>%{text}<extra></extra>'
  }], {
    ...chartLayout,
    yaxis: { gridcolor: 'rgba(255,255,255,0.08)', zerolinecolor: 'rgba(255,255,255,0.08)' },
    xaxis: { tickfont: { size: 11 } }
  }, { displayModeBar: false, responsive: true });

  Plotly.newPlot('balanceChart', [{
    labels: ['Assets', 'Liabilities'],
    values: [Math.max(t.assetsValue, 0.001), Math.max(t.liabilitiesValue, 0.001)],
    type: 'pie',
    hole: .62,
    textinfo: 'label+percent',
    marker: { colors: ['#61d8ff', '#ff5a6b'] },
    hovertemplate: '%{label}<br>%{value:$,.0f}<extra></extra>'
  }], {
    ...chartLayout,
    showlegend: false
  }, { displayModeBar: false, responsive: true });
}

function buildConfetti() {
  const layer = $('confettiLayer');
  layer.innerHTML = '';
  const colors = ['#61d8ff', '#8f67ff', '#ffcc66', '#28c76f', '#ff5a6b'];
  for (let i = 0; i < 60; i += 1) {
    const conf = document.createElement('div');
    conf.className = 'confetti';
    conf.style.left = `${Math.random() * 100}%`;
    conf.style.background = colors[i % colors.length];
    conf.style.animationDelay = `${Math.random() * 0.6}s`;
    conf.style.transform = `translateY(-10px) rotate(${Math.random() * 180}deg)`;
    layer.appendChild(conf);
  }
}

function maybeShowFreedomOverlay(t, free) {
  if (!free || state.milestones.freedomShown) return;
  state.milestones.freedomShown = true;
  saveState();
  $('overlayPassive').textContent = currency(t.passiveIncome);
  $('overlayExpenses').textContent = currency(t.totalExpenses);
  $('overlayCashflow').textContent = currency(t.cashflow);
  $('freedomOverlayText').textContent = `Your passive income now covers your monthly expenses by ${currency(Math.abs(t.freedomGap))}. Now grow into Cashflow Day.`;
  buildConfetti();
  $('freedomOverlay').classList.add('show');
  $('freedomOverlay').setAttribute('aria-hidden', 'false');
}

function closeFreedomOverlay() {
  $('freedomOverlay').classList.remove('show');
  $('freedomOverlay').setAttribute('aria-hidden', 'true');
}

function persistAndRender() {
  saveState();
  renderAllTables();
  updateMetrics();
  updateDealQuickCoach();
  renderCharts();
}

function addFormHandler(formId, handler) {
  $(formId).addEventListener('submit', (e) => {
    e.preventDefault();
    handler();
    e.target.reset();
    updateDealQuickCoach();
  });
}

function loadDemo() {
  state = {
    profile: { playerName: 'Faizan', profession: 'Designer / Founder', dreamGoal: 'Build freedom and empire' },
    incomes: [
      { id: uuid(), name: 'Design clients', type: 'active', amount: 4500 },
      { id: uuid(), name: 'Wallpapers membership', type: 'passive', amount: 350 },
      { id: uuid(), name: 'Investment dividends', type: 'passive', amount: 120 }
    ],
    expenses: [
      { id: uuid(), name: 'Housing', amount: 1200 },
      { id: uuid(), name: 'Food', amount: 500 },
      { id: uuid(), name: 'Transport', amount: 450 },
      { id: uuid(), name: 'Phone / subscriptions', amount: 180 }
    ],
    assets: [
      { id: uuid(), name: 'Emergency cash', value: 5000, cashflow: 0 },
      { id: uuid(), name: 'Brokerage account', value: 4200, cashflow: 40 },
      { id: uuid(), name: 'Digital product library', value: 3000, cashflow: 280 }
    ],
    liabilities: [
      { id: uuid(), name: 'Credit card', amount: 2000, payment: 120 },
      { id: uuid(), name: 'Laptop payment', amount: 1200, payment: 90 }
    ],
    deals: [
      { id: uuid(), name: 'New premium branding package', kind: 'income', cost: 0, monthly: 1200 },
      { id: uuid(), name: 'Template product bundle', kind: 'asset', cost: 800, monthly: 250 },
      { id: uuid(), name: 'Debt snowball payoff', kind: 'debt', cost: 500, monthly: 100 }
    ],
    milestones: { freedomShown: false }
  };
  renderProfile();
  persistAndRender();
}

function resetAll() {
  if (!confirm('Reset all your data?')) return;
  state = structuredClone(defaultState);
  renderProfile();
  persistAndRender();
}

function unlockApp() {
  sessionStorage.setItem(SESSION_KEY, 'yes');
  document.body.classList.add('unlocked');
  $('loginOverlay').style.display = 'none';
  $('loginOverlay').setAttribute('aria-hidden', 'true');
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  document.body.classList.remove('unlocked');
  $('loginOverlay').style.display = 'grid';
  $('loginOverlay').setAttribute('aria-hidden', 'false');
}

function bindAuth() {
  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('loginUsername').value.trim();
    const p = $('loginPassword').value;
    if (u === AUTH_USERNAME && p === AUTH_PASSWORD) {
      $('loginError').textContent = '';
      unlockApp();
      return;
    }
    $('loginError').textContent = 'Wrong username or password.';
  });
  $('logoutBtn').addEventListener('click', lockApp);
  if (sessionStorage.getItem(SESSION_KEY) === 'yes') unlockApp();
}

function bindDealInputs() {
  ['dealKind', 'dealCost', 'dealMonthly'].forEach((id) => $(id).addEventListener('input', updateDealQuickCoach));
}

function init() {
  renderProfile();
  bindProfile();
  bindAuth();
  bindDealInputs();

  addFormHandler('incomeForm', () => {
    state.incomes.push({ id: uuid(), name: $('incomeName').value, type: $('incomeType').value, amount: Number($('incomeAmount').value || 0) });
    persistAndRender();
  });

  addFormHandler('expenseForm', () => {
    state.expenses.push({ id: uuid(), name: $('expenseName').value, amount: Number($('expenseAmount').value || 0) });
    persistAndRender();
  });

  addFormHandler('assetForm', () => {
    state.assets.push({ id: uuid(), name: $('assetName').value, value: Number($('assetValue').value || 0), cashflow: Number($('assetCashflow').value || 0) });
    persistAndRender();
  });

  addFormHandler('liabilityForm', () => {
    state.liabilities.push({ id: uuid(), name: $('liabilityName').value, amount: Number($('liabilityAmount').value || 0), payment: Number($('liabilityPayment').value || 0) });
    persistAndRender();
  });

  addFormHandler('dealForm', () => {
    state.deals.push({ id: uuid(), name: $('dealName').value, kind: $('dealKind').value, cost: Number($('dealCost').value || 0), monthly: Number($('dealMonthly').value || 0) });
    persistAndRender();
  });

  $('loadDemoBtn').addEventListener('click', loadDemo);
  $('resetBtn').addEventListener('click', resetAll);
  $('closeFreedomOverlay').addEventListener('click', closeFreedomOverlay);
  $('freedomOverlay').addEventListener('click', (e) => { if (e.target.id === 'freedomOverlay') closeFreedomOverlay(); });

  persistAndRender();
}

init();
