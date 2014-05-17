angular.module('learnful', ['ngCookies', 'ingredients', 'altfire'])

.constant('config', _.extend({
  audioRecorder: {workerPath: '/bower_components/Recorderjs/recorderWorker.js'},
}, window.location.hostname.match(/.?learnful.co$/) ? {
  prod: true,
  firebase: 'https://learnful.firebaseio.com/',
  s3Media: 'https://s3.amazonaws.com/learnful-media.co/'
} : {
  prod: false,
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

.controller('lfRoot', function($scope, fire, user) {
  $scope.user = user;
  $scope.currentArenaKey = 'a-' + user.currentUserKey;
  var handles = fire.connect($scope, {
    currentArenaKey: {bind: 'users/{{user.currentUserKey}}/currentArenaKey'}
  });
})

.directive('lfArena', function($timeout, $interpolate) {
  return {
    templateUrl: 'partials/arena.html',
    scope: {arenaKey: '=lfArena'},
    controller: function($scope, $q, fire, user, search, config) {
      $scope.user = user;
      $scope.notesToggle = false;
      $scope.view = null;  // choices: overview, detail

      var handles = fire.connect($scope, {
        arena: {bind: 'arenas/{{arenaKey}}'},
        arenaStates: {bind: 'users/{{user.currentUserKey}}/arenaStates/{{arenaKey}}'},
        graph: {pull: 'graph/#', viaKeys: 'arenas/{{arenaKey}}/layout'},
        rootFrameCore: {pull: 'frames/#/core', via: 'arenas/{{arenaKey}}/core/rootFrameKey'},
        draftChildren: {pull: 'drafts/#/children', viaKeys: 'arenas/{{arenaKey}}/layout'}
      });

      $q.all(handles.arena.ready(), handles.arenaStates.ready()).then(function() {
        if (!$scope.arena) {
            $scope.arena = {core: {
            ownerKey: user.currentUserKey,
            rootFrameKey: config.prod ? 'f-JIaleLgoVqzl4oJJdUe' : 'f1'
          }};
        }
        if (!$scope.arena.layout) {
          $scope.arena.layout = {};
          $scope.arena.layout[config.prod ? 'f-JIaleLgoVqzl4oJJdUe' : 'f1'] = {x: 0, y: 0};
        }
        if (!$scope.arenaStates) $scope.arenaStates = {frames: {}};
        if ($scope.arenaStates.focusedFrameKey &&
            !$scope.arena.layout[$scope.arenaStates.focusedFrameKey]) {
          $scope.arenaStates.focusedFrameKey = null;
        }
        $scope.focusedFrameKey = $scope.arenaStates.focusedFrameKey;
        $scope.view = $scope.focusedFrameKey ? 'detail' : 'overview';
        _.each($scope.arena.layout, function(layout, frameKey) {
          if (!$scope.arenaStates.frames[frameKey]) $scope.arenaStates.frames[frameKey] = {};
          if (!$scope.arenaStates.frames[frameKey].mode) {
            $scope.arenaStates.frames[frameKey].mode = 'explore';
          }
        });
      });

      $scope.$on('focused', function(event, frameKey) {$scope.focus(frameKey);});
      $scope.focus = function(frameKey) {
        if (frameKey && $scope.view !== 'neighborhood' && $scope.focusedFrameKey &&
            $scope.arena.layout[frameKey]) {
          // Up-and-over animation to transition between two focused frames
          var fromLayout = $scope.arena.layout[$scope.focusedFrameKey];
          var toLayout = $scope.arena.layout[frameKey];
          $scope.transition = {
            stage: 'begin', from: $scope.focusedFrameKey, to: frameKey,
            pos: {x: (fromLayout.x + toLayout.x) / 2, y: (fromLayout.y + toLayout.y) / 2}
          };
          $scope.focusedFrameKey = null;
          $scope.view = 'overview';
          $timeout(function() {
            $scope.focusedFrameKey = $scope.arenaStates.focusedFrameKey = frameKey;
            $scope.view = 'detail';
            $scope.transition.stage = 'end';
            $timeout(function() {
              $scope.transition = null;
            }, 500);
          }, 500);
        } else {
          $scope.focusedFrameKey = $scope.arenaStates.focusedFrameKey = frameKey || null;
          $scope.view = frameKey ? 'detail' : 'overview';
        }
      };

      $scope.toggleEdit = function() {
        $scope.arenaStates.frames[$scope.focusedFrameKey].mode =
          $scope.arenaStates.frames[$scope.focusedFrameKey].mode === 'explore' ?
            'edit' : 'explore';
      };

      $scope.hideFrame = function(frameKey) {
        $scope.arena.layout[frameKey] = null;
        $scope.arenaStates.frames[frameKey] = null;
        if ($scope.focusedFrameKey === frameKey) focus();
      };

      $scope.selectFrame = function(frameKey) {
        if ($scope.focusedFrameKey) {
          $scope.$broadcast('transition', {
            originFrameKey: $scope.focusedFrameKey, targetFrameKey: frameKey});
        } else {
          $scope.focus(frameKey);
        }
      };

      $scope.$on('frameAdded', function(event, frameKey, mode, focus) {
        event.stopPropagation();
        // Let any data changes caused by the addition propagate, so we compute the right layout
        // constraints.
        $timeout(function() {
          if (!$scope.arena.layout[frameKey] && $scope.bounds) {
            var oldView = $scope.view;
            $scope.view = 'overview';
            $scope.updateLayoutBounds();
            var constraints = gatherConstraints(frameKey);
            $scope.arena.layout[frameKey] = findBestLocation(constraints);
            $scope.arenaStates.frames[frameKey] = {};
            mode = mode || 'explore';
            $scope.view = oldView;
            $scope.updateLayoutBounds();
          }
          if (mode) $scope.arenaStates.frames[frameKey].mode = mode;
          if (focus) $scope.focus(frameKey);
        });
      });

      $scope.$on('completeTransition', function(event, data) {
        if (!data.reflected) {
          data.reflected = true;
          // Bounce the transition back down, so it can find its target frame.
          $scope.$broadcast('completeTransition', data);
        }
      });

      EXTRA_CONSTRAINTS = {
        larger: function(pos) {return (pos.y < 0 && Math.abs(pos.x) < Math.abs(pos.y)) ? 0 : 100;},
        smaller: function(pos) {return (pos.y > 0 && Math.abs(pos.x) < pos.y) ? 0 : 100;},
        similar: function(pos) {return (pos.x > 0 && pos.x > Math.abs(pos.y)) ? 0 : 100;},
        different: function(pos) {
          return (pos.x < 0 && Math.abs(pos.x) > Math.abs(pos.y)) ? 0 : 100;}
      };

      $scope.$on('showNeighbors', function(event, frameKey) {
        $scope.focusedFrameKey = frameKey;
        $scope.view = 'neighborhood';
        $scope.neighborLayout = {};
        $scope.neighborLayout[frameKey] = {x: 0, y: 0};
        _.each($scope.graph[frameKey].parentKeys, function(unused, parentKey) {
          $scope.updateLayoutBounds();
          var constraints = gatherConstraints(parentKey);
          constraints.push(EXTRA_CONSTRAINTS.larger);
          $scope.neighborLayout[parentKey] = findBestLocation(constraints);
          $scope.arenaStates.frames[parentKey] = {mode: 'explore'};
        });
        _.each($scope.graph[frameKey].childKeys, function(unused, childKey) {
          $scope.updateLayoutBounds();
          var constraints = gatherConstraints(childKey);
          constraints.push(EXTRA_CONSTRAINTS.smaller);
          $scope.neighborLayout[childKey] = findBestLocation(constraints);
          $scope.arenaStates.frames[childKey] = {mode: 'explore'};
        });
      });

      $scope.getLayout = function() {
        return $scope.view === 'neighborhood' ?
          $scope.neighborLayout : $scope.arena && $scope.arena.layout;
      };

      function distance(pos1, pos2) {
        if (_.isObject(pos1) && _.isObject(pos2)) {
          return Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2);
        } else {
          return Math.pow(pos1 - pos2, 2);
        }
      }

      function gatherConstraints(newFrameKey) {
        var constraints = [];
        constraints.push(function(pos) {
          return distance(pos, {x: 0, y: 0}) * 0.2;
        });
        _.each($scope.getLayout(), function(layout, frameKey) {
          var edges = $scope.graph[frameKey];
          var isDescendant = edges && edges.descendantKeys && edges.descendantKeys[newFrameKey];
          var isAncestor = edges && edges.ancestorKeys && edges.ancestorKeys[newFrameKey];
          if (isDescendant) {
            constraints.push(function(pos) {
              if (pos.y > layout.y) {
                return -1 / distance(pos.y, layout.y) * 10;
              } else {
                return (distance(pos.y, layout.y) + 1) * 10;
              }
            });
          }
          if (isAncestor) {
            constraints.push(function(pos) {
              if (pos.y < layout.y) {
                return -1 / distance(pos.y, layout.y) * 10;
              } else {
                return (distance(pos.y, layout.y) + 1) * 10;
              }
            });
          }
          if (isDescendant || isAncestor) {
            constraints.push(function(pos) {
              return distance(pos.x, layout.x) * 2;
            });
          }
          var isDraftChild = _.some($scope.draftChildren[frameKey], function(child) {
            return child.frameKey === newFrameKey;
          });
          if (isDraftChild && !isDescendant) {
            constraints.push(function(pos) {
              if (pos.y > layout.y) {
                return -1 / distance(pos.y, layout.y) * 5;
              } else {
                return (distance(pos.y, layout.y) + 1) * 5;
              }
            });
            if (!isAncestor) {
              constraints.push(function(pos) {
                return distance(pos.x, layout.x) * 1;
              });
            }
          }
        });
        return constraints;
      }

      function findBestLocation(constraints) {
        var occupied = {};
        _.each($scope.getLayout(), function(layout) {
          occupied[layout.x + ',' + layout.y] = true;
        });
        var wholeMinX = Math.floor($scope.bounds.minX) === $scope.bounds.minX;
        var wholeMaxX = Math.floor($scope.bounds.maxX) === $scope.bounds.maxX;
        var minX = [
          $scope.bounds.minX - (wholeMinX ? 1 : 0.5), $scope.bounds.minX - (wholeMinX ? 0.5 : 1)];
        var maxX = [
          $scope.bounds.maxX + (wholeMaxX ? 1 : 0.5), $scope.bounds.maxX + (wholeMaxX ? 0.5 : 1)];
        var bestPos, bestScore;
        for (var y = $scope.bounds.minY - 1; y <= $scope.bounds.maxY + 1; y++) {
          var parity = Math.abs(y % 2);
          for (var x = minX[parity]; x <= maxX[parity]; x++) {
            if (occupied[x + ',' + y]) continue;
            var pos = {x: x, y: y};
            var score = sumConstraints(constraints, pos);
            if (_.isUndefined(bestScore) || score < bestScore) {
              bestPos = pos;
              bestScore = score;
            }
          }
        }
        return bestPos;
      }

      function sumConstraints(constraints, pos) {
        return _.reduce(constraints, function(sum, fn) {return sum + fn(pos);}, 0);
      }

    },

    link: function($scope, element, attrs, controller) {

      var SIZE_X = 600, STEP_X = SIZE_X * 1.33, HALF_X = SIZE_X / 2;
      var SIZE_Y = 400, STEP_Y = SIZE_Y * 1.33, HALF_Y = SIZE_Y / 2;
      var MARGIN_X = 30, MARGIN_Y = 30;
      var CURVE_MARGIN_X = (STEP_X - SIZE_X) / 1.2, CURVE_MARGIN_Y = (STEP_Y - SIZE_Y) / 1.2;
      var viewport = element.find('.viewport');
      var loading = element.find('.loading');
      var canvas = element.find('.frame-connections').get(0);
      var ctx = canvas.getContext('2d');

      $scope.updateLayoutBounds = function() {
        var b = {minX: 0, maxX: 0, minY: 0, maxY: 0};
        _.each($scope.getLayout(), function(a) {
          if (!a) return;
          b = {
            minX: Math.min(b.minX, a.x), maxX: Math.max(b.maxX, a.x),
            minY: Math.min(b.minY, a.y), maxY: Math.max(b.maxY, a.y)
          };
        });
        b.spanX = b.maxX - b.minX;
        b.spanY = b.maxY - b.minY;
        b.centerX = b.spanX / 2 + b.minX;
        b.centerY = b.spanY / 2 + b.minY;
        $scope.bounds = b;
      };

      function computeViewportStyle() {
        var wx = viewport.innerWidth(), wy = viewport.innerHeight();
        if ($scope.view === 'overview' || $scope.view === 'neighborhood') {
          var scaleX = Math.min(
            0.65, (wx - MARGIN_X * 2) / ($scope.bounds.spanX * STEP_X + SIZE_X));
          var scaleY = Math.min(
            0.65, (wy - MARGIN_Y * 2) / ($scope.bounds.spanY * STEP_Y + SIZE_Y));
          var center = $scope.transition ?
            $scope.transition.pos : {x: $scope.bounds.centerX, y: $scope.bounds.centerY};
          var transformOrigin = $interpolate('{{cx}}px {{cy}}px')({
            cx: center.x * STEP_X, cy: center.y * STEP_Y
          });
          var transform1 = $interpolate('translate({{tx}}px,{{ty}}px) scale({{scale}})')({
            scale: Math.min(scaleX, scaleY),
            tx: -center.x * STEP_X + wx / 2,
            ty: -center.y * STEP_Y + wy / 2
          });
          return {
            'transform-origin': transformOrigin, '-webkit-transform-origin': transformOrigin,
            transform: transform1, '-webkit-transform': transform1,
          };
        } else if ($scope.view === 'detail') {
          var frameLayout = $scope.arena.layout[$scope.focusedFrameKey];
          var transform2 = $interpolate('translate({{tx}}px,{{ty}}px) scale(1)')({
            tx: -frameLayout.x * STEP_X + wx / 2,
            ty: -frameLayout.y * STEP_Y + wy / 2
          });
          return {
            transform: transform2, '-webkit-transform': transform2,
          };
        }
      }

      function computeFrameWrapperStyle(frameKey, layout) {
        if (!layout) return;
        var wx = viewport.innerWidth(), wy = viewport.innerHeight();
        var cx = layout.x * STEP_X, cy = layout.y * STEP_Y;
        if ($scope.view === 'detail' && frameKey === $scope.focusedFrameKey) {
          var width = Math.min(1200, wx - MARGIN_X * 2);
          var height = wy - MARGIN_Y * 2;
          var transform1 = $interpolate('translate({{tx}}px,{{ty}}px)')({
            tx: cx - width / 2, ty: cy - height / 2
          });
          return {
            transform: transform1, '-webkit-transform': transform1,
            width: width, height: height
          };
        } else {
          var transform2 = $interpolate('translate({{tx}}px,{{ty}}px)')({
            tx: cx - HALF_X, ty: cy - HALF_Y
          });
          return {
            transform: transform2, '-webkit-transform': transform2,
            width: SIZE_X, height: SIZE_Y
          };
        }
      }

      function drawNeighborhoodDividers(offsetX, offsetY) {
        var focusLayout = $scope.getLayout()[$scope.focusedFrameKey];
        ctx.save();
        ctx.fillStyle = ctx.strokeStyle = '#4b392f';
        ctx.translate(focusLayout.x * STEP_X, focusLayout.y * STEP_Y);

        function drawRadial(x, y) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        ctx.save();
        ctx.lineWidth = 5;
        var slope = STEP_Y / STEP_X;
        drawRadial(offsetX, slope * offsetX);
        drawRadial(offsetX, -slope * offsetX);
        drawRadial(canvas.width + offsetX, slope * (canvas.width + offsetX));
        drawRadial(canvas.width + offsetX, -slope * (canvas.width + offsetX));
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        // ctx.translate((focusLayout.x - 0.5) * STEP_X, (focusLayout.y - 0.5) * STEP_Y);
        ctx.scale(STEP_X / 2, STEP_Y / 2);
        ctx.arc(0, 0, 1, 0, 2 * Math.PI, false);
        ctx.restore();
        ctx.save();
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.clip();
        ctx.clearRect(-0.5 * STEP_X, -0.5 * STEP_Y, STEP_X, STEP_Y);
        ctx.restore();

        ctx.save();
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('LARGER', 0, -STEP_Y / 2 - 10);
        ctx.textBaseline = 'top';
        ctx.fillText('SMALLER', 0, STEP_Y / 2 + 10);
        ctx.rotate(Math.PI / 2);
        ctx.textBaseline = 'bottom';
        ctx.fillText('SIMILAR', 0, -STEP_X / 2 - 10);
        ctx.rotate(-Math.PI);
        ctx.fillText('DIFFERENT', 0, -STEP_X / 2 - 10);
        ctx.restore();

        ctx.restore();
      }

      function drawLink(sourceFrameLayout, destFrameLayout, color, opacity, lineWidth, dash) {
        color = color || '208,222,156';
        opacity = opacity || '.35';
        lineWidth = lineWidth || 50;
        ctx.save();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = 'rgba(' + color + ',' + opacity + ')';
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(sourceFrameLayout.x * STEP_X, sourceFrameLayout.y * STEP_Y + HALF_Y);
        ctx.bezierCurveTo(
          sourceFrameLayout.x * STEP_X, sourceFrameLayout.y * STEP_Y + HALF_Y + CURVE_MARGIN_Y,
          destFrameLayout.x * STEP_X, destFrameLayout.y * STEP_Y - HALF_Y - CURVE_MARGIN_Y,
          destFrameLayout.x * STEP_X, destFrameLayout.y * STEP_Y - HALF_Y
        );
        ctx.stroke();
        ctx.restore();
      }

      function drawConnections() {
        if (!($scope.arena && $scope.arenaStates)) return;
        var offsetX = $scope.bounds.minX * STEP_X - SIZE_X - MARGIN_X;
        var offsetY = $scope.bounds.minY * STEP_Y - SIZE_Y - MARGIN_Y;
        canvas.width = $scope.bounds.spanX * STEP_X + 2 * SIZE_X + 2 * MARGIN_X;
        canvas.height = $scope.bounds.spanY * STEP_Y + 2 * SIZE_Y + 2 * MARGIN_Y;
        canvas.style.left = offsetX + 'px';
        canvas.style.top = offsetY + 'px';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(-offsetX, -offsetY);

        if ($scope.view === 'neighborhood') drawNeighborhoodDividers(offsetX, offsetY);

        var layout = $scope.getLayout();
        _.each(layout, function(frameLayout, frameKey) {
          if (!frameLayout) return;
          var node = $scope.graph[frameKey];
          var childKeys = _.keys(node && node.childKeys), draftChildKeys = childKeys;
          if ($scope.arenaStates.frames[frameKey] &&
              $scope.arenaStates.frames[frameKey].mode !== 'explore') {
            draftChildKeys = _.chain($scope.draftChildren[frameKey])
              .reject(function(child) {return child.archived;})
              .pluck('frameKey')
              .value();
            childKeys = _.union(childKeys, draftChildKeys);
          }
          _.each(childKeys, function(childKey) {
            var childLayout = layout[childKey];
            if (!childLayout) return;
            var lineWidth;
            var color;
            var opacity;
            if (!_.contains(draftChildKeys, childKey)) {
              lineWidth = 25;
              color = '186,156,138';
            } else if (!(node && node.childKeys && node.childKeys[childKey])) {
              lineWidth = 25;
              color = '168,192,186';
            }
            if ($scope.transition && (
              frameKey === $scope.transition.from && childKey === $scope.transition.to ||
              frameKey === $scope.transition.to && childKey === $scope.transition.from
            )) {
              opacity = 0.9;
            }
            drawLink(frameLayout, childLayout, color, opacity, lineWidth);
          });
          _.each(node && node.descendantKeys, function(unused, descendantKey) {
            var descendantLayout = layout[descendantKey];
            if (!descendantLayout || descendantKey === frameKey ||
                node && node.childKeys && node.childKeys[descendantKey] ||
                _.some(node && node.childKeys, function(unused, childKey) {
                  return $scope.graph[childKey] && $scope.graph[childKey].descendantKeys &&
                    $scope.graph[childKey].descendantKeys[descendantKey];
                }
            )) {
              return;
            }
            drawLink(frameLayout, descendantLayout, null, null, null, [200, 20]);
          });
        });
      }

      function updateView() {
        if (!$scope.arena || !$scope.bounds || !$scope.arenaStates) return;
        $scope.viewportStyle = computeViewportStyle();
        $scope.frameWrapperStyles = {};
        _.each($scope.getLayout(), function(layout, frameKey) {
          $scope.frameWrapperStyles[frameKey] = computeFrameWrapperStyle(frameKey, layout);
        });
      }

      var firstLayout = true;

      function updateLayout() {
        if (!$scope.arena) return;
        $scope.updateLayoutBounds();
        updateView();
        drawConnections();
        if (firstLayout) {
          firstLayout = false;
          $timeout(function() {
            loading.css('opacity', 0);
            viewport.css('opacity', 1);
          }, 500, false);
        }
      }

      // Technically only need to update layout when view changes to/from neighborhood, otherwise
      // just update view.
      $scope.$watch('[view, arena.layout]', updateLayout, true);
      $scope.$watch('[focusedFrameKey, notesToggle]', updateView, true);
      $scope.$watch('[graph, draftChildren, arenaStates.frames]', drawConnections, true);
      $scope.$watch('transition', drawConnections);
      $(window).on('resize', _.throttle(function() {$timeout(updateView);}, 400));
    }
  };
})

.directive('lfFrame', function()  {
  return {
    templateUrl: 'partials/frame.html',
    scope: {frameKey: '=lfFrame', stateUserKey: '=', focused: '=', mode: '='},
    controller: function($scope, $timeout, fire, modal, user, guidance, director, completion) {
      $scope.user = user;
      $scope.stateScope = null;
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

.factory('completion', function($q, fire) {
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
  return {
    templateUrl: 'partials/completion.html',
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

.directive('lfFrameContent', function($compile, $timeout, fire, director, analyzerUtils) {
  // Inherits scope from lf-frame.  Requires attribute value of 'frame' or 'draft'.
  return {
    scope: true,
    link: function($scope, element, attrs, controller) {
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

.directive('lfCodeEditor', function($timeout) {
  return {
    require: '?ngModel',
    scope: {model: '=ngModel'},
    link: function($scope, element, attrs, ngModel) {
      if (!$scope.model && element.text().trim()) {
        $scope.model = element.text().trim();
        if ($scope.model.indexOf('\n') !== -1) $scope.model += '\n';
      }
      element.html('');

      var options = {mode: attrs.mode};
      if (attrs.placeholder) options.placeholder = attrs.placeholder;
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
          gutters: ['CodeMirror-lint-markers'],
          fixedGutter: false  // TODO: arena overview scaling (?) breaks fixed gutters
        });
      } else if (attrs.mode === 'htmlmixed') {
        _.extend(options, {
          matchTags: true,  // TODO: doesn't work?
          lineWrapping: true
        });
      } else if (!attrs.mode) {
        options.lineWrapping = true;
        element.addClass('proportional-font');
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

.factory('user', function($rootScope, fire) {
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

.factory('guidance', function($q, fire, user, completion) {
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
    var handles = fire.connect(
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
    var handles = fire.connect(
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
          element.text(value || '...');
          element.prepend('<span class="fa fa-lightbulb-o"></span>&nbsp;');
        });
      } else {
        element.prepend('<span class="fa fa-lightbulb-o"></span>&nbsp;');
      }
      element.on('click', function(event) {
        event.preventDefault();
        $scope.$emit('trigger', {tidbitKey: attrs.lfTidbitLink});
      });
    }
  };
})

.directive('lfFrameLink', function($timeout, fire) {
  return {
    scope: true,
    link: function($scope, element, attrs, controller) {
      element.filter('a').attr('href', '');
      element.addClass('frame-link');
      if (!element.html().trim()) {
        attrs.$observe('lfFrameLink', function(value) {
          $scope.targetFrameKey = value;
        });
        // Give time for frameKey to settle to avoid spurious "bad path" warnings.
        $timeout(function() {
          fire.connect($scope, {
            title: {pull: 'frames/{{targetFrameKey}}/core/title'}
          });
        });
        $scope.$watch('title', function(value) {
          element.text(value || '...');
          element.prepend('<span class="fa fa-compass"></span>&nbsp;');
        });
      } else {
        element.prepend('<span class="fa fa-compass"></span>&nbsp;');
      }
      element.on('click', function(event) {
        event.preventDefault();
        $scope.$emit('transition', {
          originFrameKey: $scope.$parent.frameKey, targetFrameKey: attrs.lfFrameLink});
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

.service('analyzerUtils', function() {
  var self = {};

  /**
   * Matches strings against a list of specs, trying to make sure each spec is fulfilled precisely
   * once.
   * @param  {Array<string> || Object} data The subject data to try to match, either as an array
   * of of strings, or an object that gives each string a key.
   *
   * @param  {Object<string, Array<string || RegExp>>} specs The specifications to try to match.
   * Each one is identified by a unique key and consists of list of patterns that must all match
   * for the condition to hold. Each pattern is either a regular expression (which will be used
   * verbatim), or a string that will be converted into a regular expression with word-boundary
   * matching and case-insentivity added.
   *
   * @param  {Object<string, ?>} options Extra options for the matcher, with their default values:
   * {stripWhitespace: false} eliminate all whitespace characters from data prior to matching.
   * {ignoreCase: true} ignore case when creating regexes from strings.
   *
   * @return {Array<string> || Object<string, string>} The results, keyed using the same keys as
   * the data argument (either array indices or object keys), with the values being the key of the
   * spec that matches the given input. If a data key doesn't appear in this result then it wasn't
   * matched.  The object also has some extra attributes:
   * {boolean} $satisfied True if all the specs were satisfied by the data.
   * {boolean} $exhausted True if $satisfied and there are no extra unmatched data strings (modulo
   * empty ones).
   * {Object<string,boolean>} $matched The spec keys that were successfully matched.
   */
  self.match = function(data, specs, options) {
    options = _.extend({stripWhitespace: false, ignoreCase: true}, options);
    var pairs = _.chain(data).pairs().sortBy(function(pair) {return pair[0];}).value();
    if (options.stripWhitespace) {
      pairs = _.map(pairs, function(pair) {
        return [pair[0], pair[1].replace(/\s+/g, '')];
      });
    }
    pairs = _.filter(pairs, function(pair) {return pair[1];});
    var results = {};
    var matched = {};
    _.each(pairs, function(pair) {
      var dataKey = pair[0], value = pair[1];
      _.each(specs, function(spec, specKey) {
        if (_.has(matched, specKey)) return;
        if (_.every(spec, function(pattern) {
          if (_.isString(pattern)) {
            pattern = new RegExp('\\b' + pattern + '\\b', options.ignoreCase ? 'i' : '');
          }
          pattern.lastIndex = 0;
          return pattern.test(value);
        })) {
          results[dataKey] = specKey;
          matched[specKey] = true;
        }
      });
    });
    if (_.isArray(data)) results = _.map(data, function(unused, index) {return results[index];});
    results.$matched = matched;
    results.$satisfied = _.size(matched) === _.size(specs);
    results.$exhausted = results.$satisfied && _.size(matched) === _.size(pairs);
    return results;
  };
  return self;
})

;

function evalAnalyzer(code, scope, analyzerUtils) {
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
}
