function evalAnalyzer(code, scope, analyzerUtils) {
  // jshint ignore:start
  var mask = {scope: scope};
  for (var p in this) {
    if (p !== '_' && p !== 'console') mask[p] = undefined;
  }
  mask.lf = analyzerUtils;
  (new Function(  // jshint ignore:line
    'with(this) {' +
    'var input=scope.input, outcome=scope.outcome, triggered=scope.triggered, ' +
    'completed=scope.completed;' + code + '}'
  )).call(mask);
  // jshint ignore:end
}

angular.module('learnful.frame', [
  'altfire',
  'ingredients',
  'learnful',
  'learnful.chat',
  'learnful.content',
  'learnful.media',
  'learnful.navigation',
  'learnful.user'
])

.directive('lfFrame', function()  {
  'use strict';
  return {
    templateUrl: 'src/frame/frame.html',
    scope: {frameKey: '=lfFrame', stateUserKey: '=', focused: '=', mode: '='},
    controller: function($scope, $timeout, fire, modal, user, guidance, director, completion) {
      $scope.user = user;
      $scope.stateScope = null;
      $scope.expandedTidbits = {};
      $scope.expandedChildren = {};
      $scope.showArchived = {};

      var handles = fire.connect($scope, {
        frame: {bind: 'frames/{{frameKey}}'},
        draft: {bind: 'drafts/{{frameKey}}'},
        draftChildren: {
          pull: 'frames/#/core', viaValues: 'drafts/{{frameKey}}/children',
          viaValueExtractor: function(child) {return child.frameKey;}
        },
        completed: {bind: 'users/{{stateUserKey}}/completions/{{frameKey}}'},
        votes: {pull: 'votes/frames/{{frameKey}}'}
      });

      $scope.$on('trigger', function(event, args) {
        $scope.trigger(args.tidbitKey, args.preferAlternative);
      });

      $scope.$watch('[stateUserKey, frame.children]', function() {
        if ($scope.completion) $scope.completion.destroy();
        if ($scope.stateUserKey) {
          $scope.completion = completion($scope.stateUserKey, $scope);
          if ($scope.frame && $scope.frame.children) {
            $scope.completion.track(
              _.chain($scope.frame.children)
                .reject(function(child) {return child.archived;}).pluck('frameKey').value());
          }
        }
      }, true);

      $scope.isGoToIncompleteChildPrimary = function() {
        return !$scope.isCompleteAndGoToParentPrimary() && $scope.hasAvailableChild() &&
          _.min(_.values($scope.completion.getAllCompletionLevels())) === 0;
      };

      $scope.isCompleteAndGoToParentPrimary = function() {
        return $scope.completed || frameStateScope.outcome.success;
      };

      $scope.hasAvailableChild = function() {
        return !_.every(_.pluck($scope.frame && $scope.frame.children, 'archived'));
      };

      $scope.goToIncompleteChild = function() {
        guidance.nextDeeperFrame($scope.frameKey, $scope.stateUserKey).then(function(nextFrameKey) {
          if (nextFrameKey) $scope.transition(nextFrameKey);
        });
      };

      $scope.completeAndGoToParent = function() {
        $scope.completed = true;
        guidance.nextHigherFrame($scope.frameKey, $scope.stateUserKey).then(function(nextFrameKey) {
          if (nextFrameKey) {
            $scope.transition(nextFrameKey);
          } else {
            alert(
              'No parent found -- we would now pick a frame at random that relates to the other ' +
              'frames in this workspace.');
          }
        });
      };

      $scope.goElsewhere = function() {
        $scope.$emit('showNeighbors', $scope.frameKey);
      };

      $scope.trigger = function(tidbitKey, preferAlternative) {
        var preferredAuthorKey = $scope.mode === 'explore' ? null : user.currentUserKey;
        guidance.trigger(
          $scope.stateScope, $scope.frameKey, tidbitKey, $scope.stateUserKey,
          preferAlternative, preferredAuthorKey);
        director.autoplayNext(tidbitKey);
      };

      $scope.$on('transition', function(event, args) {
        if (args.originFrameKey === $scope.frameKey) $scope.transition(args.targetFrameKey);
      });

      function hasTransitionTidbit(frame, frameKey) {
        var hasActiveChild = _.some(frame && frame.children, function(child) {
          return !child.archived && child.frameKey === frameKey;
        });
        return hasActiveChild && frame.tidbits[frameKey] && !frame.tidbits[frameKey].archived;
      }

      $scope.transition = function(targetFrameKey) {
        $scope.$emit('frameAdded', targetFrameKey, undefined, true);
        // Give the target frame time to be created, if necessary.
        $timeout(function() {
          var frame = $scope.mode === 'explore' ? $scope.frame : $scope.draft;
          var data = {targetFrameKey: targetFrameKey, originFrameKey: $scope.frameKey};
          if (hasTransitionTidbit(frame, targetFrameKey) &&
              !$scope.stateScope.triggered[targetFrameKey]) {
            data.triggerSpec = {
              stateScope: $scope.stateScope, frameKey: $scope.frameKey, tidbitKey: targetFrameKey
            };
          } else if ($scope.mode === 'preview') {
            // In preview mode, trigger only our own tidbits, since we don't know the target's mode.
            data.draftOnly = true;
          }
          $scope.$emit('completeTransition', data);
        });
      };

      $scope.$on('completeTransition', function(event, data) {
        if (data.targetFrameKey !== $scope.frameKey) return;
        var frame = $scope.mode === 'explore' ? $scope.frame : $scope.draft;
        var preferredAuthorKey = $scope.mode === 'explore' ? null : user.currentUserKey;
        if (data.triggerSpec) {
          // We are a child of the origin frame, and it has a relevant tidbit; play it.
          guidance.trigger(
            data.triggerSpec.stateScope, data.triggerSpec.frameKey, data.triggerSpec.tidbitKey,
            $scope.stateUserKey, false, preferredAuthorKey, $scope.stateScope.frameSet,
            $scope.frameKey);
          director.autoplayNext(data.triggerSpec.tidbitKey);
        } else if (hasTransitionTidbit(frame, data.originFrameKey) &&
                   !$scope.stateScope.triggered[data.originFrameKey]) {
          if (data.draftOnly && $scope.mode === 'explore') return;
          // We are a parent of the origin frame, and we have a relevant tidbit; play it.
          guidance.trigger(
            $scope.stateScope, $scope.frameKey, data.originFrameKey, $scope.stateUserKey, false,
            preferredAuthorKey);
          director.autoplayNext(data.originFrameKey);
        }
      });

      function createStateScope(frameSet) {
        var stateScope = $scope.$new(true);
        _.extend(stateScope, {input: {}, outcome: {}, triggered: {}, completed: {}});
        stateScope.frameSet = frameSet;
        var unwatch = [
          $scope.$watch('frameKey', function(value) {stateScope.frameKey = value;}),
        ];
        stateScope.$on('$destroy', function() {_.each(unwatch, function(f) {f();});});
        if (frameSet === 'frames') {
          fire.connect(stateScope, {
            input: {bind: 'users/{{stateUserKey}}/states/{{frameKey}}/input', pathScope: $scope},
            outcome: {
              bind: 'users/{{stateUserKey}}/states/{{frameKey}}/outcome', pathScope: $scope},
            triggered: {
              bind: 'users/{{stateUserKey}}/states/{{frameKey}}/triggered', pathScope: $scope},
            completed: {bind: 'users/{{stateUserKey}}/completions', pathScope: $scope}
          });
        }
        return stateScope;
      }

      var frameStateScope = createStateScope('frames');

      $scope.switchMode = function(mode) {
        $scope.mode = mode;
      };

      $scope.$watch('mode', function(mode) {
        switch(mode) {
          case 'explore':
            if ($scope.stateScope && $scope.stateScope !== frameStateScope) {
              $scope.stateScope.$destroy();
            }
            $scope.stateScope = frameStateScope;
            break;
          case 'edit':
            if (!$scope.stateScope || $scope.stateScope === frameStateScope) {
              $scope.stateScope = createStateScope('drafts');
            }
            if (!$scope.draft) $scope.draft = angular.copy($scope.frame);
            break;
          case 'preview':
            syncDraftTidbitKeys();
            if ($scope.stateScope && $scope.stateScope !== frameStateScope) {
              $scope.stateScope.$destroy();
            }
            $scope.stateScope = createStateScope('drafts');
            break;
        }
      });

      function detectDuplicateTidbits() {
        var tidbitIds = {};
        var duplicateTidbitIds = [];
        _.each($scope.draft.tidbits, function(tidbit) {
          if (tidbit.id in tidbitIds) {
            duplicateTidbitIds.push(tidbit.id);
          } else {
            tidbitIds[tidbit.id] = tidbit;
          }
        });
        if (duplicateTidbitIds.length) {
          alert('Duplicate tidbit ids: ' + duplicateTidbitIds.join(', '));
          return true;
        }
        return false;
      }

      function syncDraftTidbitKeys() {
        if (!$scope.draft) {
          handles.draft.ready().then(function() {
            syncDraftTidbitKeys();
          });
          return;
        }
        if (!$scope.draft.tidbits || detectDuplicateTidbits()) return;
        var badPairs = _.filter(_.pairs($scope.draft.tidbits), function(pair) {
          return pair[1] && pair[1].id !== pair[0];
        });
        _.each(badPairs, function(pair) {
          $scope.draft.tidbits[pair[1].id] = angular.copy(pair[1]);
          $scope.draft.tidbits[pair[0]] = null;
          $scope.expandedTidbits[pair[1].id] = $scope.expandedTidbits[pair[0]];
        });
      }

      function zeroDraftTidbitOrders() {
        _.each($scope.draft.tidbits, function(tidbit) {
          if (tidbit) tidbit.order = 0;
        });
      }

      $scope.publish = function() {
        syncDraftTidbitKeys();
        zeroDraftTidbitOrders();
        $scope.frame = angular.copy($scope.draft);
        var childrenKeys = {};
        _.each($scope.draft.children, function(child) {
          if (!child.archived) childrenKeys[child.frameKey] = 1;
        });
        fire.ref($scope, 'graph/{{frameKey}}/childKeys').set(childrenKeys);
        $scope.mode = 'explore';
      };

      $scope.isDraftChanged = function() {
        return !angular.equals($scope.frame, $scope.draft);
      };

      $scope.getSortedDraftTidbits = function(purpose) {
        _.each($scope.draft && $scope.draft.tidbits, function(tidbit, key) {
          if (tidbit) tidbit.$key = key;
        });
        return _.chain($scope.draft && $scope.draft.tidbits)
          .values().compact()
          .select(function(tidbit) {
            return ($scope.showArchived.tidbits || !tidbit.archived) && tidbit.purpose === purpose;
          })
          .sortBy('id').sortBy('order')
          .value();
      };

      $scope.getSortedDraftResponses = function(tidbitKey) {
        return _.select(fire.toArrayOrderedByKey(
          $scope.draft && $scope.draft.tidbits && $scope.draft.tidbits[tidbitKey] &&
          $scope.draft.tidbits[tidbitKey].responses), function(response) {
            return $scope.showArchived.tidbits || !response.archived;
        });
      };

      $scope.addTidbit = function() {
        // Try to find a unique synthetic tidbit id.  It's not foolproof due to race conditions, but
        // we'll catch any duplicates at publishing time anyway.  At worst, there will be some
        // responses uploaded with bogus ids whose media will get swept away later.
        var maxNumber = 0;
        _.each($scope.draft && $scope.draft.tidbits, function(tidbit) {
          var match = tidbit.id.match(/^t(\d+)$/);
          if (match) maxNumber = Math.max(maxNumber, parseInt(match[1]));
        });
        var tidbitRef = handles.draft.ref('tidbits').push(
          {id: 't' + (maxNumber + 1), order: user.now(), purpose: 'advice'});
        $scope.expandedTidbits[tidbitRef.name()] = true;
      };

      $scope.deleteTidbit = function(tidbitKey) {
        $scope.draft.tidbits[tidbitKey] = null;
      };

      $scope.isTidbitPublished = function(tidbitKey) {
        return $scope.frame.tidbits && tidbitKey in $scope.frame.tidbits;
      };

      $scope.isResponsePublished = function(tidbitKey, responseKey) {
        return $scope.frame.tidbits && $scope.frame.tidbits[tidbitKey] &&
          $scope.frame.tidbits[tidbitKey].responses &&
          responseKey in $scope.frame.tidbits[tidbitKey].responses;
      };

      $scope.editResponse = function(tidbitKey, responseKey) {
        modal.activate('responseEditor', {
          frameKey: $scope.frameKey, tidbitKey: tidbitKey, responseKey: responseKey
        });
      };

      $scope.addResponse = function(tidbitKey) {
        tidbitKey = $scope.draft.tidbits[tidbitKey].id;
        syncDraftTidbitKeys();
        // Need to let the sync propagate out to Firebase before pushing.
        $timeout(function() {
          var responseRef = handles.draft.ref(
            'tidbits', tidbitKey, 'responses').push({authorKey: user.currentUserKey});
          $scope.editResponse(tidbitKey, responseRef.name());
        });
      };

      $scope.deleteResponse = function(tidbitKey, responseKey) {
        $scope.draft.tidbits[tidbitKey].responses[responseKey] = null;
      };

      $scope.getSortedDraftChildren = function() {
        _.each($scope.draft && $scope.draft.children, function(child, key) {
          if (child) child.$key = key;
        });
        return _.chain($scope.draft && $scope.draft.children)
          .values().compact()
          .select(function(child) {return $scope.showArchived.children || !child.archived;})
          .sortBy('order')
          .value();
      };

      $scope.addChild = function(frameKey) {
        if (_.some($scope.draft.children, function(child) {
            return child && child.frameKey === frameKey;
        })) {
          alert('This skill is already listed (may be archived).');
          return;
        }
        var order = user.now();
        var childRef = handles.draft.ref('children').push({frameKey: frameKey, order: order});
        handles.draft.ref('tidbits', frameKey).set(
          {id: frameKey, order: order, question: 'Why this?', purpose: 'transition'});
        $scope.expandedChildren[childRef.name()] = true;
      };

      $scope.deleteChild = function(childKey, frameKey) {
        $scope.draft.children[childKey] = null;
        $scope.draft.tidbits[frameKey] = null;
      };

      $scope.moveChild = function(childIndex, step) {
        var childrenArray = $scope.getSortedDraftChildren($scope.showArchived.children);
        var oldOrder = childrenArray[childIndex].order;
        childrenArray[childIndex].order = childrenArray[childIndex + step].order;
        childrenArray[childIndex + step].order = oldOrder;
      };

      $scope.archiveChild = function(childKey, value) {
        var child = $scope.draft.children[childKey];
        if (child) {
          child.archived = value;
          var tidbit = $scope.draft.tidbits[child.frameKey];
          if (tidbit) tidbit.archived = value;
        }
      };

      $scope.visitChild = function(frameKey) {
        $scope.$emit('frameAdded', frameKey, undefined, true);
      };

      $scope.isChildPublished = function(childKey) {
        return $scope.frame.children && childKey in $scope.frame.children;
      };
    },
  };
})

.directive('lfFrameContent', function($compile, $timeout, fire, director, analyzerUtils) {
  'use strict';
  // Inherits scope from lf-frame.  Requires attribute value of 'frame' or 'draft'.
  return {
    scope: true,
    link: function($scope, element, attrs) {
      var contentScope;

      function bindContent(content) {
        if (!$scope.stateScope) {
          var unwatch = $scope.$watch('stateScope', function() {
            unwatch();
            bindContent(content);
          });
          return;
        }
        element.html(content);
        if (contentScope) contentScope.$destroy();
        contentScope = $scope.stateScope.$new();
        $compile(element.contents())(contentScope);
        contentScope.$watch('input', runAnalyzer, true);
      }

      $scope.$watch(attrs.lfFrameContent + '.core.content', bindContent);

      function clearAnalyzeIndicatorBit() {
        $scope.stateScope._analyzing = false;
      }

      var flipTimeoutPromise;

      var runAnalyzer = _.throttle(function() {$timeout(function() {
        if ($scope.focused && $scope[attrs.lfFrameContent] && (
            $scope.mode === 'explore' || $scope.mode === 'preview')) {
          if (flipTimeoutPromise) $timeout.cancel(flipTimeoutPromise);
          $scope.stateScope._analyzing = !$scope.stateScope._analyzing;
          flipTimeoutPromise = $timeout(clearAnalyzeIndicatorBit, 200);
          // evalAnalyzer is defined at the top level, to keep its lexical scope simple.
          evalAnalyzer($scope[attrs.lfFrameContent].analyzerCode, contentScope, analyzerUtils);
          evalTriggers();
        }
      });}, 100);

      // Run the analyzer every N seconds to pick up on tidbits that weren't able to trigger because
      // another response was already playing.
      var schedulePromise;
      var scheduleAnalyzer = function() {
        if (schedulePromise || !$scope.focused) return;
        schedulePromise = $timeout(runAnalyzer, 5000, false);
        schedulePromise.then(function() {
          schedulePromise = null;
          scheduleAnalyzer();
        });
      };
      $scope.$watch('focused', function(newValue) {
        if (newValue) {
          runAnalyzer();
          scheduleAnalyzer();
        }
      });
      $scope.$on('$destroy', function() {
        if (schedulePromise) $timeout.cancel(schedulePromise);
      });

      var sustainedTriggers = {};

      function evalTriggers() {
        var responsePlaying = director.isPlaying();
        _.each($scope[attrs.lfFrameContent].tidbits, function(tidbit, tidbitKey) {
          if (!tidbit || !tidbit.responses || tidbit.archived || !tidbit.trigger ||
              (contentScope.triggered && contentScope.triggered[tidbitKey])) return;
          var triggerResult = !!contentScope.$eval(tidbit.trigger);
          var shouldPlay = false;
          if (tidbit.sustain) {
            if (tidbitKey in sustainedTriggers) {
              if (!triggerResult) {
                delete sustainedTriggers[tidbitKey];
              } else if (_.now() - sustainedTriggers[tidbitKey] >= tidbit.sustain * 1000) {
                shouldPlay = true;
              }
            } else if (triggerResult) {
              sustainedTriggers[tidbitKey] = _.now();
              $timeout(runAnalyzer, tidbit.sustain * 1000, false);
            }
          } else {
            shouldPlay = triggerResult;
          }
          if (shouldPlay && !responsePlaying) {
            responsePlaying = true;
            $scope.trigger(tidbit.id);
          }
        });
      }
    }
  };
})

.factory('completion', function($q, fire) {
  'use strict';
  var CompletionTracker = function(userKey, scope) {
    this.userKey = userKey;
    this.handles = {};
    this.completions = {};
    if (scope) {
      this.unwatch = scope.$on('$destroy', _.bind(this.destroy, this));
    }
  };

  CompletionTracker.prototype.track = function(frameKeys) {
    _.each(_.keys(this.handles), function(key) {
      if (!_.contains(frameKeys, key)) {
        this.handles[key].$destroyAll();
        delete this.handles[key];
        delete this.completions[key];
      }
    }, this);
    _.each(_.compact(frameKeys), function(key) {
      if (!_.has(this.handles, key)) {
        this.completions[key] = {};
        var pathScope = {userKey: this.userKey, frameKey: key};
        this.handles[key] = fire.connect(this.completions[key], {
          completed: {pull: 'users/{{userKey}}/completions/{{frameKey}}', pathScope: pathScope},
          ancestorCompletions: {
            pull: 'users/{{userKey}}/completions/#', viaKeys: 'graph/{{frameKey}}/ancestorKeys',
            pathScope: pathScope
          }
        });
      }
    }, this);
    return this;
  };

  CompletionTracker.prototype.ready = function() {
    var self = this;
    return $q.all(_.invoke(this.handles, '$allReady')).then(function() {return self;});
  };

  CompletionTracker.prototype.checkTracking = function(frameKey) {
    if (!_.has(this.completions, frameKey)) {
      throw new Error('Not tracking completion of ' + frameKey);
    }
  };

  CompletionTracker.prototype.getLevel = function(frameKey) {
    this.checkTracking(frameKey);
    if (this.completions[frameKey].completed) return 2;
    if (_.any(this.completions[frameKey].ancestorCompletions)) return 1;
    return 0;
  };

  CompletionTracker.prototype.getAllCompletionLevels = function() {
    var levels = {};
    _.each(_.keys(this.completions), function(frameKey) {
      levels[frameKey] = this.getLevel(frameKey);
    }, this);
    return levels;
  };

  CompletionTracker.prototype.setCompleted = function(frameKey, value) {
    this.checkTracking(frameKey);
    this.handles[frameKey].completed.ref().set(value);
  };

  CompletionTracker.prototype.toggleCompleted = function(frameKey) {
    this.checkTracking(frameKey);
    this.setCompleted(frameKey, !this.completions[frameKey].completed);
  };

  CompletionTracker.prototype.destroy = function() {
    _.each(this.handles, function(handle) {handle.$destroyAll();}, this);
    this.userKey = null;
    this.handles = {};
    this.completions = {};
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
  };

  return function(userKey, scope) {return new CompletionTracker(userKey, scope);};
})

.directive('lfCompletion', function() {
  'use strict';
  return {
    templateUrl: 'src/frame/completion.html',
    scope: {frameKey: '=lfCompletion', stateUserKey: '=', control: '@'},
    controller: function($scope, completion) {
      $scope.$watch('[frameKey, stateUserKey]', function() {
        if ($scope.completion) $scope.completion.destroy();
        $scope.completion = completion($scope.stateUserKey, $scope).track([$scope.frameKey]);
      }, true);

      $scope.toggleCompletion = function() {
        if ($scope.control === 'mutable') $scope.completion.toggleCompleted($scope.frameKey);
      };
    }
  };
})

;
