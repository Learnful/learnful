angular.module('learnful.chat', [
  'altfire', 'learnful.media', 'learnful.user'
])

.directive('lfChatroom', function() {
  'use strict';
  return {
    templateUrl: 'src/chat/chatroom.html',
    scope: {
      name: '@lfChatroom', frameSet: '@', frameKey: '=', presence: '=',
      preferredAuthorKey: '=', stateUserKey: '='
    },
    require: '?^lfFrame',

    controller: function($scope, fire, user, director, guidance, search) {
      var maxMessages = 50;
      $scope.user = user;

      $scope.getName = function() {
        return $scope.name || ($scope.frameSet + '/' + $scope.frameKey);
      };

      var handles = fire.connect($scope, {
        messages: {
          pull: 'chats/{{getName()}}/messages',
          query: function(ref) {return ref.limit(maxMessages);}
        },
        participantKeys: {pull: 'chats/{{getName()}}/participantKeys'},
        connected: {pull: '.info/connected'},
        frame: {pull: '{{frameSet}}/{{frameKey}}'},
        childrenTitles: {
          pull: '{{frameSet}}/#/core/title', viaValues: '{{frameSet}}/{{frameKey}}/children',
          viaValueExtractor: function(child) {return child.frameKey;}
        },
        tidbitMessages: {
          pull: 'chats/personalTidbits/{{stateUserKey || user.currentUserKey}}/{{frameSet}}/' +
                '{{frameKey}}/messages',
          query: function(ref) {return ref.limit(maxMessages);}
        }
      });

      var presenceReg, destroyed = false;
      function updatePresence() {
        if ($scope.connected || destroyed) {  // bound vars may disappear first when scope destroyed
          if ($scope.presence && user.currentUserKey && !destroyed && (
              !presenceReg || !$scope.participantKeys ||
              $scope.participantKeys[presenceReg.name()] !== user.currentUserKey)) {
            if (!presenceReg) {
              presenceReg = handles.participantKeys.ref().push();
              presenceReg.onDisconnect().remove();
            }
            presenceReg.set(user.currentUserKey);
          } else if (presenceReg && (destroyed || !$scope.presence || !user.currentUserKey)) {
            presenceReg.remove();
            presenceReg.onDisconnect().cancel();
            presenceReg = null;
          }
        } else {
          presenceReg = null;
        }
      }
      $scope.$watch('presence', updatePresence);
      $scope.$watch('connected', updatePresence);
      user.data.$watch('currentUserKey', updatePresence);
      $scope.$on('$destroy', function() {
        destroyed = true;
        updatePresence();
      });

      $scope.getParticipantKeys = function() {
        var userKeys = _.values($scope.participantKeys);
        userKeys.sort();  // Sort to keep the order stable as people come and go.
        return _.uniq(userKeys, true);
      };

      $scope.getMessages = function() {
        var messages = _.sortBy(
          _.values($scope.messages).concat(_.values($scope.tidbitMessages)), 'timestamp');
        var maxedKinds = _.compact(_.map([$scope.messages, $scope.tidbitMessages], function(item) {
          if (_.size(item) < maxMessages) return null;
          return _.find(item, _.constant(true)).kind;
        }));
        if (maxedKinds.length) {
          messages = _.filter(messages, function(message) {
            if (maxedKinds.length) maxedKinds = _.without(maxedKinds, message.kind);
            return !maxedKinds.length;
          });
        }
        return messages;
      };

      $scope.sendMessage = function() {
        if (!$scope.userMessage) return;
        handles.messages.ref().push({
          kind: 'public', text: $scope.userMessage, authorKey: user.currentUserKey,
          timestamp: Firebase.ServerValue.TIMESTAMP
        });
        $scope.userMessage = '';
      };

      $scope.sendTidbit = function(tidbitKey, preferAlternative) {
        $scope.$emit('trigger', {tidbitKey: tidbitKey, preferAlternative: preferAlternative});
      };

      $scope.matchTidbits = function(term, callback) {
        var items = [];
        if ($scope.frame && $scope.frame.tidbits) {
          var choices = {};
          _.each($scope.frame.tidbits, function(tidbit, tidbitKey) {
            if (tidbit && tidbit.findable && !tidbit.archived && tidbit.question &&
                tidbit.responses) {
              choices[tidbitKey] = '[!] ' + tidbit.question;
            }
          });
          _.each($scope.frame.children, function(child) {
            if (child && !child.archived && $scope.childrenTitles[child.frameKey]) {
              choices[child.frameKey] = '[>] ' + $scope.childrenTitles[child.frameKey];
            }
          });
          items = search.find(term, choices, 3);
        }
        callback(items);
      };

      $scope.$on('ac-select', function(event, item) {
        event.preventDefault();
        event.stopPropagation();
        $scope.userMessage = '';  // prevents message from being sent
        var tidbit = $scope.frame.tidbits[item.value];
        if (tidbit && tidbit.purpose === 'advice') {
          $scope.sendTidbit(item.value);
        } else if (!tidbit || tidbit.purpose === 'transition') {
          $scope.$emit('transition', {originFrameKey: $scope.frameKey, targetFrameKey: item.value});
        }
      });
      $scope.$on('ac-focus', function(event, item) {
        event.preventDefault();
        event.stopPropagation();
      });
    },

    link: function($scope, element, attrs, frameController) {
      element.find('textarea').on('keydown', function(event) {
        if (event.keyCode === 13 && !event.shiftKey) {
          $scope.sendMessage();
        }
      });
      var manualScroll = false;
      var chatHistory = element.find('.chat-history');
      chatHistory.on('scroll', _.debounce(function(event) {
        manualScroll = chatHistory.prop('scrollHeight') >
          chatHistory.scrollTop() + chatHistory.innerHeight() + 1;
      }, 500));  // debounced to avoid triggering on animated scroll
      var scrollToBottom = _.partial(_.defer, _.throttle(function() {
        if (!manualScroll) chatHistory.animate({scrollTop: chatHistory.prop('scrollHeight')}, 400);
      }, 500));
      $scope.$watchCollection('messages', scrollToBottom);
      $scope.$watchCollection('tidbitMessages', scrollToBottom);
      $scope.$watch('presence', scrollToBottom);
      $(window).on('resize', scrollToBottom);
      // TODO: when details get expanded, scroll chat history such that the top of the text and as
      // much of the rest as possible is within view.  Unconditionally scrolling to bottom could
      // actually take the text out of view, if expanding somewhere earlier in the history.
      // element.on('click', 'details', scrollToBottom);
      if (frameController) {
        frameController.scrollToBottom = scrollToBottom;
      }
    }
  };
})

.controller('lfTidbitMessage', function($scope, fire, guidance, user) {
  'use strict';
  var params = _.extend({userKey: user.currentUserKey}, $scope.message);
  fire.connect($scope, {
    tidbit: {pull: '{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}', pathScope: params},
    response: {
      pull: '{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses/{{responseKey}}',
      pathScope: params
    },
    responseVote: {
      pull: 'users/{{userKey}}/states/{{frameKey}}/triggered/{{tidbitKey}}/{{responseKey}}/vote',
      pathScope: params
    }
  });

  $scope.countAlternativeResponses = function() {
    if (!$scope.tidbit) return 0;
    return _.reduce($scope.tidbit.responses, function(count, response, key) {
      return count + ($scope.message.responseKey !== key && !response.archived);
    }, 0);
  };

  $scope.vote = function() {
    guidance.vote(
      $scope.message.frameSet, $scope.message.frameKey, $scope.message.tidbitKey,
      $scope.message.responseKey);
  };

})

;
