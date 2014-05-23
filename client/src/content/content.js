angular.module('learnful.content', [
  'altfire', 'learnful.components'
])

.directive('lfTidbitLink', function($timeout, fire) {
  'use strict';
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
  'use strict';
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
  'use strict';
  return {
    scope: {lfCheckmark: '&'},
    template:
      '<span ng-show="lfCheckmark()" class="fa fa-check-circle-o checkmark-true"></span>' +
      '<span ng-hide="lfCheckmark()" class="fa checkmark-false" ' +
      'ng-class="$parent._analyzing ? \'fa-circle-o\' : \'fa-dot-circle-o\'"></span>'
  };
})

.service('analyzerUtils', function() {
  'use strict';
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
