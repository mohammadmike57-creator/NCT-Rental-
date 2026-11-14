#!/bin/bash
# run.sh <jar> <extra args...>: starts the server on PostgreSQL (database mstest), port 8393
pkill -f "server.port=8393" ; sleep 2
JWT_SECRET=$(printf 'r%.0s' {1..64}) E2E_PASSWORD=rehearsal-pass-12345 nohup java -jar "$1" --server.port=8393 \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/mstest --spring.datasource.username=mstest --spring.datasource.password=mstest-pass \
  --spring.datasource.driver-class-name=org.postgresql.Driver "${@:2}" > "$(dirname "$0")/server-$(date +%s).log" 2>&1 &
