angular.module('learnful.navigation', [
  'altfire', 'learnful.components', 'learnful.user'
])

.factory('guidance', function($q, fire, user, completion) {
  'use strict';
  var self = {};

  function selectResponse(responses, votes, triggered, preferAlternative, preferredAuthorKey) {
    // Select the last response shown if there is one, unless we're looking for alternatives.
    // Otherwise, pick from the pool of responses that have been offered the least number of times
    // to this user and pick at random based on the popularity of each (with a minimum floor).  Also
    // optionally pick only the preferred author's responses (useful when previewing content).
    var responsePairs = _.pairs(responses);
    var candidateResponses;
    if (preferredAuthorKey) {
      candidateResponses = _.filter(responsePairs, function(pair) {
        return pair[1].authorKey === preferredAuthorKey;
      });
    }
    if (!(candidateResponses && candidateResponses.length)) candidateResponses = responsePairs;
    candidateResponses = _.reject(candidateResponses, function(pair) {return pair[1].archived;});
    var hasUnseenResponses = false, hasSeenResponses = false;
    _.each(candidateResponses, function(pair) {
      var responseState = triggered && triggered[pair[0]];
      pair[2] = responseState && responseState.lastTriggerTime;
      if (pair[2]) {
        hasSeenResponses = true;
      } else {
        hasUnseenResponses = true;
      }
    });
    if (!preferAlternative && hasSeenResponses) {
      return _.max(candidateResponses, function(triplet) {
        return triplet[2] || 0;
      })[0];
    } else if (preferAlternative && !hasUnseenResponses) {
      return _.min(candidateResponses, function(triplet) {
        return triplet[2] || 0;
      })[0];
    } else {
      candidateResponses = _.filter(candidateResponses, function(triplet) {
        return !triplet[2];
      });
      var totalWeight = 0;
      _.each(candidateResponses, function(triplet) {
        var responseVote = votes && votes[triplet[0]];
        var weight = Math.max(
          0.02, (responseVote && responseVote.triggerCount) ?
            (responseVote.voteCount || 0) / responseVote.triggerCount : 0
        );
        totalWeight += weight;
        triplet[2] = weight;
      });
      var r = Math.random() * totalWeight;
      return _.find(candidateResponses, function(triplet) {
        r -= triplet[2];
        return r <= 0;
      })[0];
    }
  }

  self.trigger = function(
      stateScope, frameKey, tidbitKey, userKey, preferAlternative, preferredAuthorKey,
      targetFrameSet, targetFrameKey) {
    if (!stateScope.triggered[tidbitKey]) {
      // Mark as triggered before blocking on data, so we don't end up triggering twice.
      stateScope.triggered[tidbitKey] = {$triggered: true};
    }
    var handles = fire.connect(
      {
        userKey: userKey,
        frameSet: stateScope.frameSet,
        frameKey: frameKey,
        tidbitKey: tidbitKey,
        targetFrameSet: targetFrameSet || stateScope.frameSet,
        targetFrameKey: targetFrameKey || frameKey
      },
      {
        responses: {once: '{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses'},
        votes: {once: 'votes/{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses'},
        triggered: {noop: 'users/{{userKey}}/states/{{frameKey}}/triggered/{{tidbitKey}}'},
        messages: {noop:
          'chats/personalTidbits/{{userKey}}/{{targetFrameSet}}/{{targetFrameKey}}/messages'},
      }
    );
    handles.$allReady().then(function(result) {
      if (!result.responses) return;
      var responseKey = selectResponse(
        result.responses, result.votes, stateScope.triggered[tidbitKey], preferAlternative,
        preferredAuthorKey);
      if (stateScope.frameSet === 'frames') {
        handles.triggered.ref(responseKey, 'lastTriggerTime').set(Firebase.ServerValue.TIMESTAMP);
        handles.triggered.ref(responseKey, 'triggerCount').transaction(function(value) {
          return (value || 0) + 1;
        }, function(error, committed, snap) {
          if (snap && snap.val() === 1) {
            handles.votes.ref(responseKey, 'triggerCount').transaction(function(value) {
              return (value || 0) + 1;
            });
          }
        });
      } else if (stateScope.frameSet === 'drafts') {
        if (!stateScope.triggered[tidbitKey]) stateScope.triggered[tidbitKey] = {};
        if (!stateScope.triggered[tidbitKey][responseKey]) {
          stateScope.triggered[tidbitKey][responseKey] = {};
        }
        var responseState = stateScope.triggered[tidbitKey][responseKey];
        responseState.lastTriggerTime = user.now();
        responseState.triggerCount = (responseState.triggerCount || 0) + 1;
      }
      handles.messages.ref().push({
        kind: 'tidbit', timestamp: Firebase.ServerValue.TIMESTAMP, frameSet: stateScope.frameSet,
        frameKey: frameKey, tidbitKey: tidbitKey, responseKey: responseKey
      });
    });
  };

  self.vote = function(frameSet, frameKey, tidbitKey, responseKey) {
    if (frameSet !== 'frames') return;
    var handles = fire.connect(
      {
        userKey: user.currentUserKey,
        frameSet: frameSet,
        frameKey: frameKey,
        tidbitKey: tidbitKey,
        responseKey: responseKey
      },
      {
        responseState: {
          once: 'users/{{userKey}}/states/{{frameKey}}/triggered/{{tidbitKey}}/{{responseKey}}'},
        responseVote: {
          noop: 'votes/{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses/{{responseKey}}'}
      }
    );
    handles.$allReady().then(function(result) {
      if (!(result.responseState && result.responseState.vote)) {
        handles.responseState.ref('vote').set(1);
        handles.responseVote.ref('voteCount').transaction(function(value) {
          return value + 1;
        });
      }
    });
  };

  self.nextDeeperFrame = function(frameKey, userKey) {
    var deferred = $q.defer();
    fire.connect(
      {frameKey: frameKey}, {children: {once: 'frames/{{frameKey}}/children'}}
    ).$allReady().then(function(result) {
      var children = _.chain(result.children)
        .values().compact().select(function(child) {return !child.archived;})
        .sortBy('order').value();
      if (_.isEmpty(children)) {
        deferred.resolve();
      } else {
        completion(userKey).track(_.pluck(children, 'frameKey')).ready().then(function(tracker) {
          deferred.resolve(_.min(
            children, function(child) {return tracker.getLevel(child.frameKey);}
          ).frameKey);
          tracker.destroy();
        });
      }
    });
    return deferred.promise;
  };

  self.nextHigherFrame = function(frameKey, userKey) {
    var deferred = $q.defer();
    fire.connect(
      {frameKey: frameKey}, {parentKeys: {once: 'graph/{{frameKey}}/parentKeys'}}
    ).$allReady().then(function(result) {
      if (!result.parentKeys) {
        deferred.resolve();
      } else {
        var parentKeys = _.keys(result.parentKeys);
        completion(userKey).track(parentKeys).ready().then(function(tracker) {
          var minCompletionLevel = Math.min(_.map(
            parentKeys, function(key) {return tracker.getLevel(key);}));
          parentKeys = _.filter(
            parentKeys, function(key) {return tracker.getLevel(key) === minCompletionLevel;});
          deferred.resolve(parentKeys[_.random(parentKeys.length - 1)]);
          tracker.destroy();
        });
      }
    });
    return deferred.promise;
  };

  return self;
})

.factory('search', function() {
  'use strict';
  var self = {};

  /**
   * Searches an object for the best match for a free-form query, and returns an array of the best
   * matches in ui-autocomplete format.
   *
   * @param {string} query A free-form text query.
   * @param {object} choices Map of keys (autocomplete values) to string values (autocomplete
   *    labels) to choose from.
   * @param {number} limit The maximum number of results to return.
   * @returns {array<object>} An array of objects with 'label' and 'value' attributes.
   */
  self.find = function(query, choices, limit) {
    limit = limit || 3;
    var words = _.compact(query.replace(/[.?,:;'"]/g, '').split(/\s+/));
    var wordRegexes = _.map(words, function(word) {
      return new RegExp($.ui.autocomplete.escapeRegex(word), 'i');
    });
    return _.chain(choices)
      .map(function(choice, key) {
        var matchCount = _.reduce(wordRegexes, function(count, regex) {
          regex.lastIndex = 0;
          return count + regex.test(choice || '');
        }, 0);
        return matchCount ? {value: key, label: choice, count: matchCount} : null;
      })
      .compact()
      .sortBy('count')
      .slice(-limit)
      .reverse()
      .value();
  };

  return self;
})

.directive('lfFrameFinder', function(fire, search) {
  'use strict';
  return {
    replace: true,
    scope: {selectCallback: '&lfFrameFinder', placeholder: '@'},
    template:
      '<input class="frame-finder" placeholder="{{placeholder}}" lf-autocomplete="matchFrames" ' +
      'ac-position="{collision: \'flip\'}"/>',
    link: function($scope, element, attrs, controller) {
      var handles = fire.connect($scope, {
        frames: {noop: 'frames'},
        drafts: {noop: 'drafts'}
      });

      function createFrame(title) {
        title = title || 'New frame';
        var stub = {core: {title: title, content: 'To be filled in...'}};
        var frameKey = handles.frames.ref().push().name();
        frameKey = 'f' + frameKey;
        handles.frames.ref(frameKey).set(stub);
        handles.drafts.ref(frameKey).set(stub);
        return frameKey;
      }

      var createFrameLabelPrefix = '\u2726Create frame\u2726 ';

      $scope.matchFrames = function(term, callback) {
        fire.connect($scope, {
          frames: {once: 'frames'}
        }).$allReady().then(function(result) {
          var choices = {};
          _.each(result.frames, function(frame, frameKey) {
            choices[frameKey] = frame.core.title;
          });
          var items = search.find(term, choices, 5);
          items.push({value: '#create', label: createFrameLabelPrefix + term});
          callback(items);
        });
      };

      $scope.$on('ac-focus', function(event, item) {
        event.preventDefault();
        event.stopPropagation();
      });

      $scope.$on('ac-select', function(event, item) {
        event.preventDefault();
        event.stopPropagation();
        element.val('');
        var mode = attrs.mode;
        var frameKey = item.value;
        if (frameKey === '#create') {
          frameKey = createFrame(item.label.slice(createFrameLabelPrefix.length));
          mode = 'edit';
        }
        if ($scope.selectCallback) $scope.selectCallback({frameKey: frameKey});
        $scope.$emit('frameAdded', frameKey, mode, 'focus' in attrs);
      });

    }
  };
})

;
