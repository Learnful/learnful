angular.module('learnful', ['ngCookies', 'ingredients', 'altfire'])

.constant('config', _.extend({
  audioRecorder: {workerPath: '/bower_components/Recorderjs/recorderWorker.js'}
}, window.location.hostname === 'learnful.co' ? {
  firebase: 'https://learnful.firebaseio.com/',
  s3Media: 'https://s3.amazonaws.com/learnful-media.co/'
} : {
  firebase: 'https://rebase.firebaseio.com/',
  s3Media: 'https://s3.amazonaws.com/learnful-media-dev.co/'
}))

.run(function($rootScope, $cookies, fire, config, user) {
  $(document).tooltip({
    show: {delay: 500},
    content: function() {return this.getAttribute('tooltip') || this.title;},
    items: '[title], [tooltip]'  // use 'tooltip' for dynamically bound contents
  });
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
  window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
  fire.setDefaultRoot(config.firebase);
  var currentUserKey = $cookies.learnfulFakeUserId;
  if (!currentUserKey) {
    $cookies.learnfulFakeUserId = currentUserKey = 'u' + _.random(1, 1000);
  }
  user.signIn(currentUserKey);
  // Firebase.enableLogging(true);
})

.config(function($sceDelegateProvider, config) {
  $sceDelegateProvider.resourceUrlWhitelist([
    'self',
    'blob:**',
    config.s3Media + '**'
  ]);
})

.directive('lfArena', function() {
  return {
    templateUrl: 'partials/arena.html',
    scope: {arenaKey: '@lfArena'},
    controller: function($scope, fire, user, search) {
      $scope.user = user;
      $scope.focusedFrameKey = null;
      var handles = fire.connect($scope, {
        arena: {bind: 'arenas/{{arenaKey}}/core'},
        layout: {bind: 'arenas/{{arenaKey}}/layout'},
        transform: {bind: 'arenas/{{arenaKey}}/transforms/{{user.currentUserKey}}'},
        rootFrameCore: {pull: 'frames/#/core', via: 'arenas/{{arenaKey}}/core/rootFrameKey'},
        frames: {noop: 'frames'},
        drafts: {noop: 'drafts'}
      });

      handles.layout.ready().then(function() {
        if (!$scope.layout) {
          $scope.layout = {};
        }
      });

      handles.transform.ready().then(function() {
        if (!$scope.transform) {
          $scope.transform = {
            scale: 1, offset: {left: 0, top: 0}, scaleOffset: {left: 0, top: 0}
          };
        }
      });

      $scope.$on('focused', function(event, frameKey) {$scope.focus(frameKey);});
      $scope.focus = function(frameKey) {
        $scope.focusedFrameKey = frameKey;
      };

      $scope.$on('frameAdded', function(event, frameKey) {
        event.stopPropagation();
        if (!$scope.layout[frameKey]) {
          $scope.layout[frameKey] = {
            x: -($scope.transform.offset.left + $scope.transform.scaleOffset.left),
            y: -($scope.transform.offset.top + $scope.transform.scaleOffset.top),
            width: 650, height: 500
          };
        }
      });

      this.hideFrame = $scope.hideFrame = function(frameKey) {
        $scope.layout[frameKey] = null;
      };
    },
    link: function($scope, element, attrs, controller) {

      element.find('.arena .viewport').draggable({
        cursor: '-webkit-grabbing', handle: '.viewport-handle', cancel: '.frame',
        stop: function(event, ui) {
          $scope.$apply(function() {
            $scope.transform.offset = ui.position;
          });
        }
      });
      element.find('.arena .viewport-handle').mousewheel(function(event) {
        event.preventDefault();
        $scope.$apply(function() {
          var oldScale = $scope.transform.scale;
          var newScale = $scope.transform.scale = Math.max(0.3, Math.min(
            1, $scope.transform.scale * Math.pow(1.2, event.deltaY)));
          $scope.transform.scaleOffset = {
            left: $scope.transform.scaleOffset.left +
              (event.pageX - $scope.transform.offset.left) * (oldScale - newScale),
            top: $scope.transform.scaleOffset.top +
              (event.pageY - $scope.transform.offset.top) * (oldScale - newScale)
          };
        });
      });
    }
  };
})

.directive('lfFrame', function()  {
  return {
    templateUrl: 'partials/frame.html',
    scope: {frameKey: '=lfFrame', stateUserKey: '=', layout: '=', focused: '='},
    require: '^?lfArena',
    controller: function($scope, $timeout, fire, modal, user, guidance, director) {
      $scope.mode = 'explore';  // one of: explore, edit, diff, preview
      $scope.user = user;
      $scope.expandedTidbits = {};
      $scope.expandedChildren = {};
      $scope.showArchived = {};
      var self = this;

      var handles = fire.connect($scope, {
        frame: {bind: 'frames/{{frameKey}}'},
        draft: {bind: 'drafts/{{frameKey}}'},
        draftChildren: {
          pull: 'frames/#/core', viaValues: 'drafts/{{frameKey}}/children',
          viaValueExtractor: function(child) {return child.frameKey;}
        },
        votes: {pull: 'votes/frames/{{frameKey}}'}
      });

      $scope.trigger = function(tidbitKey, preferAlternative) {
        var preferredAuthorKey = $scope.mode === 'explore' ? null : user.currentUserKey;
        guidance.trigger(
          $scope.stateScope, $scope.frameKey, tidbitKey, $scope.stateUserKey,
          preferAlternative, preferredAuthorKey);
        director.autoplayNext(tidbitKey);
      };

      function createStateScope(frameSet) {
        var stateScope = $scope.$new(true);
        _.extend(stateScope, {input: {}, outcome: {}, triggered: {}, completed: {}});
        stateScope.trigger = $scope.trigger;
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
      $scope.stateScope = frameStateScope;

      $scope.$on('trigger', function(event, args) {
        $scope.trigger(args.tidbitKey, args.preferAlternative);
      });

      $scope.focus = function() {
        $scope.$emit('focused', $scope.frameKey);
      };

      $scope.toggleEdit = function() {
        $scope.switchMode($scope.mode === 'explore' ? 'edit' : 'explore');
      };

      $scope.switchMode = function(mode) {
        switch(mode) {
          case 'explore':
            $scope.stateScope.$destroy();
            $scope.stateScope = frameStateScope;
            break;
          case 'edit':
            $scope.stateScope = createStateScope('drafts');
            if (!$scope.draft) $scope.draft = angular.copy($scope.frame);
            break;
          case 'preview':
            syncDraftTidbitKeys();
            $scope.stateScope.$destroy();
            $scope.stateScope = createStateScope('drafts');
            break;
          default:
            throw new Error('Unknown frame mode: ' + mode);
        }
        $scope.mode = mode;
      };

      function detectDuplicateTidbits() {
        tidbitIds = {};
        duplicateTidbitIds = [];
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
        _.each($scope.draft.children, function(child) {childrenKeys[child.frameKey] = 1;});
        fire.ref($scope, 'graph/{{frameKey}}/childKeys').set(childrenKeys);
        $scope.toggleEdit();
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
          {id: 't' + (maxNumber + 1), order: _.now() + user.data.clockSkew, purpose: 'advice'});
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
        var order = _.now() + user.data.clockSkew;
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

      $scope.isChildPublished = function(childKey) {
        return $scope.frame.children && childKey in $scope.frame.children;
      };
    },

    link: function($scope, element, attrs, arenaController) {
      if (arenaController) {
        $scope.hideFrame = function() {
          arenaController.hideFrame($scope.frameKey);
        };
      }
      element.children('.frame').draggable({
        handle: '.title', cancel: '.completion, .CodeMirror', stop: function(event, ui) {
          $scope.$apply(function() {
            $scope.layout.x = ui.position.left;
            $scope.layout.y = ui.position.top;
          });
        }
      }).resizable({
        handles: 'se', autoHide: true, stop: function(event, ui) {
          $scope.$apply(function() {
            $scope.layout.width = ui.size.width;
            $scope.layout.height = ui.size.height;
          });
          self.scrollToBottom();
        }
      });
    }
  };
})

.controller('lfResponseEditor', function($scope, $q, $timeout, fire, modal, user, config) {
  _.extend($scope, modal.getActiveModalData());
  $scope.user = user;

  var handles = fire.connect($scope, {
    frame: {pull: 'drafts/{{frameKey}}'},
    settings: {bind: 'users/{{user.currentUserKey}}/settings'}
  });
  handles.frame.ready().then(function() {
    $scope.response = angular.copy($scope.getResponse());
  });

  $scope.recording = {audio: false, video: false};
  var audioContext = new AudioContext();
  var audioRecorder, audioStream;

  function getMediaSources() {
    MediaStreamTrack.getSources(function(sourceInfos) {
      $scope.$apply(function() {
        $scope.sourceInfos = {audio: [], video: []};
        _.each(sourceInfos, function(sourceInfo) {
          if (!(sourceInfo.kind in $scope.sourceInfos)) return;
          sourceInfo = {
            id: sourceInfo.id, kind: sourceInfo.kind, label: sourceInfo.label || (
              sourceInfo.kind + ' ' + ($scope.sourceInfos[sourceInfo.kind].length + 1))
          };
          $scope.sourceInfos[sourceInfo.kind].push(sourceInfo);
        });
      });
    });
  }

  getMediaSources();

  $scope.isEditable = function() {
    return $scope.response && $scope.response.authorKey === user.currentUserKey;
  };
  $scope.getTidbit = function() {
    return $scope.frame.tidbits[$scope.tidbitKey];
  };
  $scope.getResponse = function() {
    var tidbit = $scope.getTidbit();
    return tidbit ? tidbit.responses[$scope.responseKey] : {};
  };

  $scope.recordAudio = function() {
    if ($scope.recording.audio) {
      stopRecordingAudio(audioStream);
    } else {
      navigator.getUserMedia(
        {audio: {optional: [{sourceId: $scope.settings.audioSourceId}]}}, startRecordingAudio,
        function(error) {alert('Unable to start recording: ' + error.name);}
      );
    }
  };

  function startRecordingAudio(stream) {
    getMediaSources();  // get again after we got media permission to fetch correct labels
    audioStream = stream;
    var source = audioContext.createMediaStreamSource(stream);
    // source.connect(audioContext.destination);
    audioRecorder = new Recorder(source, config.audioRecorder);
    $scope.$apply(function() {
      $scope.recording.audio = true;
      audioRecorder.record();
    });
  }

  function stopRecordingAudio() {
    if (audioRecorder) {
      audioRecorder.stop();
      audioRecorder.exportWAV(handleWav);
    }
    if (audioStream) {
      audioStream.stop();
      audioStream = null;
    }
  }

  function handleWav(blob) {
    $scope.$apply(function() {
      $scope.response.audio = {
        duration: (blob.size - 32) / 4 / audioRecorder.context.sampleRate,
        src: URL.createObjectURL(blob),
        blob: blob
      };
      audioRecorder.destroy();
      audioRecorder = null;
      $scope.recording.audio = false;
    });
  }

  function uploadMedia(media, filename) {
    if (!(media && media.blob)) return $q.when(null);
    var url = config.s3Media +
      [$scope.frameKey, $scope.tidbitKey, $scope.responseKey, filename].join('/');
    var deferred = $q.defer();
    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', function(event) {
      $timeout(function() {
        deferred.notify(event);
      });
    });
    xhr.addEventListener('load', function(event) {
      $timeout(function() {
        deferred.notify(event);
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          delete media.blob;
          media.src = url;
          deferred.resolve();
        } else {
          deferred.reject('' + xhr.status + ' ' + xhr.statusText);
        }
      });
    });
    xhr.addEventListener('error', function(event) {
      $timeout(function() {
        deferred.reject(xhr.statusText);
      });
    });
    xhr.addEventListener('abort', function(event) {
      $timeout(function() {
        deferred.reject('User canceled upload.');
      });
    });
    xhr.open('PUT', url);
    xhr.setRequestHeader('Cache-Control', 'public; max-age=3600');
    xhr.send(media.blob);
    return deferred.promise;
  }

  $scope.save = function() {
    $scope.mediaUploadProgress = {total: null, loaded: null};
    var latestProgressEvents = [];
    var promises = [uploadMedia($scope.response.audio, 'audio.wav')];
    _.each(promises, function(promise, index) {
      promise.then(null, null, function(event) {
        if (!$scope.mediaUploadProgress) return;
        latestProgressEvents[index] = event;
        $scope.mediaUploadProgress = {
          total: _.reduce(latestProgressEvents, function(sum, ev) {return sum + ev.total;}, 0),
          loaded: _.reduce(latestProgressEvents, function(sum, ev) {return sum + ev.loaded;}, 0)
        };
      });
    });
    $q.all(promises).then(function() {
      handles.frame.ref('tidbits', $scope.tidbitKey, 'responses', $scope.responseKey).update(
        $scope.response);
      modal.confirm();
    }, function(error) {
      alert('Upload failed: ' + error);
    }).finally(function() {
      $scope.mediaUploadProgress = null;
    });
  };
  $scope.cancel = function() {
    modal.cancel();
  };
})

.directive('lfCompletion', function() {
  return {
    templateUrl: 'partials/completion.html',
    scope: {frameKey: '=lfCompletion', stateUserKey: '=', control: '@'},
    controller: function($scope, fire) {
      fire.connect($scope, {
        completed: {bind: 'users/{{stateUserKey}}/completions/{{frameKey}}'},
        ancestorCompletions: {
          pull: 'users/{{stateUserKey}}/completions/#', viaKeys: 'graph/{{frameKey}}/ancestorKeys'
        }
      });

      $scope.getCompletionLevel = function() {
        if ($scope.completed) return 2;
        if (_.any(_.values($scope.ancestorCompletions))) return 1;
        return 0;
      };

      $scope.toggleCompletion = function() {
        if ($scope.control === 'mutable') {
          $scope.completed = !$scope.completed;
        }
      };
    }
  };
})

.directive('lfFrameContent', function($compile, $timeout, fire, director) {
  // Inherits scope from lf-frame.  Requires attribute value of 'frame' or 'draft'.
  return {
    scope: true,
    link: function($scope, element, attrs, controller) {
      var contentScope;
      $scope.$watch(attrs.lfFrameContent + '.content', function(newValue) {
        element.html(newValue);
        if (contentScope) contentScope.$destroy();
        contentScope = $scope.stateScope.$new();
        $compile(element.contents())(contentScope);
        contentScope.$watch('input', runAnalyzer, true);
      });

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
          evalAnalyzer($scope[attrs.lfFrameContent].analyzerCode, contentScope);
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
              } else if (_.now() - sustainedTriggers[tidbitKey] >= tidbit.sustain) {
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

.directive('lfCodeEditor', function($timeout) {
  return {
    require: '?ngModel',
    scope: {model: '=ngModel'},
    link: function($scope, element, attrs, ngModel) {
      if (!$scope.model) {
        $scope.model = element.text().trim();
        if ($scope.model.indexOf('\n') !== -1) $scope.model += '\n';
      }
      element.html('');

      var options = {mode: attrs.mode};
      if (attrs.mode === 'javascript-expression')  {
        _.extend(options, {
          mode: 'javascript',
          lineWrapping: true
        });
      } else if (attrs.mode === 'javascript') {
        _.extend(options, {
          matchBrackets: true,
          lint: true,
          lineNumbers: true,
          gutters: ['CodeMirror-lint-markers']
        });
      } else if (attrs.mode === 'htmlmixed') {
        _.extend(options, {
          matchTags: true,  // TODO: doesn't work?
          lineWrapping: true
        });
      } else if (!attrs.mode) {
        options.lineWrapping = true;
      }
      var codeMirror = CodeMirror(element.get()[0], options);

      attrs.$observe('disabled', function(value) {
        codeMirror.setOption('readOnly', value ? 'nocursor': false);
      });

      if (!ngModel) return;

      ngModel.$render = function() {
        $timeout(function() {codeMirror.setValue(ngModel.$viewValue || '');});
      };

      codeMirror.on('change', function() {
        $scope.$apply(function() {
          ngModel.$setViewValue(codeMirror.getValue());
        });
      });
    }
  };
})

.directive('lfChatroom', function() {
  return {
    templateUrl: 'partials/chatroom.html',
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
        tidbitMessages: {
          pull: 'chats/personalTidbits/{{stateUserKey || user.currentUserKey}}/{{frameSet}}/' +
                '{{frameKey}}/messages'
        }
      });

      var presenceReg, destroyed = false;
      function updatePresence() {
        if ($scope.connected) {
          if ($scope.presence && user.currentUserKey && (
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
            return !!maxedKinds.length;
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
            if (tidbit.findable && tidbit.question && tidbit.responses) {
              choices[tidbitKey] = tidbit.question;
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
        $scope.sendTidbit(item.value);
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
      scrollToBottom = _.partial(_.defer, function() {
        if (!manualScroll) chatHistory.animate({scrollTop: chatHistory.prop('scrollHeight')}, 400);
      });
      $scope.$watchCollection('messages', scrollToBottom);
      $scope.$watchCollection('tidbitMessages', scrollToBottom);
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

.directive('lfAvatar', function() {
  return {
    templateUrl: 'partials/avatar.html',
    scope: {userKey: '=lfAvatar', format: '@'},
    controller: function($scope, fire) {
      fire.connect($scope, {
        persona: {pull: 'users/{{userKey}}/persona'}
      });
    }
  };
})

.factory('user', function($rootScope, fire) {
  var self = {data: $rootScope.$new(true)};
  var handles;

  self.signIn = function(userKey) {
    if (handles) handles.$destroyAll();
    self.currentUserKey = self.data.currentUserKey = userKey;
    self.data.persona = {
      name: 'Guest ' + userKey,
      avatar: 'https://robohash.org/' + userKey + '.png?set=set3&size=40x40'
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

  return self;
})

.directive('lfFrameFinder', function(fire, search) {
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
        var stub = {core: {title: title}, content: 'To be filled in...'};
        var frameKey = handles.frames.ref().push(stub).name();
        handles.drafts.ref(frameKey).set(stub);
        return frameKey;
      }

      var createFrameLabelPrefix = '**Create**: ';

      $scope.matchFrames = function(term, callback) {
        fire.connect($scope, {
          frames: {once: 'frames'}
        }).$allReady().then(function(result) {
          var choices = {};
          _.each(result.frames, function(frame, frameKey) {
            choices[frameKey] = frame.core.title;
          });
          items = search.find(term, choices, 5);
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
        var frameKey = item.value;
        if (frameKey === '#create') {
          frameKey = createFrame(item.label.slice(createFrameLabelPrefix.length));
        }
        $scope.$emit('frameAdded', frameKey);
        $scope.selectCallback({frameKey: frameKey});
      });

    }
  };
})

.factory('guidance', function(fire, user) {
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
      stateScope, frameKey, tidbitKey, userKey, preferAlternative, preferredAuthorKey) {
    if (!stateScope.triggered[tidbitKey]) {
      // Mark as triggered before blocking on data, so we don't end up triggering twice.
      stateScope.triggered[tidbitKey] = {$triggered: true};
    }
    var handles = fire.connect(
      {
        userKey: userKey,
        frameSet: stateScope.frameSet,
        frameKey: frameKey,
        tidbitKey: tidbitKey
      },
      {
        responses: {once: '{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses'},
        votes: {once: 'votes/{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/responses'},
        triggered: {noop: 'users/{{userKey}}/states/{{frameKey}}/triggered/{{tidbitKey}}'},
        messages: {noop: 'chats/personalTidbits/{{userKey}}/{{frameSet}}/{{frameKey}}/messages'},
      }
    );
    handles.$allReady().then(function(result) {
      if (!result.responses) return;
      var responseKey = selectResponse(
        result.responses, result.votes, stateScope.triggered, preferAlternative,
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
        responseState.lastTriggerTime = _.now();
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

  return self;
})

.factory('search', function() {
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

.factory('director', function() {
  var self = {};

  var currentPlayer;
  var autoplayToken;

  function handlePlay(event) {
    if (currentPlayer) currentPlayer.pause();
    currentPlayer = event.target;
  }

  function handleStop(event) {
    if (event.target === currentPlayer) currentPlayer = null;
  }

  self.register = function(mediaElement, token) {
    mediaElement.on('playing', handlePlay);
    mediaElement.on('pause ended', handleStop);
    mediaElement.attr('preload', 'none');
    if (token && token === autoplayToken) {
      autoplayToken = null;
      mediaElement.attr('autoplay', '');
    }
  };

  self.autoplayNext = function(token) {
    autoplayToken = token;
  };

  self.isPlaying = function() {
    return !!currentPlayer;
  };

  return self;
})

.directive('lfDirectorMedia', function(director) {
  return function($scope, element, attrs, controller) {
    director.register(element, attrs.lfDirectorMedia);
  };
})

.directive('lfAutocomplete', function($timeout) {
  return function($scope, element, attrs, controller) {
    element.autocomplete({
      source: function(request, response) {
        $scope[attrs.lfAutocomplete](request.term, response);
      },
      position: attrs.acPosition ? $scope.$eval(attrs.acPosition) : undefined,
      select: function(event, ui) {
        $scope.$apply(function() {
          if ($scope.$emit('ac-select', ui.item).defaultPrevented) {
            event.preventDefault();
          }
        });
      },
      focus: function(event, ui) {
        $scope.$apply(function() {
          if ($scope.$emit('ac-focus', ui.item).defaultPrevented) {
            event.preventDefault();
          }
        });
      }
    });
  };
})

.filter('duration', function() {
  return function(input) {
    if (!input) return null;
    var secs = Math.round(input % 60);
    var mins = Math.floor(input / 60);
    return (mins ? '' + mins + 'm' : '') + secs + 's';
  };
})

.filter('wordCount', function() {
  return function(input) {
    if (!input) return null;
    return input.trim().split(/\s+/).length;
  };
})

.directive('lfTidbitLink', function($timeout, fire) {
  return {
    scope: true,
    link: function($scope, element, attrs, controller) {
      element.filter('a').attr('href', '');
      element.addClass('tidbit-link');
      if (!element.html().trim()) {
        attrs.$observe('lfTidbitLink', function(value) {
          $scope.tidbitKey = value;
        });
        // Give time for frameKey and tidbitKey to settle to avoid spurious "bad path" warnings.
        $timeout(function() {
          fire.connect($scope, {
            question: {pull: '{{frameSet}}/{{frameKey}}/tidbits/{{tidbitKey}}/question'}
          });
        });
        $scope.$watch('question', function(value) {
          element.text(value);
        });
      }
      element.on('click', function(event) {
        event.preventDefault();
        $scope.trigger(attrs.lfTidbitLink);
      });
    }
  };
})

.directive('lfCheckmark', function() {
  return {
    scope: {lfCheckmark: '&'},
    template:
      '<span ng-show="lfCheckmark()" class="fa fa-check-circle-o checkmark-true"></span>' +
      '<span ng-hide="lfCheckmark()" class="fa checkmark-false" ng-class="$parent._analyzing ? \'fa-circle-o\' : \'fa-dot-circle-o\'"></span>'
  };
})

;

function evalAnalyzer(code, scope) {
  var mask = {scope: scope};
  for (p in this) {
    if (p !== '_') mask[p] = undefined;
  }
  (new Function(
    'with(this) {' +
    'var input=scope.input, outcome=scope.outcome, triggered=scope.triggered, ' +
    'completed=scope.completed;' + code + '}'
  )).call(mask);
}
