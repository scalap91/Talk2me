#!/bin/bash
# Moteur de non-régression — crée une session de test puis lance le moteur.
#   bash run.sh --baseline   (fixe la référence, avant de coder)
#   bash run.sh              (compare à la référence, après codage)
TOKEN=$(ssh -i ~/.ssh/t2m_dev_deploy -o StrictHostKeyChecking=no root@141.95.7.169 '
cd /root/talktome 2>/dev/null
# PORT ACTIF (blue-green alterne 3010/3011) — lu depuis nginx, sinon 3010. Sans ça le mint tape
# l instance ARRÊTÉE → token vide → toutes les pages gate → fausse régression massive.
PORT=$(grep -oE "127.0.0.1:[0-9]+" /etc/nginx/conf.d/dev-active.conf 2>/dev/null | grep -oE "[0-9]+$" | head -1)
[ -z "$PORT" ] && PORT=3010
S=$(grep -h "^TEST_LOGIN_SECRET=" .env .env.local 2>/dev/null | head -1 | cut -d= -f2-)
curl -s -X POST -H "Content-Type: application/json" -H "x-test-secret: $S" -d "{\"phone\":\"+9990000042\",\"name\":\"Regress\"}" http://localhost:$PORT/api/dev/test-login | python3 -c "import sys,json;print(json.load(sys.stdin).get(\"token\",\"\"))"
' 2>/dev/null)
[ -z "$TOKEN" ] && { echo "moteur: pas de session de test"; exit 2; }
cd /home/ubuntu/talk2me-dev/tools/regression
T2M_TOKEN="$TOKEN" node engine.mjs "$@"
