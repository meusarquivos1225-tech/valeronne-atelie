const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readDb, writeDb, generateProtocol } = require('./store');
const {
  normalizePhone,
  formatDateBr,
  renderTemplate,
  sendWhatsAppText,
  checkEvolutionConnection,
  registerEvolutionWebhook,
  buildAutoReplyForMessage
} = require('./evolutionService');
const { provisionCloudflareSubdomain } = require('./cloudflareService');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const ALL_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'
];

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function maskSecret(secret) {
  if (!secret) return '';
  const str = String(secret);
  if (str.length <= 8) return '••••••••';
  return str.slice(0, 4) + '••••••••' + str.slice(-4);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
      });
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Healthcheck
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'valeronne-atelie',
        subdomain: 'valeronne.loomadev',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Catálogo Público
    if (pathname === '/api/catalog' && req.method === 'GET') {
      const db = readDb();
      return sendJson(res, 200, {
        salon: db.salon,
        categories: db.categories,
        services: db.services,
        specialists: db.specialists,
        evolutionConfigured: Boolean(db.settings?.evolution?.apiKey && db.settings?.evolution?.baseUrl),
        evolutionInstance: db.settings?.evolution?.instanceName || 'valeronne',
        cloudflareHostname: db.settings?.cloudflare?.fullHostname || 'valeronne.loomadev.com'
      });
    }

    // 3. Disponibilidade de Horários por Data e Especialista
    if (pathname === '/api/availability' && req.method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
      const specialistId = parsedUrl.searchParams.get('specialistId') || '';
      const db = readDb();

      const occupied = new Set(
        (db.bookings || [])
          .filter(
            (b) =>
              b.date === date &&
              b.status !== 'cancelado' &&
              (!specialistId || b.specialistId === specialistId)
          )
          .map((b) => b.time)
      );

      const slots = ALL_SLOTS.map((time) => ({
        time,
        available: !occupied.has(time)
      }));

      return sendJson(res, 200, { date, specialistId, slots });
    }

    // 4. Criar Agendamento + Disparo Automático via Evolution API (Servidor Looma)
    if (pathname === '/api/bookings' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const {
        clientName,
        clientPhone,
        clientEmail,
        serviceId,
        specialistId,
        date,
        time,
        notes
      } = body;

      if (!clientName || !clientPhone || !serviceId || !date || !time) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Por favor, preencha nome, WhatsApp, serviço, data e horário.'
        });
      }

      const db = readDb();
      const service = db.services.find((s) => s.id === serviceId);
      if (!service) {
        return sendJson(res, 404, { ok: false, error: 'Serviço selecionado não encontrado.' });
      }

      const specialist =
        db.specialists.find((sp) => sp.id === specialistId) || db.specialists[0];

      // Verifica conflito de horário
      const conflict = (db.bookings || []).find(
        (b) =>
          b.date === date &&
          b.time === time &&
          b.specialistId === specialist.id &&
          b.status !== 'cancelado'
      );

      if (conflict) {
        return sendJson(res, 409, {
          ok: false,
          error: `O horário das ${time} em ${formatDateBr(date)} com ${specialist.name} já está reservado. Escolha outro horário.`
        });
      }

      const protocol = generateProtocol();
      const normalizedPhone = normalizePhone(clientPhone);

      const confirmationMessage = renderTemplate(
        db.settings.evolution.confirmationTemplate,
        {
          clientName: String(clientName).trim(),
          protocol,
          serviceName: service.name,
          specialistName: specialist.name,
          dateFormatted: formatDateBr(date),
          time,
          servicePrice: service.price,
          salonAddress: db.salon.address
        }
      );

      // Dispara mensagem de confirmação via Evolution API
      let whatsappResult = { ok: false, simulated: true };
      if (db.settings.evolution.sendBookingConfirmation !== false) {
        whatsappResult = await sendWhatsAppText({
          phone: normalizedPhone,
          text: confirmationMessage,
          evolutionConfig: db.settings.evolution
        });
      }

      // Notifica também o número da recepção do salão se configurado
      if (db.settings.evolution.salonNotificationPhone) {
        const salonNotice =
          `🔔 *Novo Agendamento Site Valeronne*\n` +
          `• *Protocolo:* #${protocol}\n` +
          `• *Cliente:* ${clientName} (${normalizedPhone})\n` +
          `• *Experiência:* ${service.name} (R$ ${service.price})\n` +
          `• *Especialista:* ${specialist.name}\n` +
          `• *Data/Hora:* ${formatDateBr(date)} às ${time}\n` +
          (notes ? `• *Obs:* ${notes}` : '');
        sendWhatsAppText({
          phone: db.settings.evolution.salonNotificationPhone,
          text: salonNotice,
          evolutionConfig: db.settings.evolution
        }).catch(() => {});
      }

      const newBooking = {
        id: 'bk-' + crypto.randomUUID().slice(0, 8),
        protocol,
        clientName: String(clientName).trim(),
        clientPhone: normalizedPhone,
        clientEmail: String(clientEmail || '').trim(),
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: service.price,
        durationMinutes: service.durationMinutes,
        specialistId: specialist.id,
        specialistName: specialist.name,
        date,
        time,
        notes: String(notes || '').trim(),
        status: 'confirmado',
        whatsappStatus: whatsappResult.simulated
          ? 'simulado_pronto'
          : whatsappResult.ok
          ? 'enviado_evolution'
          : 'erro_envio',
        whatsappMessage: confirmationMessage,
        whatsappDispatchDetail: whatsappResult,
        createdAt: new Date().toISOString()
      };

      db.bookings.unshift(newBooking);

      // Registra no log de automação WhatsApp
      db.webhookLogs.unshift({
        id: 'wh-' + crypto.randomUUID().slice(0, 8),
        timestamp: new Date().toISOString(),
        direction: 'outbound_booking',
        remoteJid: `${normalizedPhone}@s.whatsapp.net`,
        pushName: newBooking.clientName,
        incomingText: `[Agendamento no Site #${protocol}] ${service.name} - ${formatDateBr(date)} ${time}`,
        intentDetected: 'confirmacao_automatica_agendamento',
        autoReplyText: confirmationMessage,
        evolutionDispatched: Boolean(whatsappResult.ok && !whatsappResult.simulated),
        simulated: Boolean(whatsappResult.simulated)
      });

      writeDb(db);

      return sendJson(res, 201, {
        ok: true,
        booking: newBooking,
        whatsapp: whatsappResult,
        confirmationMessage
      });
    }

    // 5. Atualizar Status de Agendamento
    if (pathname.startsWith('/api/bookings/') && req.method === 'PATCH') {
      const bookingId = pathname.replace('/api/bookings/', '');
      const body = await parseJsonBody(req);
      const db = readDb();
      const booking = db.bookings.find((b) => b.id === bookingId || b.protocol === bookingId);
      if (!booking) {
        return sendJson(res, 404, { ok: false, error: 'Agendamento não encontrado.' });
      }
      if (body.status) booking.status = body.status;
      if (body.date) booking.date = body.date;
      if (body.time) booking.time = body.time;
      writeDb(db);
      return sendJson(res, 200, { ok: true, booking });
    }

    // 6. Webhook Oficial Evolution API (MESSAGES_UPSERT) para Resposta Automática
    if (pathname === '/api/webhook/evolution' && req.method === 'POST') {
      const payload = await parseJsonBody(req);
      const db = readDb();

      // Extrai dados do formato Evolution API v1 e v2
      const eventType = String(payload.event || payload.type || 'messages.upsert').toLowerCase();
      const msgData = payload.data?.message ? payload.data : payload.data?.messages?.[0] || payload;
      const key = msgData?.key || {};
      const fromMe = Boolean(key.fromMe);
      const remoteJid = String(key.remoteJid || payload.sender || '');

      // Ignora mensagens enviadas pelo próprio bot ou grupos
      if (fromMe || remoteJid.endsWith('@g.us')) {
        return sendJson(res, 200, { ok: true, ignored: true, reason: 'fromMe_or_group' });
      }

      const incomingText =
        msgData?.message?.conversation ||
        msgData?.message?.extendedTextMessage?.text ||
        msgData?.body ||
        payload?.text ||
        '';

      const pushName = msgData?.pushName || payload?.pushName || 'Cliente Valeronne';
      const senderPhone = remoteJid.replace(/@.*$/, '');

      if (!incomingText || !senderPhone) {
        return sendJson(res, 200, { ok: true, ignored: true, reason: 'no_text_or_sender' });
      }

      const autoReply = buildAutoReplyForMessage({
        incomingText,
        pushName,
        senderPhone,
        db
      });

      let dispatchResult = { ok: false, simulated: true };
      if (db.settings.evolution.autoReplyEnabled !== false) {
        dispatchResult = await sendWhatsAppText({
          phone: senderPhone,
          text: autoReply.replyText,
          evolutionConfig: db.settings.evolution
        });
      }

      const logEntry = {
        id: 'wh-' + crypto.randomUUID().slice(0, 8),
        timestamp: new Date().toISOString(),
        event: eventType,
        direction: 'inbound_and_reply',
        remoteJid: remoteJid || `${normalizePhone(senderPhone)}@s.whatsapp.net`,
        pushName,
        incomingText,
        intentDetected: autoReply.intent,
        autoReplyText: autoReply.replyText,
        evolutionDispatched: Boolean(dispatchResult.ok && !dispatchResult.simulated),
        simulated: Boolean(dispatchResult.simulated),
        dispatchResult
      };

      db.webhookLogs.unshift(logEntry);
      if (db.webhookLogs.length > 60) db.webhookLogs = db.webhookLogs.slice(0, 60);
      writeDb(db);

      return sendJson(res, 200, {
        ok: true,
        intent: autoReply.intent,
        replyText: autoReply.replyText,
        dispatch: dispatchResult,
        log: logEntry
      });
    }

    // 7. Simulador / Testador Interativo da Resposta Automática Evolution API
    if (pathname === '/api/evolution/simulate-incoming' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const senderPhone = normalizePhone(body.phone || '5511991234567');
      const pushName = String(body.name || 'Cliente Valeronne').trim();
      const incomingText = String(body.text || 'Olá, gostaria de agendar um horário').trim();
      const sendRealWhatsApp = Boolean(body.sendRealWhatsApp);

      const db = readDb();
      const autoReply = buildAutoReplyForMessage({
        incomingText,
        pushName,
        senderPhone,
        db
      });

      let dispatchResult = { ok: true, simulated: true };
      if (sendRealWhatsApp) {
        dispatchResult = await sendWhatsAppText({
          phone: senderPhone,
          text: autoReply.replyText,
          evolutionConfig: db.settings.evolution
        });
      }

      const logEntry = {
        id: 'wh-' + crypto.randomUUID().slice(0, 8),
        timestamp: new Date().toISOString(),
        direction: 'inbound_and_reply',
        remoteJid: `${senderPhone}@s.whatsapp.net`,
        pushName,
        incomingText,
        intentDetected: autoReply.intent,
        autoReplyText: autoReply.replyText,
        evolutionDispatched: Boolean(dispatchResult.ok && !dispatchResult.simulated),
        simulated: Boolean(dispatchResult.simulated)
      };

      db.webhookLogs.unshift(logEntry);
      writeDb(db);

      return sendJson(res, 200, {
        ok: true,
        intent: autoReply.intent,
        replyText: autoReply.replyText,
        dispatch: dispatchResult,
        log: logEntry
      });
    }

    // 7b. Criar Instância e Buscar QR Code na Evolution API (Padrão Looma)
    if (pathname === '/api/evolution/instance/create' && req.method === 'POST') {
      const db = readDb();
      const result = await createEvolutionInstance(db.settings.evolution);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/evolution/instance/qrcode' && req.method === 'GET') {
      const db = readDb();
      const result = await getEvolutionQRCode(db.settings.evolution);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 8. Visão Geral Administrativa (Agendamentos, Logs WhatsApp, Evolution API & Cloudflare)
    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      const db = readDb();
      const checkLive = parsedUrl.searchParams.get('checkLive') === '1';
      let evolutionStatus = {
        connected: false,
        configured: Boolean(db.settings.evolution.apiKey && db.settings.evolution.baseUrl),
        state: db.settings.evolution.apiKey ? 'configured' : 'awaiting_credentials'
      };

      if (checkLive && evolutionStatus.configured) {
        evolutionStatus = await checkEvolutionConnection(db.settings.evolution);
      }

      return sendJson(res, 200, {
        ok: true,
        bookings: db.bookings,
        webhookLogs: db.webhookLogs,
        evolutionStatus,
        settings: {
          evolution: {
            ...db.settings.evolution,
            apiKeyMasked: maskSecret(db.settings.evolution.apiKey),
            hasApiKey: Boolean(db.settings.evolution.apiKey)
          },
          cloudflare: {
            ...db.settings.cloudflare,
            apiTokenMasked: maskSecret(db.settings.cloudflare.apiToken),
            hasApiToken: Boolean(db.settings.cloudflare.apiToken)
          }
        }
      });
    }

    // 9. Salvar Configurações (Evolution API Looma & Cloudflare valeronne.loomadev)
    if (pathname === '/api/admin/settings' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const db = readDb();

      if (body.evolution) {
        const ev = body.evolution;
        if (ev.baseUrl !== undefined) db.settings.evolution.baseUrl = String(ev.baseUrl).trim();
        if (ev.apiKey !== undefined && !String(ev.apiKey).includes('••••')) {
          db.settings.evolution.apiKey = String(ev.apiKey).trim();
        }
        if (ev.instanceName !== undefined) {
          db.settings.evolution.instanceName = String(ev.instanceName).trim() || 'valeronne';
        }
        if (ev.salonNotificationPhone !== undefined) {
          db.settings.evolution.salonNotificationPhone = normalizePhone(ev.salonNotificationPhone);
        }
        if (ev.autoReplyEnabled !== undefined) {
          db.settings.evolution.autoReplyEnabled = Boolean(ev.autoReplyEnabled);
        }
        if (ev.sendBookingConfirmation !== undefined) {
          db.settings.evolution.sendBookingConfirmation = Boolean(ev.sendBookingConfirmation);
        }
        if (ev.confirmationTemplate !== undefined) {
          db.settings.evolution.confirmationTemplate = ev.confirmationTemplate;
        }
      }

      if (body.cloudflare) {
        const cf = body.cloudflare;
        if (cf.subdomain !== undefined) db.settings.cloudflare.subdomain = String(cf.subdomain).trim();
        if (cf.rootDomain !== undefined) db.settings.cloudflare.rootDomain = String(cf.rootDomain).trim();
        if (cf.zoneId !== undefined) db.settings.cloudflare.zoneId = String(cf.zoneId).trim();
        if (cf.apiToken !== undefined && !String(cf.apiToken).includes('••••')) {
          db.settings.cloudflare.apiToken = String(cf.apiToken).trim();
        }
        if (cf.recordType !== undefined) db.settings.cloudflare.recordType = String(cf.recordType).trim();
        if (cf.targetContent !== undefined) db.settings.cloudflare.targetContent = String(cf.targetContent).trim();
        if (cf.proxied !== undefined) db.settings.cloudflare.proxied = Boolean(cf.proxied);

        const cleanSub = db.settings.cloudflare.subdomain.replace(/\.$/, '').split('.')[0] || 'valeronne';
        const cleanRoot = db.settings.cloudflare.rootDomain.replace(/^valeronne\./i, '') || 'loomadev.com';
        db.settings.cloudflare.fullHostname = `${cleanSub}.${cleanRoot}`;
        db.salon.publicUrl = `https://${db.settings.cloudflare.fullHostname}`;
      }

      writeDb(db);

      let webhookReg = null;
      if (body.registerWebhookNow) {
        const targetWebhookUrl =
          body.webhookUrl || `${db.salon.publicUrl}/api/webhook/evolution`;
        webhookReg = await registerEvolutionWebhook(targetWebhookUrl, db.settings.evolution);
      }

      const evolutionStatus = await checkEvolutionConnection(db.settings.evolution);

      return sendJson(res, 200, {
        ok: true,
        evolutionStatus,
        webhookRegistration: webhookReg,
        settings: {
          evolution: {
            ...db.settings.evolution,
            apiKeyMasked: maskSecret(db.settings.evolution.apiKey),
            hasApiKey: Boolean(db.settings.evolution.apiKey)
          },
          cloudflare: {
            ...db.settings.cloudflare,
            apiTokenMasked: maskSecret(db.settings.cloudflare.apiToken),
            hasApiToken: Boolean(db.settings.cloudflare.apiToken)
          }
        }
      });
    }

    // 10. Provisionar Subdomínio valeronne.loomadev na Cloudflare via API
    if (pathname === '/api/cloudflare/provision' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const db = readDb();
      const cf = db.settings.cloudflare;

      const apiToken =
        body.apiToken && !String(body.apiToken).includes('••••')
          ? body.apiToken
          : cf.apiToken;
      const zoneId = body.zoneId !== undefined ? body.zoneId : cf.zoneId;
      const subdomain = body.subdomain || cf.subdomain || 'valeronne';
      const rootDomain = body.rootDomain || cf.rootDomain || 'loomadev.com';
      const recordType = body.recordType || cf.recordType || 'A';
      const targetContent = body.targetContent || cf.targetContent;
      const proxied = body.proxied !== undefined ? Boolean(body.proxied) : cf.proxied;

      // Salva credenciais informadas
      if (apiToken) cf.apiToken = String(apiToken).trim();
      if (zoneId !== undefined) cf.zoneId = String(zoneId).trim();
      if (subdomain) cf.subdomain = String(subdomain).trim();
      if (rootDomain) cf.rootDomain = String(rootDomain).trim();
      if (recordType) cf.recordType = String(recordType).trim();
      if (targetContent) cf.targetContent = String(targetContent).trim();
      cf.proxied = proxied;

      const result = await provisionCloudflareSubdomain({
        apiToken: cf.apiToken,
        zoneId: cf.zoneId,
        subdomain: cf.subdomain,
        rootDomain: cf.rootDomain,
        recordType: cf.recordType,
        targetContent: cf.targetContent,
        proxied: cf.proxied
      });

      cf.lastResult = result;
      if (result.fqdn) {
        cf.fullHostname = result.fqdn;
        db.salon.publicUrl = `https://${result.fqdn}`;
      }
      writeDb(db);

      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 11. Arquivos Estáticos do Frontend
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Fallback SPA para index.html
    const indexHtml = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(indexHtml).pipe(res);
    }

    sendJson(res, 404, { error: 'Recurso não encontrado' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || 'Erro interno no servidor' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ Valeronne Beleza e Estética rodando em http://localhost:${PORT}`);
});
