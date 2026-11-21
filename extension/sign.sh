#!/bin/bash
set -e
source .env
web-ext build --overwrite-dest
web-ext sign --channel=unlisted --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET