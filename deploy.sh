#!/usr/bin/bash

echo "Branch: $BRANCH; pull request: $PULL_REQUEST"
if [[ "$BRANCH" = "master" && -z "$PULL_REQUEST" ]]; then
  echo "Deploying to production..."
  cd client
  printenv AWS_CREDENTIALS >aws-credentials.json
  s3-upload
else
  echo "Not deploying"
fi
