const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DATA = {
  salon: {
    name: 'Valeronne Beleza e Estética',
    shortName: 'VALERONNE',
    subtitle: 'BELEZA E ESTÉTICA • ATELIÊ',
    instagram: 'https://www.instagram.com/valeronnebelezaeestetica',
    instagramHandle: '@valeronnebelezaeestetica',
    whatsappDisplay: '+55 (11) 99842-7100',
    whatsappNumber: '5511998427100',
    address: 'Alameda Gabriel Monteiro da Silva, 1480 — Jardins, São Paulo • SP',
    hours: 'Terça a Sábado • 09h às 20h | Domingo e Segunda • Atendimento Exclusivo Noivas',
    publicUrl: process.env.PUBLIC_URL || 'https://valeronne.loomadev.com.br'
  },
  categories: [
    {
      id: 'hair',
      name: 'Hair Couture & Colorimetria',
      tagline: 'Mechas personalizadas, cortes arquitetônicos e terapia capilar de alta performance.',
      image: '/assets/images/hair-couture.jpg'
    },
    {
      id: 'estetica',
      name: 'Estética Facial & Corporal',
      tagline: 'Protocolos regenerativos, glow botânico, bioestimulação e rituais sensoriais.',
      image: '/assets/images/facial-spa.jpg'
    },
    {
      id: 'nails',
      name: 'Nail Couture & Hand Spa',
      tagline: 'Manicure russa, blindagem em gel, esmaltação hipoalergênica e spa botânico.',
      image: '/assets/images/nails-spa.jpg'
    },
    {
      id: 'bridal',
      name: 'Maquiagem Editorial & Noivas',
      tagline: 'Beleza atemporal de alta fixação e suíte exclusiva para o Dia da Noiva.',
      image: '/assets/images/makeup-bridal.jpg'
    }
  ],
  services: [
    {
      id: 'srv-illuminated-brunette',
      categoryId: 'hair',
      name: 'Mechas Couture & Morena Iluminada',
      description: 'Diagnóstico personalizado de visagismo e subtom de pele, técnica sem marcação com proteção de pontes capilares (Kérastase Première) e tonalização gloss.',
      durationMinutes: 180,
      price: 890,
      featured: true
    },
    {
      id: 'srv-blonde-atelier',
      categoryId: 'hair',
      name: 'Blonde Ateliê Valeronne + Ritual Caviar',
      description: 'Clareamento de alto padrão em véus ultrafinos, neutralização sob medida e reconstrução profunda com aminoácidos nobres.',
      durationMinutes: 210,
      price: 1120,
      featured: true
    },
    {
      id: 'srv-corte-visagismo',
      categoryId: 'hair',
      name: 'Corte Arquitetônico & Escova Modelada',
      description: 'Corte técnico personalizado para caimento natural, movimento fluido e finalização com brilho espelhado.',
      durationMinutes: 75,
      price: 320,
      featured: false
    },
    {
      id: 'srv-terapia-capilar',
      categoryId: 'hair',
      name: 'Terapia Capilar Detox & Infusão de Ouro',
      description: 'Oxigenação do couro cabeludo com microscopia, massagem craniana relaxante e selagem lipídica de brilho intenso.',
      durationMinutes: 60,
      price: 380,
      featured: false
    },
    {
      id: 'srv-facial-lumiere',
      categoryId: 'estetica',
      name: 'Ritual Facial Lumière d’Or (Glow & Lifting)',
      description: 'Limpeza ultrassônica delicada, drenagem miofascial escultora, sérum botânico antioxidante e máscara de ouro 24k.',
      durationMinutes: 90,
      price: 490,
      featured: true
    },
    {
      id: 'srv-drenagem-valeronne',
      categoryId: 'estetica',
      name: 'Drenagem Linfática Método Escultor + Pedras Quentes',
      description: 'Manobras precisas para desinchaço imediato, contorno corporal e relaxamento neuro-sensorial com óleos essenciais.',
      durationMinutes: 75,
      price: 340,
      featured: false
    },
    {
      id: 'srv-microagulhamento-glow',
      categoryId: 'estetica',
      name: 'Bioestimulação & Drug Delivery de Exossomos',
      description: 'Renovação celular avançada para textura de porcelana, estímulo de colágeno e uniformização do tom da pele.',
      durationMinutes: 75,
      price: 780,
      featured: false
    },
    {
      id: 'srv-manicure-russa',
      categoryId: 'nails',
      name: 'Manicure Russa & Blindagem Milky Nude',
      description: 'Cutilagem a seco de precisão milimétrica com brocas diamantadas, nivelamento em gel europeu e acabamento natural.',
      durationMinutes: 75,
      price: 195,
      featured: true
    },
    {
      id: 'srv-spa-maos-pes',
      categoryId: 'nails',
      name: 'Spa Botânico Mãos & Pés + Esmaltação Internacional',
      description: 'Esfoliação com cristais de quartzo, banho morno de pétalas e óleos nutritivos seguido de manicure e pedicure completas.',
      durationMinutes: 90,
      price: 260,
      featured: false
    },
    {
      id: 'srv-makeup-editorial',
      categoryId: 'bridal',
      name: 'Beleza Red Carpet (Make Glow + Penteado)',
      description: 'Pele luminosa e resistente com produtos Dior, Chanel e Charlotte Tilbury, acompanhada de penteado contemporâneo.',
      durationMinutes: 120,
      price: 680,
      featured: true
    },
    {
      id: 'srv-bridal-experience',
      categoryId: 'bridal',
      name: 'The Valeronne Bridal Suite (Prévia + Dia da Noiva)',
      description: 'Atendimento exclusivo na suíte privativa, teste completo de visagismo, assessoria de vestimenta, spa relaxante e champanhe.',
      durationMinutes: 240,
      price: 2850,
      featured: true
    }
  ],
  specialists: [
    {
      id: 'spec-valeria',
      name: 'Valéria Velloso',
      role: 'Diretora Criativa & Master Colorist',
      specialty: 'Mechas Couture, Loiros Personalizados & Visagismo',
      avatarInitials: 'VV'
    },
    {
      id: 'spec-helena',
      name: 'Dra. Helena Motta',
      role: 'Especialista em Estética Avançada & Dermocosmética',
      specialty: 'Protocolos Faciais Lumière, Exossomos & Lifting Miofascial',
      avatarInitials: 'HM'
    },
    {
      id: 'spec-clara',
      name: 'Clara Albuquerque',
      role: 'Beauty Artist & Bridal Concierge',
      specialty: 'Maquiagem Editorial, Penteados & Suíte da Noiva',
      avatarInitials: 'CA'
    },
    {
      id: 'spec-sofia',
      name: 'Sofia Kovalenko',
      role: 'Master Nail Designer & Hand Spa',
      specialty: 'Manicure Russa, Blindagem Europeia & Spa Botânico',
      avatarInitials: 'SK'
    }
  ],
  bookings: [
    {
      id: 'bk-demo-1',
      protocol: 'VAL-7924',
      clientName: 'Beatriz Monteiro',
      clientPhone: '5511991234567',
      clientEmail: 'beatriz.monteiro@exemplo.com',
      serviceId: 'srv-illuminated-brunette',
      serviceName: 'Mechas Couture & Morena Iluminada',
      servicePrice: 890,
      durationMinutes: 180,
      specialistId: 'spec-valeria',
      specialistName: 'Valéria Velloso',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      time: '14:00',
      notes: 'Preferência por subtom mel dourado suave.',
      status: 'confirmado',
      whatsappStatus: 'enviado_auto',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: 'bk-demo-2',
      protocol: 'VAL-8105',
      clientName: 'Camila Alcântara',
      clientPhone: '5511988776655',
      clientEmail: 'camila.alcantara@exemplo.com',
      serviceId: 'srv-facial-lumiere',
      serviceName: 'Ritual Facial Lumière d’Or (Glow & Lifting)',
      servicePrice: 490,
      durationMinutes: 90,
      specialistId: 'spec-helena',
      specialistName: 'Dra. Helena Motta',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      time: '10:30',
      notes: 'Pele sensível, evitar ácidos fortes.',
      status: 'confirmado',
      whatsappStatus: 'enviado_auto',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
    }
  ],
  webhookLogs: [
    {
      id: 'wh-demo-1',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      direction: 'inbound_and_reply',
      remoteJid: '5511991234567@s.whatsapp.net',
      pushName: 'Beatriz Monteiro',
      incomingText: 'Olá! Gostaria de consultar meu agendamento de amanhã',
      intentDetected: 'consulta_agendamento',
      autoReplyText: '✨ *Valeronne Beleza e Estética*\n\nOlá, *Beatriz Monteiro*! Localizamos seu agendamento em nosso Ateliê:\n\n• *Protocolo:* VAL-7924\n• *Experiência:* Mechas Couture & Morena Iluminada\n• *Especialista:* Valéria Velloso\n• *Horário:* 14:00\n• *Status:* Confirmado ✅\n\nResponda *CONFIRMAR* para manter ou *REAGENDAR* caso precise de outro horário.',
      evolutionDispatched: true
    }
  ],
  settings: {
    evolution: {
      baseUrl: process.env.EVOLUTION_API_URL || 'https://evolution.loomadev.com',
      apiKey: process.env.EVOLUTION_API_KEY || '',
      instanceName: process.env.EVOLUTION_INSTANCE || 'valeronne',
      salonNotificationPhone: process.env.SALON_WHATSAPP || '5511998427100',
      autoReplyEnabled: true,
      sendBookingConfirmation: true,
      confirmationTemplate:
        '✨ *VALERONNE BELEZA E ESTÉTICA*\n_Concierge Digital de Agendamentos_\n\nOlá, *{clientName}*! É um prazer receber você em nosso Ateliê.\nSua reserva foi registrada com sucesso:\n\n▫️ *Protocolo:* #{protocol}\n▫️ *Experiência:* {serviceName}\n▫️ *Especialista:* {specialistName}\n▫️ *Data:* {dateFormatted} às *{time}*\n▫️ *Investimento:* R$ {servicePrice}\n📍 *Local:* {salonAddress}\n\nPara sua comodidade, responda:\n*1* — Confirmar presença\n*2* — Solicitar reagendamento\n*3* — Falar com nossa recepção\n\n_Valeronne Ateliê • Beleza com assinatura._',
      welcomeAutoReplyTemplate:
        '✨ *Bem-vinda ao Valeronne Beleza e Estética*\n\nOlá, *{pushName}*! Sou a assistente exclusiva do Ateliê Valeronne via servidor Looma.\nComo posso tornar seu dia mais iluminado hoje?\n\nDigite o número da opção desejada:\n*1* — 📅 Agendar horário online agora\n*2* — ✨ Menu de Experiências & Valores\n*3* — 🔍 Consultar ou confirmar meu agendamento\n*4* — 📍 Endereço, Instagram e falar com Concierge'
    },
    cloudflare: {
      subdomain: process.env.CF_SUBDOMAIN || 'valeronne',
      rootDomain: process.env.CF_ROOT_DOMAIN || 'loomadev.com',
      fullHostname: process.env.CF_FULL_HOSTNAME || 'valeronne.loomadev.com',
      zoneId: process.env.CLOUDFLARE_ZONE_ID || '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
      recordType: process.env.CF_RECORD_TYPE || 'A',
      targetContent: process.env.CF_TARGET_CONTENT || '',
      proxied: true,
      lastResult: null
    }
  }
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DATA,
      ...parsed,
      settings: {
        evolution: { ...DEFAULT_DATA.settings.evolution, ...(parsed.settings?.evolution || {}) },
        cloudflare: { ...DEFAULT_DATA.settings.cloudflare, ...(parsed.settings?.cloudflare || {}) }
      }
    };
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function generateProtocol() {
  const num = crypto.randomInt(1000, 9999);
  return `VAL-${num}`;
}

module.exports = {
  readDb,
  writeDb,
  generateProtocol
};
