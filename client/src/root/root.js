angular.module('learnful.root', [
  'altfire',
  'ingredients',
  'learnful.arena',
  'learnful.user'
])

.directive('lfRoot', function() {
  'use strict';
  return {
    templateUrl: 'src/root/root.html',
    controller: function($scope, fire, user) {
      $scope.user = user;
      $scope.currentArenaKey = 'a-' + user.currentUserKey;
      fire.connect($scope, {
        currentArenaKey: {bind: 'users/{{user.currentUserKey}}/currentArenaKey'}
      });
    }
  };
})

;
