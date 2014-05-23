angular.module('learnful', [
  'ngCookies', 'altfire', 'learnful.generated_config', 'learnful.root', 'learnful.user'
])

.constant('config', _.extend({
  audioRecorder: {workerPath: '/bower_components/Recorderjs/recorderWorker.js'},
}, window.location.hostname.match(/.?learnful.co$/) ? {
  prod: true,
  s3Media: 'https://s3.amazonaws.com/learnful-media.co/'
} : {
  prod: false,
  s3Media: 'https://s3.amazonaws.com/learnful-media-dev.co/'
}))

.run(function run($rootScope, $cookies, fire, config, user, generatedConfig) {
  'use strict';
  _.extend(config, generatedConfig);  // Yes, we're mangling a constant.  Deal with it.
  $(document).tooltip({
    show: {delay: 500},
    content: function() {return this.getAttribute('tooltip') || this.title;},
    items: '[title], [tooltip]'  // use 'tooltip' for dynamically bound contents
  });
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
  window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
  fire.setDefaultRoot('https://' + config.firebase + '.firebaseio.com/');
  var currentUserKey = $cookies.learnfulFakeUserId;
  if (!currentUserKey) {
    $cookies.learnfulFakeUserId = currentUserKey = 'u' + _.random(1, 1000);
  }
  user.signIn(currentUserKey);
})

.config(function cfg($sceDelegateProvider, config) {
  'use strict';
  $sceDelegateProvider.resourceUrlWhitelist([
    'self',
    'blob:**',
    config.s3Media + '**'
  ]);
})

;
