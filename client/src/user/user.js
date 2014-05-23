angular.module('learnful.user', [
  'altfire',
])

.factory('user', function($rootScope, fire) {
  'use strict';
  var self = {data: $rootScope.$new(true)};
  var handles;

  self.signIn = function(userKey) {
    if (handles) handles.$destroyAll();
    self.currentUserKey = self.data.currentUserKey = userKey;
    self.data.persona = {
      name: 'Guest ' + userKey,
      avatar: 'https://robohash.org/' + userKey + '.png?set=set3&size=40x40',
    };
    handles = fire.connect(self.data, {
      persona: {bind: 'users/{{currentUserKey}}/persona'},
      clockSkew: {pull: '.info/serverTimeOffset'}
    });
  };

  self.signOut = function() {
    if (handles) {
      handles.$destroyAll();
      handles = null;
      self.currentUserKey = self.data.currentUserKey = null;
    }
  };

  self.now = function() {
    return _.now() + self.data.clockSkew;
  };

  return self;
})

.directive('lfAvatar', function() {
  'use strict';
  return {
    templateUrl: 'src/user/avatar.html',
    scope: {userKey: '=lfAvatar', format: '@'},
    controller: function($scope, fire) {
      fire.connect($scope, {
        persona: {pull: 'users/{{userKey}}/persona'}
      });
    },
    link: function($scope, element, attrs, controller) {
      var ctx = element.find('canvas').get(0).getContext('2d');
      var sourceImage = element.find('.avatar-source');
      sourceImage.on('load', function() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(20, 20, 20, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#fbf5e7';
        ctx.fill();
        ctx.clip();
        ctx.drawImage(sourceImage.get(0), 0, 0, 40, 40);
        ctx.restore();
      });
    }
  };
})

;
