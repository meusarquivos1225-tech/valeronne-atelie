/**
 * Evolution API Service (Servidor Looma)
 * Compatível com Evolution API v1 e v2:
 * - POST {baseUrl}/message/sendText/{instanceName}
 * - GET  {baseUrl}/instance/connectionState/{instanceName}
 * - POST {baseUrl}/webhook/set/{instanceName}
 * - Processamento de Webhook (MESSAGES_UPSERT) com resposta automática inteligente
 */

function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // Se tiver 10 ou 11 dígitos (DDD + número brasileiro), prefixa 55
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

function formatDateBr(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderTemplate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

async function sendWhatsAppText({ phone, text, evolutionConfig }) {
  const cleanPhone = normalizePhone(phone);
  const baseUrl = String(evolutionConfig?.baseUrl || '').replace(/\/+$/, '');
  const apiKey = String(evolutionConfig?.apiKey || '').trim();
  const instanceName = encodeURIComponent(String(evolutionConfig?.instanceName || 'valeronne').trim());

  if (!cleanPhone) {
    return { ok: false, simulated: true, reason: 'Telefone inválido ou ausente.' };
  }

  if (!baseUrl || !apiKey) {
    return {
      ok: true,
      simulated: true,
      endpoint: `${baseUrl || 'https://evolution.loomadev.com'}/message/sendText/${instanceName}`,
      recipient: cleanPhone,
      messagePreview: text,
      note: 'Simulado localmente (configure EVOLUTION_API_URL e EVOLUTION_API_KEY do servidor Looma para envio real).'
    };
  }

  const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: text,
        delay: 1000,
        linkPreview: true,
        // Compatibilidade simultânea Evolution v1 (textMessage) e v2 (text direto)
        textMessage: { text: text }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const bodyText = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch (_) {
      parsed = { raw: bodyText };
    }

    if (!response.ok) {
      return {
        ok: false,
        simulated: false,
        status: response.status,
        endpoint,
        recipient: cleanPhone,
        error: parsed
      };
    }

    return {
      ok: true,
      simulated: false,
      status: response.status,
      endpoint,
      recipient: cleanPhone,
      response: parsed
    };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      endpoint,
      recipient: cleanPhone,
      error: err.message || 'Falha de conexão com o servidor Evolution Looma'
    };
  }
}

async function checkEvolutionConnection(evolutionConfig) {
  const baseUrl = String(evolutionConfig?.baseUrl || '').replace(/\/+$/, '');
  const apiKey = String(evolutionConfig?.apiKey || '').trim();
  const instanceName = encodeURIComponent(String(evolutionConfig?.instanceName || 'valeronne').trim());

  if (!baseUrl || !apiKey) {
    return {
      connected: false,
      configured: false,
      state: 'awaiting_credentials',
      message: 'Aguardando chave de API (EVOLUTION_API_KEY) e URL do servidor Looma.'
    };
  }

  const endpoint = `${baseUrl}/instance/connectionState/${instanceName}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || (res.ok ? 'open' : 'error');
    return {
      connected: res.ok && (state === 'open' || state === 'connected'),
      configured: true,
      status: res.status,
      state,
      endpoint,
      data
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      state: 'unreachable',
      endpoint,
      message: err.message
    };
  }
}

async function registerEvolutionWebhook(webhookUrl, evolutionConfig) {
  const baseUrl = String(evolutionConfig?.baseUrl || '').replace(/\/+$/, '');
  const apiKey = String(evolutionConfig?.apiKey || '').trim();
  const instanceName = encodeURIComponent(String(evolutionConfig?.instanceName || 'valeronne').trim());

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      message: 'Configure a URL e a API Key do servidor Evolution Looma antes de registrar o webhook.'
    };
  }

  const endpoint = `${baseUrl}/webhook/set/${instanceName}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT']
        },
        // Fallback campos planos para Evolution v1
        enabled: true,
        url: webhookUrl,
        events: ['MESSAGES_UPSERT']
      })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, endpoint, data };
  } catch (err) {
    return { ok: false, endpoint, error: err.message };
  }
}

function buildAutoReplyForMessage({ incomingText, pushName, senderPhone, db }) {
  const cleanText = String(incomingText || '').trim();
  const lower = cleanText.toLowerCase();
  const clientName = pushName || 'Cliente Valeronne';
  const normalizedSender = normalizePhone(senderPhone);

  // Busca agendamento ativo para este telefone
  const activeBookings = (db.bookings || []).filter((b) => {
    const bPhone = normalizePhone(b.clientPhone);
    return (
      bPhone &&
      normalizedSender &&
      (bPhone === normalizedSender || bPhone.slice(-9) === normalizedSender.slice(-9)) &&
      b.status !== 'cancelado'
    );
  });

  // Intenção: Confirmar presença direto pelo WhatsApp
  if (lower === 'confirmar' || (lower === '1' && activeBookings.length > 0 && lower.includes('confirm'))) {
    if (activeBookings.length > 0) {
      const latest = activeBookings[0];
      latest.status = 'confirmado';
      return {
        intent: 'confirmacao_presenca',
        updatedBookingId: latest.id,
        replyText:
          `✨ *Presença Confirmada — Valeronne Ateliê*\n\n` +
          `Obrigada, *${latest.clientName}*! Seu horário para *${latest.serviceName}* com *${latest.specialistName}* no dia *${formatDateBr(latest.date)} às ${latest.time}* (Protocolo *#${latest.protocol}*) está confirmado.\n\n` +
          `Preparamos nosso café especial e espumante para receber você! 🥂`
      };
    }
  }

  // Intenção: Cancelar agendamento
  if (lower === 'cancelar' || lower.includes('cancelar agendamento')) {
    if (activeBookings.length > 0) {
      const latest = activeBookings[0];
      latest.status = 'cancelado';
      return {
        intent: 'cancelamento_agendamento',
        updatedBookingId: latest.id,
        replyText:
          `✨ *Valeronne Beleza e Estética*\n\n` +
          `Seu agendamento *#${latest.protocol}* (${latest.serviceName} em ${formatDateBr(latest.date)} às ${latest.time}) foi cancelado conforme solicitado.\n\n` +
          `Quando desejar escolher uma nova data, acesse: ${db.salon.publicUrl}`
      };
    }
  }

  // Opção 1 ou intenção de agendar
  if (
    lower === '1' ||
    lower.includes('agendar') ||
    lower.includes('marcar') ||
    lower.includes('horario') ||
    lower.includes('horário') ||
    lower.includes('vaga')
  ) {
    return {
      intent: 'link_agendamento',
      replyText:
        `✨ *Agendamento Online — Valeronne Ateliê*\n\n` +
        `Olá, *${clientName}*! Você pode escolher sua experiência, especialista e horário em tempo real em nosso portal exclusivo:\n\n` +
        `🔗 *Acesse agora:* ${db.salon.publicUrl}/#agendamento\n\n` +
        `Nossas principais categorias:\n` +
        `• *Hair Couture & Colorimetria* (Mechas, Loiros, Cortes)\n` +
        `• *Estética Facial & Corporal* (Lumière d’Or, Drenagem, Exossomos)\n` +
        `• *Nail Couture & Hand Spa* (Manicure Russa & Blindagem)\n` +
        `• *Maquiagem Editorial & Suíte da Noiva*\n\n` +
        `Assim que concluir no site, você receberá seu protocolo de confirmação aqui no WhatsApp automaticamente!`
    };
  }

  // Opção 2 ou intenção de catálogo / preços / valores
  if (
    lower === '2' ||
    lower.includes('valor') ||
    lower.includes('preço') ||
    lower.includes('preco') ||
    lower.includes('serviço') ||
    lower.includes('servico') ||
    lower.includes('menu') ||
    lower.includes('mechas') ||
    lower.includes('cabelo') ||
    lower.includes('unha') ||
    lower.includes('noiva')
  ) {
    const topServices = (db.services || [])
      .map((s) => `▫️ *${s.name}* (${s.durationMinutes} min) — *R$ ${s.price}*`)
      .join('\n');

    return {
      intent: 'menu_servicos_valores',
      replyText:
        `✨ *Menu de Experiências — Valeronne Beleza e Estética*\n\n` +
        `${topServices}\n\n` +
        `📅 *Reserve seu horário online:* ${db.salon.publicUrl}/#agendamento\n` +
        `Ou digite *1* para receber o link direto de reserva.`
    };
  }

  // Opção 3 ou consulta de agendamento
  if (
    lower === '3' ||
    lower.includes('meu agendamento') ||
    lower.includes('consultar') ||
    lower.includes('protocolo') ||
    lower.includes('minha reserva')
  ) {
    if (activeBookings.length > 0) {
      const b = activeBookings[0];
      return {
        intent: 'consulta_agendamento',
        replyText:
          `✨ *Valeronne Beleza e Estética*\n\n` +
          `Olá, *${b.clientName}*! Localizamos seu agendamento em nosso Ateliê:\n\n` +
          `• *Protocolo:* #${b.protocol}\n` +
          `• *Experiência:* ${b.serviceName}\n` +
          `• *Especialista:* ${b.specialistName}\n` +
          `• *Data e Hora:* ${formatDateBr(b.date)} às *${b.time}*\n` +
          `• *Status:* ${b.status.toUpperCase()} ✅\n\n` +
          `Responda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* caso precise liberar o horário.`
      };
    }
    return {
      intent: 'consulta_sem_agendamento',
      replyText:
        `✨ *Valeronne Beleza e Estética*\n\n` +
        `Olá, *${clientName}*! Ainda não encontramos um agendamento ativo vinculado a este número.\n\n` +
        `Deseja reservar seu horário agora? Acesse:\n` +
        `🔗 ${db.salon.publicUrl}/#agendamento`
    };
  }

  // Opção 4 ou endereço / localização / instagram / humano
  if (
    lower === '4' ||
    lower.includes('endereço') ||
    lower.includes('endereco') ||
    lower.includes('localiza') ||
    lower.includes('onde fica') ||
    lower.includes('instagram') ||
    lower.includes('atendente') ||
    lower.includes('recepção')
  ) {
    return {
      intent: 'localizacao_concierge',
      replyText:
        `✨ *Ateliê Valeronne Beleza e Estética*\n\n` +
        `📍 *Endereço:* ${db.salon.address}\n` +
        `🕒 *Horários:* ${db.salon.hours}\n` +
        `📸 *Instagram:* ${db.salon.instagramHandle}\n` +
        `🌐 *Site & Reservas:* ${db.salon.publicUrl}\n\n` +
        `Nossa Concierge já foi notificada e caso precise de um atendimento personalizado, responderemos em instantes!`
    };
  }

  // Saudação / Menu padrão
  const welcomeTpl = db.settings?.evolution?.welcomeAutoReplyTemplate;
  const replyText = renderTemplate(welcomeTpl, {
    pushName: clientName,
    publicUrl: db.salon.publicUrl
  });

  return {
    intent: 'menu_boas_vindas',
    replyText
  };
}

module.exports = {
  normalizePhone,
  formatDateBr,
  renderTemplate,
  sendWhatsAppText,
  checkEvolutionConnection,
  registerEvolutionWebhook,
  buildAutoReplyForMessage
};
