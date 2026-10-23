#!/bin/sh
set -eu

echo '[startup] Applying/verifying PostgreSQL schema...'
node src/db/migrate.js

if [ "${BOOTSTRAP_ADMIN:-true}" = "true" ]; then
  echo '[startup] Ensuring initial administrator exists...'
  node src/scripts/createAdmin.js
fi

exec node server.js
