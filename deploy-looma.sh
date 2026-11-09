#!/usr/bin/env bash
# ==============================================================================
# Script Oficial de Deploy — Servidor Looma (Dockge + Cloudflare Tunnel)
# Projeto: Valeronne Beleza e Estética (valeronne.loomadev.com.br)
# Segue estritamente o modelo_de_deploy_agente.md da Looma
# ==============================================================================
set -e

STACK_DIR="/opt/stacks/valeronne-atelie"
REPO_URL="https://github.com/meusarquivos1225-tech/valeronne-atelie.git"
TUNNEL_ID="8a55b794-ed12-4a3f-93f0-c7df6dc652ed"
HOSTNAME="valeronne.loomadev.com.br"
DOCKGE_PORT="8092"
CF_CONFIG="/etc/cloudflared/config.yml"

echo "✨ [1/4] Preparando stack no Dockge (${STACK_DIR})..."
sudo mkdir -p "${STACK_DIR}"
sudo chown -R "$(whoami)":"$(whoami)" "${STACK_DIR}"

if [ -d "${STACK_DIR}/.git" ]; then
  cd "${STACK_DIR}" && git pull origin main
else
  git clone "${REPO_URL}" "${STACK_DIR}"
  cd "${STACK_DIR}"
fi

cp -f docker-compose.yml compose.yaml

echo "🚀 [2/4] Subindo contêiner Docker na porta local ${DOCKGE_PORT}->3000..."
docker compose up -d --build

echo "🌐 [3/4] Configurando rota ${HOSTNAME} no Cloudflare Tunnel (${CF_CONFIG})..."
if ! sudo grep -q "hostname: ${HOSTNAME}" "${CF_CONFIG}"; then
  sudo sed -i "/- service: http_status:404/i - hostname: ${HOSTNAME}\n  service: http://localhost:${DOCKGE_PORT}" "${CF_CONFIG}"
  echo "✅ Regra de ingress adicionada em ${CF_CONFIG}"
else
  echo "ℹ️ Regra ${HOSTNAME} já existe em ${CF_CONFIG}"
fi

echo "🔗 [4/4] Criando CNAME no DNS da Cloudflare e reiniciando cloudflared..."
cloudflared tunnel route dns "${TUNNEL_ID}" "${HOSTNAME}" || true
sudo systemctl restart cloudflared

echo "=============================================================================="
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "🌐 Site Online: https://${HOSTNAME}"
echo "🤖 Webhook Evolution API: https://${HOSTNAME}/api/webhook/evolution"
echo "=============================================================================="
