#!/bin/bash
docker rm -f myfiles-e2e-wb myfiles-e2e-iam myfiles-e2e-router myfiles-e2e-mysql >/dev/null 2>&1; docker network rm myfiles-e2e >/dev/null 2>&1; echo down
