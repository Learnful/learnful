var Firebase = require('firebase');
var fs = require('fs');
var http = require('http');

if (process.env.NODE_ENV === 'production') {
  // Bogus server to keep Nodejitsu happy.
  var fingerprint = fs.readFileSync(__dirname + '/fingerprint');
  http.createServer(function(request, response) {
    response.writeHead(200);
    response.end(fingerprint);
  }).listen(80);
}

if (!process.env.LEARNFUL_FIREBASE) {
  throw new Error('Missing LEARNFUL_FIREBASE environment variable');
}
global.db = new Firebase('https://' + process.env.LEARNFUL_FIREBASE + '.firebaseio.com');
if (process.env.LEARNFUL_FIREBASE_AUTH) {
  global.db.auth(process.env.LEARNFUL_FIREBASE_AUTH);
}
console.log('Connecting to ' + global.db.toString());

// Require all server modules here, now that setup is done.
require('./graph_updater.js');
