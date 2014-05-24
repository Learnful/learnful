#!/usr/bin/bash

mv shippable/codecoverage/PhantomJS*/* shippable/codecoverage
rm -rf shippable/codecoverage/PhantomJS*
if [[ -e shippable/notification.json ]]; then
  curl -X POST $GITTER_URL -H "Content-Type: application/json" --data @shippable/notification.json
fi
