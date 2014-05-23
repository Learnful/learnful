angular.module('learnful.arena', [
  'altfire',
  'learnful',
  'learnful.frame',
  'learnful.navigation',
  'learnful.user'
])

.directive('lfArena', function($timeout, $interpolate) {
  'use strict';
  return {
    templateUrl: 'src/arena/arena.html',
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
          }};
          if (config.prod) {
            $scope.arena.core.rootFrameKey = 'f-JIaleLgoVqzl4oJJdUe';
            $scope.arena.layout = {'f-JIaleLgoVqzl4oJJdUe': {x: 0, y: 0}};
          }
        }
        if (!$scope.arena.layout) $scope.arena.layout = {};
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

      var EXTRA_CONSTRAINTS = {
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
      var CURVE_MARGIN_X = (STEP_X - SIZE_X) / 1.2;  // jshint unused:false
      var CURVE_MARGIN_Y = (STEP_Y - SIZE_Y) / 1.2;
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

;
