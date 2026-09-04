const slug = window.location.pathname.split('/').filter(Boolean)[0] || '';
const API_BASE = `/api/business/${slug}`;

const state = {
  business: null,
  serviceId: null,
  date: null,
  time: null,
};

async function loadConfig() {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) {
    document.getElementById('page').innerHTML = '<p class="muted" style="padding:64px 24px;">This booking page could not be found.</p>';
    return;
  }
  state.business = await res.json();
  renderIntro();
  renderServiceOptions();

  const params = new URLSearchParams(window.location.search);
  if (params.get('cancelled')) {
    const banner = document.getElementById('statusBanner');
    banner.hidden = false;
    banner.textContent = 'Payment cancelled — no charge was made. Pick a time to try again.';
    banner.style.background = '#B9741F';
  }
}

function renderIntro() {
  const b = state.business;
  document.title = `Book online — ${b.name}`;
  document.getElementById('businessName').textContent = b.name;
  document.getElementById('businessTagline').textContent = b.tagline;
  document.getElementById('businessAbout').textContent = b.about;

  const list = document.getElementById('servicesList');
  list.innerHTML = b.services.map(s => `
    <div class="service-card">
      <span class="price">£${s.priceGBP}</span>
      <h3>${s.name}</h3>
      <p>${s.description} · ${s.durationMinutes} min</p>
    </div>
  `).join('');
}

function renderServiceOptions() {
  const wrap = document.getElementById('serviceOptions');
  wrap.innerHTML = state.business.services.map(s => `
    <div class="option-row" data-id="${s.id}">
      <span>${s.name}</span>
      <span>£${s.priceGBP}</span>
    </div>
  `).join('');

  wrap.querySelectorAll('.option-row').forEach(row => {
    row.addEventListener('click', () => {
      wrap.querySelectorAll('.option-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      state.serviceId = Number(row.dataset.id);
      document.getElementById('toStep2').disabled = false;
    });
  });
}

function goToStep(n) {
  document.getElementById('step-service').hidden = n !== 1;
  document.getElementById('step-time').hidden = n !== 2;
  document.getElementById('step-details').hidden = n !== 3;
  document.getElementById('stepLabel').textContent = `Step ${n} of 3`;
  if (n === 3) renderSummary();
}

document.getElementById('toStep2').addEventListener('click', () => goToStep(2));
document.getElementById('backTo1').addEventListener('click', () => goToStep(1));
document.getElementById('backTo2').addEventListener('click', () => goToStep(2));

document.getElementById('dateInput').addEventListener('change', async (e) => {
  state.date = e.target.value;
  state.time = null;
  document.getElementById('toStep3').disabled = true;
  const slotsWrap = document.getElementById('slots');
  slotsWrap.innerHTML = '<p class="muted">Loading availability…</p>';

  const res = await fetch(`${API_BASE}/availability?date=${state.date}`);
  const data = await res.json();

  if (!data.slots.length) {
    slotsWrap.innerHTML = '<p class="muted">No availability that day. Try another date.</p>';
    return;
  }

  slotsWrap.innerHTML = data.slots.map(t => `<button class="slot-btn" data-time="${t}">${t}</button>`).join('');
  slotsWrap.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      slotsWrap.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.time = btn.dataset.time;
      document.getElementById('toStep3').disabled = false;
    });
  });
});

document.getElementById('toStep3').addEventListener('click', () => goToStep(3));

// Set min date to today
document.getElementById('dateInput').min = new Date().toISOString().split('T')[0];

function renderSummary() {
  const service = state.business.services.find(s => s.id === state.serviceId);
  document.getElementById('summary').innerHTML = `
    <div><strong>${service.name}</strong> — £${service.priceGBP}</div>
    <div>${state.date} at ${state.time}</div>
  `;
}

document.getElementById('payButton').addEventListener('click', async () => {
  const name = document.getElementById('nameInput').value.trim();
  const email = document.getElementById('emailInput').value.trim();
  const phone = document.getElementById('phoneInput').value.trim();
  const notes = document.getElementById('notesInput').value.trim();
  const errorEl = document.getElementById('formError');

  if (!name || !email || !phone) {
    errorEl.hidden = false;
    errorEl.textContent = 'Please add your name, email, and phone number to continue.';
    return;
  }
  errorEl.hidden = true;

  const payButton = document.getElementById('payButton');
  payButton.disabled = true;
  payButton.textContent = 'Redirecting to secure payment…';

  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: state.serviceId,
        date: state.date,
        time: state.time,
        name, email, phone, notes,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.hidden = false;
      errorEl.textContent = data.error || 'Something went wrong. Please try again.';
      payButton.disabled = false;
      payButton.textContent = 'Confirm and pay';
      return;
    }

    if (data.demoMode) {
      window.location.href = `/success.html?booking=${data.bookingId}&business=${slug}`;
    } else {
      window.location.href = data.checkoutUrl;
    }
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = 'Network error. Please try again.';
    payButton.disabled = false;
    payButton.textContent = 'Confirm and pay';
  }
});

loadConfig();
