#!/usr/bin/bash

if [[ "$BRANCH" = "master" && -z "$PULL_REQUEST" ]]; then
  echo "Deploying to production..."
  cd client
  printenv AWS_CREDENTIALS >aws-credentials.json
  s3-upload
else
  echo "Not deploying"
fi
