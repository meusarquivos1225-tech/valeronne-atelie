# ✨ Valeronne Beleza e Estética — Ateliê Digital, Agendamento & Automação Evolution API (Looma)

Site institucional sofisticado e sistema de agendamento online desenvolvido para o salão **Valeronne Beleza e Estética** ([@valeronnebelezaeestetica](https://www.instagram.com/valeronnebelezaeestetica)), com identidade visual oficial extraída do acervo `VALERONNE - ATELIÊ` (Dourado `#C8A97E` e monograma vetorial oficial), integrado à **API Evolution do servidor Looma** e provisionamento de subdomínio **`valeronne.loomadev`** na **Cloudflare**.

## 🚀 Funcionalidades Principais

1. **Identidade Editorial de Alto Padrão**:
   - Logos vetoriais oficiais (`icon-valeronne.svg`, `name-valeronne.svg`, `logo-name-valeronne.svg`).
   - Curadoria em 4 pilares: *Hair Couture & Colorimetria*, *Estética Facial & Corporal*, *Nail Couture & Hand Spa* e *Maquiagem Editorial & Noivas*.
2. **Motor de Agendamento Online em Tempo Real (`/api/bookings` & `/api/availability`)**:
   - Seleção de ritual, especialista, data e bloqueio automático de horários ocupados.
   - Geração de protocolo `#VAL-XXXX` e disparo imediato de confirmação no WhatsApp da cliente e alerta para a recepção do salão.
3. **Integração Nativa com Evolution API v1/v2 do Servidor Looma**:
   - Disparo ativo via `POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}`.
   - Webhook de resposta automática em `POST /api/webhook/evolution` (evento `MESSAGES_UPSERT`):
     - `1` ou *"agendar"* → Envia link direto de agendamento online.
     - `2` ou *"valores / serviços"* → Envia o menu completo de experiências e preços.
     - `3` ou *"meu agendamento"* → Consulta a reserva vinculada ao número do WhatsApp da cliente.
     - *"CONFIRMAR"* ou *"CANCELAR"* → Atualiza o status do agendamento automaticamente no banco.
     - `4` ou *"endereço / instagram"* → Envia localização, horários e aciona a Concierge.
4. **Provisionamento Cloudflare (`valeronne.loomadev`)**:
   - Painel visual integrado (`⚙️ Looma & Cloudflare`) e script CLI (`npm run cloudflare:setup`) para criar/atualizar o registro DNS `valeronne.loomadev` na API v4 da Cloudflare com Proxy SSL ativo.

## 📦 Como Subir no Servidor Looma

```bash
git clone https://github.com/meusarquivos1225-tech/valeronne-atelie.git
cd valeronne-atelie
cp .env.example .env
# Edite o .env com a URL/APIKey da sua Evolution API e Token Cloudflare
docker compose up -d --build
```

Para provisionar o subdomínio na Cloudflare via linha de comando:

```bash
CLOUDFLARE_API_TOKEN="seu_token" \
CF_ROOT_DOMAIN="loomadev.com" \
CF_TARGET_CONTENT="IP_DO_SERVIDOR_LOOMA" \
npm run cloudflare:setup
```
