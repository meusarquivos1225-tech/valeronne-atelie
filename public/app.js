const state = {
  salon: {},
  categories: [],
  services: [],
  specialists: [],
  activeCategory: 'all',
  selectedServiceId: '',
  selectedSpecialistId: '',
  selectedDate: '',
  selectedTime: '',
  slots: []
};

function formatDateBr(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getTomorrowIso() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().split('T')[0];
}

function formatPhoneMask(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

async function initApp() {
  const defaultDate = getTomorrowIso();
  state.selectedDate = defaultDate;

  const quickDate = document.getElementById('quick-date-input');
  const bookDate = document.getElementById('book-date');
  if (quickDate) {
    quickDate.min = new Date().toISOString().split('T')[0];
    quickDate.value = defaultDate;
  }
  if (bookDate) {
    bookDate.min = new Date().toISOString().split('T')[0];
    bookDate.value = defaultDate;
  }

  try {
    const res = await fetch('/api/catalog');
    const data = await res.json();
    state.salon = data.salon || {};
    state.categories = data.categories || [];
    state.services = data.services || [];
    state.specialists = data.specialists || [];

    if (state.services.length > 0) {
      state.selectedServiceId = state.services[0].id;
    }
    if (state.specialists.length > 0) {
      state.selectedSpecialistId = state.specialists[0].id;
    }

    const instEl = document.getElementById('sum-instance-name');
    if (instEl && data.evolutionInstance) {
      instEl.textContent = data.evolutionInstance;
    }

    renderPillars();
    renderServicesMenu();
    renderSpecialists();
    populateBookingSelects();
    await loadAvailableSlots();
    updateBookingSummary();
  } catch (err) {
    console.error('Erro ao carregar catálogo Valeronne:', err);
  }

  setupEventListeners();
}

function renderPillars() {
  const grid = document.getElementById('pillars-grid');
  if (!grid) return;
  grid.innerHTML = state.categories
    .map(
      (cat) => `
      <article class="pillar-card">
        <div class="pillar-img-wrap">
          <img src="${cat.image}" alt="${cat.name}" loading="lazy" />
        </div>
        <div class="pillar-body">
          <div>
            <h3>${cat.name}</h3>
            <p>${cat.tagline}</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="filterByCategoryAndScroll('${cat.id}')">
            Ver Rituais & Valores →
          </button>
        </div>
      </article>
    `
    )
    .join('');
}

window.filterByCategoryAndScroll = function (catId) {
  state.activeCategory = catId;
  document.querySelectorAll('#category-tabs .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.category === catId);
  });
  renderServicesMenu();
  const menuEl = document.getElementById('menu-valores');
  if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
};

function renderServicesMenu() {
  const grid = document.getElementById('services-menu-grid');
  if (!grid) return;

  const filtered =
    state.activeCategory === 'all'
      ? state.services
      : state.services.filter((s) => s.categoryId === state.activeCategory);

  grid.innerHTML = filtered
    .map(
      (srv) => `
      <div class="service-item-card">
        <div>
          <div class="service-top">
            <h3 class="service-title">${srv.name}</h3>
            <span class="service-price">R$ ${srv.price}</span>
          </div>
          <p class="service-desc">${srv.description}</p>
        </div>
        <div class="service-footer">
          <span class="service-duration">⏱ Duração: ${srv.durationMinutes} min</span>
          <button type="button" class="btn btn-gold btn-sm" onclick="selectServiceAndBook('${srv.id}')">
            Agendar este Ritual
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

window.selectServiceAndBook = function (serviceId) {
  state.selectedServiceId = serviceId;
  const bookService = document.getElementById('book-service');
  if (bookService) bookService.value = serviceId;
  updateBookingSummary();
  const sec = document.getElementById('agendamento');
  if (sec) sec.scrollIntoView({ behavior: 'smooth' });
};

function renderSpecialists() {
  const grid = document.getElementById('specialists-grid');
  if (!grid) return;
  grid.innerHTML = state.specialists
    .map(
      (sp) => `
      <div class="specialist-card">
        <div class="specialist-avatar">${sp.avatarInitials}</div>
        <h3>${sp.name}</h3>
        <div class="specialist-role">${sp.role}</div>
        <p class="specialist-spec">${sp.specialty}</p>
      </div>
    `
    )
    .join('');
}

function populateBookingSelects() {
  const quickSelect = document.getElementById('quick-service-select');
  const bookService = document.getElementById('book-service');
  const bookSpecialist = document.getElementById('book-specialist');

  const optionsHtml = state.services
    .map((s) => `<option value="${s.id}">${s.name} — R$ ${s.price} (${s.durationMinutes} min)</option>`)
    .join('');

  if (quickSelect) quickSelect.innerHTML = optionsHtml;
  if (bookService) {
    bookService.innerHTML = optionsHtml;
    bookService.value = state.selectedServiceId;
  }

  if (bookSpecialist) {
    bookSpecialist.innerHTML = state.specialists
      .map((sp) => `<option value="${sp.id}">${sp.name} — ${sp.role}</option>`)
      .join('');
    bookSpecialist.value = state.selectedSpecialistId;
  }
}

async function loadAvailableSlots() {
  const dateLabel = document.getElementById('slots-date-label');
  if (dateLabel) dateLabel.textContent = formatDateBr(state.selectedDate);

  const res = await fetch(
    `/api/availability?date=${encodeURIComponent(state.selectedDate)}&specialistId=${encodeURIComponent(
      state.selectedSpecialistId
    )}`
  );
  const data = await res.json();
  state.slots = data.slots || [];

  // Se o horário selecionado não estiver disponível, escolhe o primeiro livre
  const currentAvailable = state.slots.find((s) => s.time === state.selectedTime && s.available);
  if (!currentAvailable) {
    const firstOpen = state.slots.find((s) => s.available);
    state.selectedTime = firstOpen ? firstOpen.time : '';
  }

  const timeInput = document.getElementById('book-time-selected');
  if (timeInput) timeInput.value = state.selectedTime ? `${state.selectedTime}h` : '';

  renderSlotsGrid();
  updateBookingSummary();
}

function renderSlotsGrid() {
  const grid = document.getElementById('slots-grid');
  if (!grid) return;

  grid.innerHTML = state.slots
    .map(
      (slot) => `
      <button
        type="button"
        class="slot-btn ${slot.time === state.selectedTime ? 'selected' : ''}"
        ${!slot.available ? 'disabled title="Horário já reservado"' : ''}
        onclick="chooseSlot('${slot.time}')"
      >
        ${slot.time}
      </button>
    `
    )
    .join('');
}

window.chooseSlot = function (time) {
  state.selectedTime = time;
  const timeInput = document.getElementById('book-time-selected');
  if (timeInput) timeInput.value = `${time}h`;
  renderSlotsGrid();
  updateBookingSummary();
};

function updateBookingSummary() {
  const srv = state.services.find((s) => s.id === state.selectedServiceId);
  const sp = state.specialists.find((s) => s.id === state.selectedSpecialistId);

  const elService = document.getElementById('sum-service');
  const elDuration = document.getElementById('sum-duration');
  const elSpec = document.getElementById('sum-specialist');
  const elDateTime = document.getElementById('sum-datetime');
  const elPrice = document.getElementById('sum-price');

  if (elService) elService.textContent = srv ? srv.name : '—';
  if (elDuration) elDuration.textContent = srv ? `${srv.durationMinutes} minutos` : '—';
  if (elSpec) elSpec.textContent = sp ? sp.name : '—';
  if (elDateTime) {
    elDateTime.textContent = state.selectedDate
      ? `${formatDateBr(state.selectedDate)} às ${state.selectedTime || '--:--'}`
      : '—';
  }
  if (elPrice) elPrice.textContent = srv ? `R$ ${srv.price}` : 'R$ 0';
}

function setupEventListeners() {
  // Tabs de categoria
  document.querySelectorAll('#category-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.category;
      document.querySelectorAll('#category-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderServicesMenu();
    });
  });

  // Quick booking form no Hero
  const quickForm = document.getElementById('quick-book-form');
  if (quickForm) {
    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const srvId = document.getElementById('quick-service-select').value;
      const dateVal = document.getElementById('quick-date-input').value;
      state.selectedServiceId = srvId;
      if (dateVal) state.selectedDate = dateVal;

      document.getElementById('book-service').value = srvId;
      document.getElementById('book-date').value = state.selectedDate;
      await loadAvailableSlots();
      document.getElementById('agendamento').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Mudanças nos campos do formulário de agendamento
  const bookService = document.getElementById('book-service');
  const bookSpecialist = document.getElementById('book-specialist');
  const bookDate = document.getElementById('book-date');
  const bookPhone = document.getElementById('book-phone');

  if (bookService) {
    bookService.addEventListener('change', (e) => {
      state.selectedServiceId = e.target.value;
      updateBookingSummary();
    });
  }

  if (bookSpecialist) {
    bookSpecialist.addEventListener('change', async (e) => {
      state.selectedSpecialistId = e.target.value;
      await loadAvailableSlots();
    });
  }

  if (bookDate) {
    bookDate.addEventListener('change', async (e) => {
      state.selectedDate = e.target.value;
      await loadAvailableSlots();
    });
  }

  if (bookPhone) {
    bookPhone.addEventListener('input', (e) => {
      e.target.value = formatPhoneMask(e.target.value);
    });
  }

  // Submissão do agendamento
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-booking');
      const resultContainer = document.getElementById('booking-result-container');

      const payload = {
        serviceId: state.selectedServiceId,
        specialistId: state.selectedSpecialistId,
        date: state.selectedDate,
        time: state.selectedTime,
        clientName: document.getElementById('book-name').value,
        clientPhone: document.getElementById('book-phone').value,
        clientEmail: document.getElementById('book-email').value,
        notes: document.getElementById('book-notes').value
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processando reserva e disparando WhatsApp Evolution...';

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          alert(data.error || 'Não foi possível concluir o agendamento.');
        } else {
          const bk = data.booking;
          const wa = data.whatsapp || {};
          const dispatchBadge = wa.simulated
            ? '⚡ Mensagem processada (Pronta para disparo real assim que a API Key da Evolution Looma for salva no painel)'
            : wa.ok
            ? '✅ Enviada com sucesso via Evolution API (Servidor Looma)'
            : '⚠️ Agendamento salvo (verifique a conexão da instância Evolution)';

          resultContainer.style.display = 'block';
          resultContainer.innerHTML = `
            <div class="booking-result-banner">
              <h4 style="font-family:var(--font-serif); font-size:1.45rem; margin-bottom:0.35rem;">
                ✨ Reserva Confirmada! Protocolo <span style="font-family:var(--font-mono);">#${bk.protocol}</span>
              </h4>
              <p style="font-size:0.88rem; margin-bottom:0.4rem;">
                <strong>Status Evolution API (Looma):</strong> ${dispatchBadge}
              </p>
              <p style="font-size:0.82rem; opacity:0.85;">
                Mensagem automática enviada para <strong>+${bk.clientPhone}</strong>:
              </p>
              <pre>${data.confirmationMessage}</pre>
            </div>
          `;
          await loadAvailableSlots();
        }
      } catch (err) {
        alert('Erro de conexão ao registrar agendamento.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Confirmar Agendamento & Enviar no WhatsApp';
      }
    });
  }

  // Simulador WhatsApp Evolution API
  const waForm = document.getElementById('wa-sim-form');
  const waInput = document.getElementById('wa-sim-input');
  document.querySelectorAll('.wa-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      sendSimulatedWhatsApp(chip.dataset.msg);
    });
  });

  if (waForm) {
    waForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!waInput.value.trim()) return;
      sendSimulatedWhatsApp(waInput.value.trim());
      waInput.value = '';
    });
  }

  // Modal Admin (Looma & Cloudflare)
  const openBtns = [
    'btn-open-admin',
    'btn-open-looma-status',
    'btn-open-cf-status',
    'btn-open-admin-from-section',
    'btn-footer-admin'
  ];
  openBtns.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        openAdminModal(id === 'btn-open-cf-status' ? 'tab-panel-cloudflare' : null);
      });
    }
  });

  const closeBtn = document.getElementById('btn-close-admin');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('admin-modal-backdrop').classList.remove('open');
    });
  }

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAdminTab(btn.dataset.tab);
    });
  });

  const refreshBtn = document.getElementById('btn-refresh-admin');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadAdminOverview(true));
  }

  // Salvar Evolution API Settings
  const evForm = document.getElementById('form-evolution-settings');
  if (evForm) {
    evForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveEvolutionSettings(false);
    });
  }

  const regWebhookBtn = document.getElementById('btn-register-webhook');
  if (regWebhookBtn) {
    regWebhookBtn.addEventListener('click', async () => {
      await saveEvolutionSettings(true);
    });
  }

  // Provisionar Subdomínio Cloudflare valeronne.loomadev
  const cfForm = document.getElementById('form-cloudflare-provision');
  if (cfForm) {
    cfForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await provisionCloudflareNow();
    });
  }
}

async function sendSimulatedWhatsApp(text) {
  const container = document.getElementById('wa-messages');
  if (!container) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'wa-bubble user';
  userBubble.textContent = text;
  container.appendChild(userBubble);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/evolution/simulate-incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('book-name')?.value || 'Beatriz Monteiro',
        phone: document.getElementById('book-phone')?.value || '5511991234567',
        text
      })
    });
    const data = await res.json();
    const botBubble = document.createElement('div');
    botBubble.className = 'wa-bubble bot';
    botBubble.textContent = data.replyText || 'Resposta automática processada.';
    container.appendChild(botBubble);
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

function switchAdminTab(panelId) {
  document.querySelectorAll('.admin-tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === panelId);
  });
  document.querySelectorAll('.admin-panel').forEach((p) => {
    p.classList.toggle('active', p.id === panelId);
  });
}

async function openAdminModal(initialTab) {
  const modal = document.getElementById('admin-modal-backdrop');
  if (modal) modal.classList.add('open');
  if (initialTab) switchAdminTab(initialTab);
  await loadAdminOverview(false);
}

async function loadAdminOverview(checkLive = false) {
  try {
    const res = await fetch(`/api/admin/overview?checkLive=${checkLive ? '1' : '0'}`);
    const data = await res.json();
    if (!data.ok) return;

    const countEl = document.getElementById('adm-bookings-count');
    if (countEl) countEl.textContent = (data.bookings || []).length;

    const tbody = document.getElementById('admin-bookings-tbody');
    if (tbody) {
      tbody.innerHTML = (data.bookings || [])
        .map(
          (b) => `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:600;">#${b.protocol}</td>
            <td>
              <strong>${b.clientName}</strong><br/>
              <span style="font-size:0.78rem; color:var(--text-secondary);">+${b.clientPhone}</span>
            </td>
            <td>${b.serviceName}<br/><span style="font-size:0.76rem; color:var(--gold-deep);">R$ ${b.servicePrice}</span></td>
            <td>${b.specialistName}</td>
            <td>${formatDateBr(b.date)} às <strong>${b.time}</strong></td>
            <td><span style="text-transform:uppercase; font-size:0.75rem; font-weight:600;">${b.status}</span></td>
            <td style="font-size:0.78rem;">${b.whatsappStatus || 'enviado'}</td>
            <td>
              ${
                b.status !== 'cancelado'
                  ? `<button type="button" class="btn btn-outline btn-sm" onclick="changeBookingStatus('${b.id}', 'cancelado')">Cancelar</button>`
                  : `<button type="button" class="btn btn-outline btn-sm" onclick="changeBookingStatus('${b.id}', 'confirmado')">Reativar</button>`
              }
            </td>
          </tr>
        `
        )
        .join('');
    }

    const whTbody = document.getElementById('admin-webhooks-tbody');
    if (whTbody) {
      whTbody.innerHTML = (data.webhookLogs || [])
        .slice(0, 12)
        .map(
          (w) => `
          <tr>
            <td style="font-size:0.76rem;">${new Date(w.timestamp).toLocaleTimeString('pt-BR')}</td>
            <td><strong>${w.pushName || 'Cliente'}</strong><br/><span style="font-size:0.73rem;">${w.remoteJid}</span></td>
            <td style="max-width:260px;">${w.incomingText}</td>
            <td><code>${w.intentDetected}</code></td>
            <td>${w.evolutionDispatched ? '✅ Enviado Evolution' : '⚡ Auto-Reply Ativo'}</td>
          </tr>
        `
        )
        .join('');
    }

    // Preenche campos Evolution API
    const ev = data.settings?.evolution || {};
    document.getElementById('ev-base-url').value = ev.baseUrl || '';
    document.getElementById('ev-instance').value = ev.instanceName || 'valeronne';
    document.getElementById('ev-api-key').value = ev.apiKeyMasked || '';
    document.getElementById('ev-salon-phone').value = ev.salonNotificationPhone || '';

    // Preenche campos Cloudflare
    const cf = data.settings?.cloudflare || {};
    document.getElementById('cf-subdomain').value = cf.subdomain || 'valeronne';
    document.getElementById('cf-root-domain').value = cf.rootDomain || 'loomadev.com';
    document.getElementById('cf-record-type').value = cf.recordType || 'A';
    document.getElementById('cf-target').value = cf.targetContent || '';
    document.getElementById('cf-zone-id').value = cf.zoneId || '';
    if (cf.apiTokenMasked) {
      document.getElementById('cf-api-token').value = cf.apiTokenMasked;
    }

    const webhookInput = document.getElementById('ev-webhook-url');
    if (webhookInput && cf.fullHostname) {
      webhookInput.value = `https://${cf.fullHostname}/api/webhook/evolution`;
    }
  } catch (err) {
    console.error('Erro ao carregar painel admin:', err);
  }
}

window.changeBookingStatus = async function (id, status) {
  await fetch(`/api/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await loadAdminOverview(false);
  await loadAvailableSlots();
};

async function saveEvolutionSettings(registerWebhookNow) {
  const feedback = document.getElementById('ev-save-feedback');
  if (feedback) feedback.textContent = 'Salvando e verificando conexão com o servidor Looma...';

  const payload = {
    registerWebhookNow,
    webhookUrl: document.getElementById('ev-webhook-url').value,
    evolution: {
      baseUrl: document.getElementById('ev-base-url').value,
      instanceName: document.getElementById('ev-instance').value,
      apiKey: document.getElementById('ev-api-key').value,
      salonNotificationPhone: document.getElementById('ev-salon-phone').value
    }
  };

  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (feedback) {
    const st = data.evolutionStatus || {};
    feedback.innerHTML = st.connected
      ? `✅ <strong>Conectado à instância "${payload.evolution.instanceName}" no servidor Looma!</strong> (${st.endpoint})`
      : `ℹ️ Configurações salvas! Status da instância: <code>${st.state || 'aguardando conexão'}</code>. ${
          st.message || ''
        }`;
  }
}

async function provisionCloudflareNow() {
  const resultEl = document.getElementById('cf-provision-result');
  const btn = document.getElementById('btn-provision-cloudflare');
  btn.disabled = true;
  if (resultEl) resultEl.innerHTML = '<em>Conectando à API v4 da Cloudflare...</em>';

  const payload = {
    subdomain: document.getElementById('cf-subdomain').value,
    rootDomain: document.getElementById('cf-root-domain').value,
    recordType: document.getElementById('cf-record-type').value,
    targetContent: document.getElementById('cf-target').value,
    apiToken: document.getElementById('cf-api-token').value,
    zoneId: document.getElementById('cf-zone-id').value,
    proxied: true
  };

  try {
    const res = await fetch('/api/cloudflare/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.innerHTML = `
        <div class="booking-result-banner" style="margin-top:0;">
          <strong>✅ Subdomínio <code>${data.fqdn}</code> (${data.action === 'updated' ? 'atualizado' : 'criado'}) com sucesso na Cloudflare!</strong><br/>
          <span>Tipo: <code>${data.recordType}</code> → Destino: <code>${data.content}</code> | Proxy SSL Cloudflare: Ativo (Orange Cloud)</span>
        </div>
      `;
    } else {
      resultEl.innerHTML = `
        <div style="padding:1rem; background:#FDF4E7; border:1px solid #9C6B26; border-radius:6px; color:#5E3D0E; font-size:0.86rem;">
          <strong>⚠️ Atenção:</strong> ${data.error || data.message || 'Verifique o Token da API Cloudflare e o IP/Destino.'}
        </div>
      `;
    }
  } catch (err) {
    resultEl.innerHTML = `<span style="color:var(--status-danger);">Erro ao comunicar com o servidor.</span>`;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', initApp);
