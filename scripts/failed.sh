#!/usr/bin/bash

if [[ "$BRANCH" = "master" && "$PULL_REQUEST" = "None" ]]; then
  echo "{\"level\": \"error\", \"message\": \"[Build $BUILD_NUMBER](https://www.shippable.com/projects/$JOB_ID/builds/$BUILD_NUMBER) failed\"}" >shippable/notification.json
fi

