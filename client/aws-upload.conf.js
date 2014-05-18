module.exports = {
  cwd: "dist",
  credentials: "../aws-credentials.json",
  bucketName: "learnful.co",
  cacheControl: "max-age=300",
  revCacheControl: "max-age=31536000",
  patterns: [
    "**"
  ]
};
